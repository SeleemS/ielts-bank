#!/usr/bin/env node
/**
 * import-batch.mjs
 * ----------------
 * Idempotent importer for the shared `reading-*` and `writing*.json` lanes.
 * Specialized rdA-rdD, rich, wr and wr2 files are owned by their dedicated
 * importers and are deliberately excluded here. Each item is upserted by a
 * stable slug (children are delete+reinserted per passage, exactly like the
 * Firestore migration). Safe to re-run: same slug -> same passage, refreshed
 * children.
 *
 * Replicates the EXACT storage shape the live UI grades against (verified
 * against existing migrated rows):
 *   - true_false_notgiven / yes_no_notgiven -> answer_keys.accepted = ['true'|'false'|'not given'|'yes'|'no']
 *   - multiple_choice -> group_options (keys A/B/C/D, display_text "A) text") +
 *     answer_keys.correct_option_keys = ['B']
 *   - short_answer -> answer_keys.accepted = [...variants], word_limit set
 *
 * USAGE
 *   node --import ./scripts/_wspreload.mjs scripts/content/import-batch.mjs [--dry-run] [--only=reading|writing]
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from .env.local via _env.mjs).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './_env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, 'data');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const ONLY = (argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || null;

const log = (...a) => console.log('[import]', ...a);

// ---- slug helpers (mirror migrate-firestore-to-supabase.mjs) --------------
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
// Deterministic seed so re-runs are stable and slugs are collision-proof.
function stableSlug(skill, module, title) {
  return `${slugify(title)}-${shortHash(`${skill}:${module}:${title}`)}`;
}
function optionKeyFor(index) {
  return String.fromCharCode(65 + index); // A..; IELTS MCQ never exceeds a handful
}

// ---- transform one authored item into the relational shape ----------------
function transformReading(item) {
  const module = item.module || 'academic';
  const slug = stableSlug('reading', module, item.title);
  const passage = {
    slug,
    skill: 'reading',
    module,
    title: item.title,
    body_html: item.body_html || null,
    difficulty: item.difficulty || 'medium',
    topic_tags: item.topic_tags || [],
    status: 'published',
    source: 'ai-authored',
  };
  const groups = [];
  let globalNumber = 0;
  (item.groups || []).forEach((g, gi) => {
    const options = [];
    const questions = [];
    (g.questions || []).forEach((q, qi) => {
      globalNumber += 1;
      const answer_key = {
        accepted: [],
        correct_option_keys: [],
        spelling_variants: false,
        word_limit: null,
        normalize: 'lower_trim',
        explanation: q.evidence || null,
      };
      let optionKeys = null;
      if (g.question_type === 'multiple_choice') {
        // build per-question... but options belong to the group in IELTS.
        // Here each MCQ shares the group option list; we set group options once
        // from the FIRST question's options and key answers to letters. To keep
        // it robust for single-question-per-stem MCQ (each stem has its own 4
        // options), we store options PER question is NOT supported by schema
        // (options are group-level). So we require all MCQ in a group to share
        // options OR (typical here) each group has questions each with their own
        // 4 options -> we emit one group per MCQ question instead.
        optionKeys = q.options.map((_, i) => optionKeyFor(i));
        answer_key.correct_option_keys = [optionKeyFor(q.answer_index)];
      } else if (g.question_type === 'true_false_notgiven' || g.question_type === 'yes_no_notgiven') {
        answer_key.accepted = [String(q.answer).trim().toLowerCase()];
      } else if (g.question_type === 'short_answer') {
        answer_key.accepted = (q.accepted || []).map((s) => String(s));
        answer_key.word_limit = q.word_limit ?? null;
      }
      questions.push({
        _options: q.options || null,
        question: { position: qi, global_number: globalNumber, prompt_text: q.prompt_text || null },
        answer_key,
      });
    });
    groups.push({
      group: { position: gi, question_type: g.question_type, prompt: g.prompt || null, instructions_html: null },
      questions,
    });
  });
  return { passage, groups };
}

function transformWriting(item) {
  const module = item.module || 'academic';
  const slug = stableSlug('writing', module, item.title);
  return {
    passage: {
      slug,
      skill: 'writing',
      module,
      title: item.title,
      body_html: null,
      difficulty: item.difficulty || 'medium',
      topic_tags: item.topic_tags || [],
      status: 'published',
      source: 'ai-authored',
    },
    writing_details: {
      task: item.task || 2,
      prompt_html: item.prompt_html || '',
      chart_image_path: null,
      word_limit_min: item.word_limit_min || (item.task === 1 ? 150 : 250),
      rubric_id: null,
    },
  };
}

// ---- DB write -------------------------------------------------------------
async function upsertReading(supabase, t) {
  const { data: rows, error } = await supabase
    .from('passages')
    .upsert(t.passage, { onConflict: 'slug' })
    .select('id')
    .limit(1);
  if (error) throw new Error(`passages upsert (${t.passage.slug}): ${error.message}`);
  const passageId = rows[0].id;

  const { error: delErr } = await supabase.from('question_groups').delete().eq('passage_id', passageId);
  if (delErr) throw new Error(`group delete: ${delErr.message}`);

  // Running position so every emitted group (incl. per-stem MCQ groups) has a
  // distinct, ordered position -> stable display numbering in the UI.
  let pos = 0;
  for (const g of t.groups) {
    if (g.group.question_type === 'multiple_choice') {
      // Each MCQ stem carries its OWN 4 options -> emit ONE group per question so
      // group_options are not shared/ambiguous.
      for (const q of g.questions) {
        // Per-stem MCQ group. The live UI keys groups by their prompt string, so
        // each MCQ group prompt MUST be unique within a passage -> prefix with the
        // (stable) global question number, which also reads naturally in the UI.
        const mcPrompt = `Question ${q.question.global_number}: ${g.group.prompt}`;
        const { data: gr, error: gErr } = await supabase
          .from('question_groups')
          .insert({ passage_id: passageId, position: pos++, question_type: 'multiple_choice', prompt: mcPrompt, instructions_html: null })
          .select('id')
          .limit(1);
        if (gErr) throw new Error(`mc group insert: ${gErr.message}`);
        const groupId = gr[0].id;
        const opts = (q._options || []).map((text, i) => ({
          question_group_id: groupId,
          option_key: optionKeyFor(i),
          display_text: `${optionKeyFor(i)}) ${String(text).trim()}`,
          position: i,
        }));
        const { error: oErr } = await supabase.from('group_options').insert(opts);
        if (oErr) throw new Error(`mc options insert: ${oErr.message}`);
        const { data: qr, error: qErr } = await supabase
          .from('questions')
          .insert({ question_group_id: groupId, passage_id: passageId, ...q.question })
          .select('id')
          .limit(1);
        if (qErr) throw new Error(`mc question insert: ${qErr.message}`);
        const { error: akErr } = await supabase.from('answer_keys').insert({ question_id: qr[0].id, ...q.answer_key });
        if (akErr) throw new Error(`mc answer_key insert: ${akErr.message}`);
      }
      continue;
    }
    // non-MCQ group: single group, no options.
    const { data: gr, error: gErr } = await supabase
      .from('question_groups')
      .insert({ passage_id: passageId, ...g.group, position: pos++ })
      .select('id')
      .limit(1);
    if (gErr) throw new Error(`group insert: ${gErr.message}`);
    const groupId = gr[0].id;
    for (const q of g.questions) {
      const { data: qr, error: qErr } = await supabase
        .from('questions')
        .insert({ question_group_id: groupId, passage_id: passageId, ...q.question })
        .select('id')
        .limit(1);
      if (qErr) throw new Error(`question insert: ${qErr.message}`);
      const { error: akErr } = await supabase.from('answer_keys').insert({ question_id: qr[0].id, ...q.answer_key });
      if (akErr) throw new Error(`answer_key insert: ${akErr.message}`);
    }
  }
  return passageId;
}

async function upsertWriting(supabase, t) {
  const { data: rows, error } = await supabase
    .from('passages')
    .upsert(t.passage, { onConflict: 'slug' })
    .select('id')
    .limit(1);
  if (error) throw new Error(`passages upsert (${t.passage.slug}): ${error.message}`);
  const passageId = rows[0].id;
  const { error: wErr } = await supabase
    .from('writing_details')
    .upsert({ passage_id: passageId, ...t.writing_details }, { onConflict: 'passage_id' });
  if (wErr) throw new Error(`writing_details upsert: ${wErr.message}`);
  return passageId;
}

// ---- main -----------------------------------------------------------------
async function main() {
  const env = loadEnv();
  if (!DRY_RUN && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error('\nRefusing to run: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.\n');
    process.exit(1);
  }
  log(DRY_RUN ? 'DRY RUN — no writes.' : 'LIVE RUN — writing to Supabase.');

  let supabase = null;
  if (!DRY_RUN) {
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  const files = readdirSync(DATA).filter(
    (f) =>
      f.endsWith('.json') &&
      (f.startsWith('reading-') || f === 'writing.json' || f.startsWith('writing-batch'))
  );
  const summary = { reading: 0, readingQuestions: 0, writing: 0, writingTask1: 0, writingTask2: 0, failed: 0 };
  const slugs = { reading: [], writing: [] };
  const seenSlugs = new Set();

  for (const f of files) {
    const arr = JSON.parse(readFileSync(join(DATA, f), 'utf8'));
    for (const item of arr) {
      if (ONLY && item.skill !== ONLY) continue;
      if (item.skill === 'reading') {
        const t = transformReading(item);
        if (seenSlugs.has(t.passage.slug)) { console.error(`  DUPLICATE SLUG ${t.passage.slug} — skipping`); continue; }
        seenSlugs.add(t.passage.slug);
        const qCount = t.groups.reduce((n, g) => n + g.questions.length, 0);
        if (DRY_RUN) { log(`would upsert reading "${item.title}" slug=${t.passage.slug} (${qCount} q)`); }
        else {
          try { await upsertReading(supabase, t); log(`reading "${item.title}" -> ${t.passage.slug} (${qCount} q)`); }
          catch (e) { console.error(`  FAILED ${item.title}: ${e.message}`); summary.failed++; continue; }
        }
        summary.reading++; summary.readingQuestions += qCount; slugs.reading.push(t.passage.slug);
      } else if (item.skill === 'writing') {
        const t = transformWriting(item);
        if (seenSlugs.has(t.passage.slug)) { console.error(`  DUPLICATE SLUG ${t.passage.slug} — skipping`); continue; }
        seenSlugs.add(t.passage.slug);
        if (DRY_RUN) { log(`would upsert writing "${item.title}" slug=${t.passage.slug} (task ${t.writing_details.task})`); }
        else {
          try { await upsertWriting(supabase, t); log(`writing "${item.title}" -> ${t.passage.slug} (task ${t.writing_details.task})`); }
          catch (e) { console.error(`  FAILED ${item.title}: ${e.message}`); summary.failed++; continue; }
        }
        summary.writing++; if (t.writing_details.task === 1) summary.writingTask1++; else summary.writingTask2++;
        slugs.writing.push(t.passage.slug);
      }
    }
  }
  log('DONE. Summary:', JSON.stringify(summary));
  log('reading slugs:', JSON.stringify(slugs.reading));
  log('writing slugs:', JSON.stringify(slugs.writing.slice(0, 5)), '...');
}

main().catch((e) => { console.error('[import] fatal:', e); process.exit(1); });
