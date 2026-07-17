#!/usr/bin/env node
/**
 * import-rdA.mjs  (SELF-CONTAINED — owns the rdA-* filename lane)
 * ---------------------------------------------------------------
 * Idempotent importer for the rdA content batch. Reads ONLY
 * scripts/content/data/rdA-*.json and upserts each reading passage into
 * Supabase by a stable slug (children are delete+reinserted per passage).
 * Safe to re-run: same slug -> same passage, refreshed children.
 *
 * Storage shape (verified against existing migrated rows, mirrors import-batch.mjs):
 *   - true_false_notgiven / yes_no_notgiven -> answer_keys.accepted = ['true'|'false'|'not given'|'yes'|'no']
 *   - multiple_choice -> one question_group PER stem, group_options keyed A/B/C/D
 *     (display_text "A) text") + answer_keys.correct_option_keys = ['B']
 *   - short_answer -> answer_keys.accepted = [...variants], word_limit set
 *
 * USAGE
 *   node --import ./scripts/_wspreload.mjs scripts/content/import-rdA.mjs [--dry-run]
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env.local via _env.mjs).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './_env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, 'data');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');

const log = (...a) => console.log('[import-rdA]', ...a);

// ---- slug helpers (identical to import-batch.mjs, so slugs are stable) -----
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
function optionKeyFor(index) {
  return String.fromCharCode(65 + index);
}

// ---- transform one authored reading item into the relational shape ---------
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
      if (g.question_type === 'multiple_choice') {
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

// ---- DB write (mirrors import-batch.mjs upsertReading) ---------------------
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

  let pos = 0;
  for (const g of t.groups) {
    if (g.group.question_type === 'multiple_choice') {
      for (const q of g.questions) {
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

  // GLOB ONLY rdA-*.json — never touch other agents' files.
  const files = readdirSync(DATA).filter((f) => /^rdA-.*\.json$/.test(f)).sort();
  log('files:', JSON.stringify(files));

  const summary = { academic: 0, general: 0, questions: 0, byType: {}, failed: 0 };
  const slugs = [];
  const seenSlugs = new Set();

  for (const f of files) {
    let arr;
    try { arr = JSON.parse(readFileSync(join(DATA, f), 'utf8')); }
    catch (e) { console.error(`  BAD JSON ${f}: ${e.message}`); summary.failed++; continue; }
    if (!Array.isArray(arr)) { console.error(`  ${f} is not an array — skipping`); continue; }
    for (const item of arr) {
      if (item.skill !== 'reading') { console.error(`  non-reading item in ${f} — skipping`); continue; }
      const t = transformReading(item);
      if (seenSlugs.has(t.passage.slug)) { console.error(`  DUPLICATE SLUG ${t.passage.slug} — skipping`); continue; }
      seenSlugs.add(t.passage.slug);
      const qCount = t.groups.reduce((n, g) => n + g.questions.length, 0);
      for (const g of t.groups) summary.byType[g.group.question_type] = (summary.byType[g.group.question_type] || 0) + g.questions.length;
      if (DRY_RUN) {
        log(`would upsert [${item.module}] "${item.title}" slug=${t.passage.slug} (${qCount} q)`);
      } else {
        try { await upsertReading(supabase, t); log(`[${item.module}] "${item.title}" -> ${t.passage.slug} (${qCount} q)`); }
        catch (e) { console.error(`  FAILED ${item.title}: ${e.message}`); summary.failed++; continue; }
      }
      if (item.module === 'general') summary.general++; else summary.academic++;
      summary.questions += qCount;
      slugs.push(t.passage.slug);
    }
  }
  log('DONE. Summary:', JSON.stringify(summary));
  log('slugs:', JSON.stringify(slugs));
}

main().catch((e) => { console.error('[import-rdA] fatal:', e); process.exit(1); });
