#!/usr/bin/env node
/**
 * generate-speaking.mjs
 * ---------------------
 * Idempotent SPEAKING content pipeline for ielts-bank.
 *
 * For every authored item under scripts/content/speaking/data/*.json it:
 *   1. Synthesises ONE examiner voice (EXAMINER_VOICE below) reading each
 *      question / cue card aloud with OpenAI TTS (24kHz mono MP3, one clip per
 *      question — NOT concatenated, so the UX can play them individually like a
 *      real interview).
 *   2. Uploads each clip to the public `listening-audio` bucket under
 *      `speaking/<slug>/<key>.mp3` (upsert) via the Storage REST API.
 *   3. Upserts the passages row (skill='speaking', module=null,
 *      status='published', source='ai-authored') + speaking_details with the
 *      part-specific jsonb (part1_questions / cue_card / part3_followups), each
 *      question carrying its audioPath (the storage path, NOT a URL).
 *
 * Everything goes through Storage + PostgREST HTTP APIs with fetch — no
 * @supabase/supabase-js dependency.
 *
 * ---------------------------------------------------------------------------
 * AUTHORED INPUT SHAPE (data/<name>.json — single object or array of objects)
 * ---------------------------------------------------------------------------
 * Common: { part:1|2|3, title, difficulty?, topicTags?[] }
 *
 * Part 1: { part:1, topic, questions:[ "text", ... 4-5 ] }
 * Part 2: { part:2, cueCard:{ topic, bullets:[3-4], explainLine },
 *           roundOff?:[ "text", ... ] }
 * Part 3: { part:3, theme, questions:[ "text", ... 5-6 ] }
 *
 * The generator assigns audio keys deterministically:
 *   Part 1  -> q1..qN                      (one per question)
 *   Part 2  -> cue (the cue card), r1..rN  (round-off questions)
 *   Part 3  -> q1..qN
 * and stores the resulting jsonb shapes documented in
 * supabase/migrations/0010_speaking_content.sql.
 *
 * USAGE
 *   node scripts/content/speaking/generate-speaking.mjs [--dry-run] [--reuse-audio] [--only=<slug-substr>]
 * Requires OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, 'data');
const OUT = join(__dirname, '.audio-cache');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const REUSE_AUDIO = argv.includes('--reuse-audio');
const ONLY = (argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
const log = (...a) => console.log('[gen-speaking]', ...a);

const TTS_MODEL = 'gpt-4o-mini-tts-2025-03-20'; // ONLY the dated id is authorised for this project
const EXAMINER_VOICE = 'onyx'; // ONE calm examiner voice for ALL speaking audio, for interview realism
const BUCKET = 'listening-audio';

// Part 2 timing defaults (seconds) — standard IELTS cue card.
const PREP_SECONDS = 60;
const SPEAK_SECONDS_MIN = 60;
const SPEAK_SECONDS_MAX = 120;

// ---- env ----
function loadEnv() {
  const ROOT = join(__dirname, '..', '..', '..');
  let raw = '';
  try {
    raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
  } catch {
    /* fall through to process.env */
  }
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  const pick = (k) => process.env[k] || env[k];
  return {
    OPENAI_API_KEY: pick('OPENAI_API_KEY'),
    SUPABASE_URL: pick('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: pick('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

// ---- slug (same algorithm as the listening/reading importers) ----
function slugify(str) {
  return (
    String(str || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'passage'
  );
}
function shortHash(input) {
  let h = 5381;
  const s = String(input);
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36).slice(0, 6);
}
// Speaking is single-module: module component of the slug hash is the empty string.
function stableSlug(title) {
  return `${slugify(title)}-${shortHash(`speaking::${title}`)}`;
}

// ---- OpenAI TTS: one text -> one MP3 buffer ----
async function ttsClip(env, text) {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: TTS_MODEL, voice: EXAMINER_VOICE, input: text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`TTS ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// ---- Storage REST ----
function storageHeaders(env, extra = {}) {
  return {
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    ...extra,
  };
}
async function objectExists(env, path) {
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'HEAD',
    headers: storageHeaders(env),
  });
  return res.ok;
}
async function uploadObject(env, path, buffer) {
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: storageHeaders(env, { 'Content-Type': 'audio/mpeg', 'x-upsert': 'true' }),
    body: buffer,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`storage upload ${res.status}: ${body.slice(0, 300)}`);
  }
  return true;
}

// ---- PostgREST helpers ----
function pgHeaders(env, extra = {}) {
  return {
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
    ...extra,
  };
}
async function pg(env, path, { method = 'GET', body, prefer, query } = {}) {
  const qs = query ? `?${query}` : '';
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}${qs}`, {
    method,
    headers: pgHeaders(env, prefer ? { Prefer: prefer } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

// ---- cue-card spoken script (examiner reads the whole card naturally) ----
function cueCardScript(cc) {
  const bullets = (cc.bullets || []).join('; ');
  const explain = String(cc.explainLine || '').trim();
  return `${cc.topic} You should say: ${bullets}. ${explain}`.replace(/\s+/g, ' ').trim();
}

// ---- build the per-item audio job list: [{ key, text }] ----
function audioJobs(item) {
  const jobs = [];
  if (item.part === 1) {
    (item.questions || []).forEach((t, i) => jobs.push({ key: `q${i + 1}`, text: String(t) }));
  } else if (item.part === 2) {
    jobs.push({ key: 'cue', text: cueCardScript(item.cueCard || {}) });
    (item.roundOff || []).forEach((t, i) => jobs.push({ key: `r${i + 1}`, text: String(t) }));
  } else if (item.part === 3) {
    (item.questions || []).forEach((t, i) => jobs.push({ key: `q${i + 1}`, text: String(t) }));
  }
  return jobs;
}

// ---- build the speaking_details jsonb from item + a key->audioPath map ----
function buildDetails(item, slug) {
  const ap = (key) => `speaking/${slug}/${key}.mp3`;
  if (item.part === 1) {
    return {
      part: 1,
      part1_questions: {
        topic: item.topic,
        questions: (item.questions || []).map((t, i) => ({ text: String(t), audioPath: ap(`q${i + 1}`) })),
      },
      cue_card: null,
      part3_followups: null,
    };
  }
  if (item.part === 2) {
    const cc = item.cueCard || {};
    return {
      part: 2,
      part1_questions: null,
      cue_card: {
        topic: cc.topic,
        bullets: cc.bullets || [],
        explainLine: cc.explainLine || '',
        prepSeconds: PREP_SECONDS,
        speakSecondsMin: SPEAK_SECONDS_MIN,
        speakSecondsMax: SPEAK_SECONDS_MAX,
        audioPath: ap('cue'),
        roundOff: (item.roundOff || []).map((t, i) => ({ text: String(t), audioPath: ap(`r${i + 1}`) })),
      },
      part3_followups: null,
    };
  }
  // part 3
  return {
    part: 3,
    part1_questions: null,
    cue_card: null,
    part3_followups: {
      theme: item.theme,
      questions: (item.questions || []).map((t, i) => ({ text: String(t), audioPath: ap(`q${i + 1}`) })),
    },
  };
}

async function upsertPassage(env, item, slug, details) {
  const passageRow = {
    slug,
    skill: 'speaking',
    module: null, // Speaking is single-module
    title: item.title,
    body_html: null,
    difficulty: item.difficulty || 'medium',
    topic_tags: item.topicTags || [],
    status: 'published',
    source: 'ai-authored',
  };
  const rows = await pg(env, 'passages', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    query: 'on_conflict=slug',
    body: passageRow,
  });
  const passageId = rows[0].id;

  await pg(env, 'speaking_details', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    query: 'on_conflict=passage_id',
    body: {
      passage_id: passageId,
      part: details.part,
      part1_questions: details.part1_questions,
      cue_card: details.cue_card,
      part3_followups: details.part3_followups,
    },
  });
  return passageId;
}

// ---- main ----
function loadItems() {
  const files = readdirSync(DATA).filter((f) => f.endsWith('.json'));
  const items = [];
  for (const f of files) {
    const parsed = JSON.parse(readFileSync(join(DATA, f), 'utf8'));
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    for (const it of arr) items.push({ ...it, __file: f });
  }
  return items;
}

async function main() {
  const env = loadEnv();
  if (!env.OPENAI_API_KEY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      '\nRefusing to run: OPENAI_API_KEY, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must all be set in .env.local.\n'
    );
    process.exit(1);
  }
  try {
    mkdirSync(OUT, { recursive: true });
  } catch {
    /* noop */
  }

  log(DRY_RUN ? 'DRY RUN — synth + no DB/Storage writes.' : 'LIVE RUN.', REUSE_AUDIO ? '(reuse-audio)' : '');
  const items = loadItems();
  const report = [];
  const summary = { total: 0, part1: 0, part2: 0, part3: 0, failed: 0, ttsClips: 0, ttsChars: 0, reusedClips: 0 };

  for (const item of items) {
    const slug = stableSlug(item.title);
    if (ONLY && !slug.includes(ONLY) && !item.__file.includes(ONLY)) continue;

    try {
      const jobs = audioJobs(item);
      let clipsSynth = 0;
      let clipsReused = 0;
      let chars = 0;
      for (const job of jobs) {
        const path = `speaking/${slug}/${job.key}.mp3`;
        const already = REUSE_AUDIO ? await objectExists(env, path) : false;
        if (already) {
          clipsReused += 1;
          continue;
        }
        const buf = await ttsClip(env, job.text);
        chars += job.text.length;
        clipsSynth += 1;
        try {
          mkdirSync(join(OUT, slug), { recursive: true });
        } catch {
          /* noop */
        }
        writeFileSync(join(OUT, slug, `${job.key}.mp3`), buf);
        if (!DRY_RUN) await uploadObject(env, path, buf);
      }
      summary.ttsClips += clipsSynth;
      summary.ttsChars += chars;
      summary.reusedClips += clipsReused;

      const details = buildDetails(item, slug);
      if (!DRY_RUN) await upsertPassage(env, item, slug, details);

      summary.total += 1;
      summary[`part${item.part}`] += 1;
      log(
        `[${slug}] part${item.part} — ${clipsSynth} synth, ${clipsReused} reused, ${chars} chars${
          DRY_RUN ? ' (dry-run, no writes)' : ' -> uploaded + upserted'
        }`
      );
      report.push({
        title: item.title,
        slug,
        part: item.part,
        clips: jobs.length,
        clipsSynth,
        clipsReused,
        ttsChars: chars,
        audioPaths: jobs.map((j) => `speaking/${slug}/${j.key}.mp3`),
        samplePublicUrl: `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/speaking/${slug}/${jobs[0]?.key}.mp3`,
      });
    } catch (e) {
      summary.failed += 1;
      console.error(`  FAILED "${item.title}" (${slug}): ${e.message}`);
      report.push({ title: item.title, slug, error: e.message });
    }
  }

  log('DONE. Summary:', JSON.stringify(summary));
  writeFileSync(join(OUT, '_report.json'), JSON.stringify({ summary, report }, null, 2));
  log('report ->', join(OUT, '_report.json'));
}

main().catch((e) => {
  console.error('[gen-speaking] fatal:', e);
  process.exit(1);
});
