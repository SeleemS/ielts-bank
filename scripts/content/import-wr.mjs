#!/usr/bin/env node
/**
 * import-wr.mjs
 * -------------
 * Self-contained, idempotent importer for the `wr-` writing batch. Reads ONLY
 * scripts/content/data/wr-*.json and upserts each writing prompt into Supabase
 * by a stable slug. Safe to re-run: same slug -> same passage row, refreshed
 * writing_details. Mirrors the writing path of import-batch.mjs (upsert-by-slug
 * + writing_details upsert) so it can run independently of the shared importer.
 *
 * USAGE
 *   node --import ./scripts/_wspreload.mjs scripts/content/import-wr.mjs [--dry-run]
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from .env.local).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './_env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, 'data');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const log = (...a) => console.log('[import-wr]', ...a);

// ---- slug helpers (identical to import-batch.mjs for slug parity) ----------
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
function stableSlug(skill, module, title) {
  return `${slugify(title)}-${shortHash(`${skill}:${module}:${title}`)}`;
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
      difficulty: null,
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

  // Glob ONLY this agent's owned prefix.
  const files = readdirSync(DATA).filter((f) => f.startsWith('wr-') && f.endsWith('.json'));
  const summary = { writing: 0, task1Academic: 0, task2Academic: 0, task1General: 0, failed: 0 };
  const slugs = [];
  const seenSlugs = new Set();

  for (const f of files) {
    const arr = JSON.parse(readFileSync(join(DATA, f), 'utf8'));
    for (const item of arr) {
      if (item.skill !== 'writing') continue;
      const t = transformWriting(item);
      if (seenSlugs.has(t.passage.slug)) { console.error(`  DUPLICATE SLUG ${t.passage.slug} — skipping`); continue; }
      seenSlugs.add(t.passage.slug);
      if (DRY_RUN) {
        log(`would upsert writing "${item.title}" slug=${t.passage.slug} (${t.passage.module} task ${t.writing_details.task})`);
      } else {
        try {
          await upsertWriting(supabase, t);
          log(`writing "${item.title}" -> ${t.passage.slug} (${t.passage.module} task ${t.writing_details.task})`);
        } catch (e) {
          console.error(`  FAILED ${item.title}: ${e.message}`); summary.failed++; continue;
        }
      }
      summary.writing++;
      if (t.writing_details.task === 1 && t.passage.module === 'general') summary.task1General++;
      else if (t.writing_details.task === 1) summary.task1Academic++;
      else summary.task2Academic++;
      slugs.push(t.passage.slug);
    }
  }
  log('DONE. Summary:', JSON.stringify(summary));
  log('slugs:', JSON.stringify(slugs));
}

main().catch((e) => { console.error('[import-wr] fatal:', e); process.exit(1); });
