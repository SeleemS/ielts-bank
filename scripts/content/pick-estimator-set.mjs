// scripts/content/pick-estimator-set.mjs
//
// READ-ONLY curation helper for the Band Estimator (Phase 1.1). Lists candidate
// PUBLISHED reading passages / listening items with a per-group breakdown so the
// founder (delegated here to the implementing agent) can pick ONE passage whose
// whole question groups sum to ~10 questions with a mix of input families.
//
// It talks to Supabase with the PUBLIC anon key only (NEXT_PUBLIC_SUPABASE_URL /
// NEXT_PUBLIC_SUPABASE_ANON_KEY parsed from .env.local). It NEVER touches the
// service-role key and performs no writes. It reuses the same PASSAGE_SELECT
// projection and the structured-shape numbering logic as lib/supabase.js
// (getStructuredPassage) so the group indexes it prints line up with the
// zero-based `groups[]` array that getStructuredPassage returns — which is the
// contract lib/estimatorConfig.js encodes.
//
// Usage:
//   node scripts/content/pick-estimator-set.mjs --skill=reading   [--candidates=40]
//   node scripts/content/pick-estimator-set.mjs --skill=listening [--candidates=40]
//
// Output: for each candidate passage, its slug / title / difficulty / module and,
// per group: [index] group-id, question_type (-> input family), question count,
// and the group's global question-number span. Then a scored shortlist of the
// passages whose whole groups can total exactly 10 (or, failing that, closest to
// 10 within [8..13]) using only NON-visual groups with a mixed set of input
// families, medium difficulty preferred.

import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './_env.mjs';

// @supabase/supabase-js constructs a realtime client on createClient(), which
// needs a global WebSocket. Node < 22 has none — polyfill from the already-
// installed `ws` (a transitive dependency; NOT added to package.json). No
// realtime is actually used here; this only lets createClient() succeed.
if (typeof globalThis.WebSocket === 'undefined') {
  try {
    const { default: WS } = await import('ws');
    globalThis.WebSocket = WS;
  } catch {
    // If ws is unavailable, fall through; Node 22+ has a native WebSocket.
  }
}

// ---------------------------------------------------------------------------
// TYPE_CONFIG is duplicated (minimally) from src/components/question/grade.js so
// this standalone ESM script needs no JSX/transpile step. Keep in sync: the
// `input` family drives both the "exclude visual" filter and the mix check.
// ---------------------------------------------------------------------------
const TYPE_INPUT = {
  multiple_choice: 'radio',
  multiple_choice_multi: 'checkbox',
  true_false_notgiven: 'boolean',
  yes_no_notgiven: 'boolean',
  matching_information: 'select',
  matching_headings: 'select',
  matching_features: 'select',
  matching_sentence_endings: 'select',
  sentence_completion: 'text',
  summary_completion: 'text',
  note_completion: 'text',
  table_completion: 'text',
  flowchart_completion: 'text',
  short_answer: 'text',
  diagram_label: 'visual',
  plan_map_diagram_label: 'visual',
  form_completion: 'visual',
};

// Coarse "families" the selection criteria talk about.
//   boolean-family : boolean (tfng/ynng)
//   select/matching: select + radio/checkbox (choice types)
//   text-completion: text
function inputFamily(questionType) {
  const input = TYPE_INPUT[questionType] || 'text';
  if (input === 'visual') return 'visual';
  if (input === 'boolean') return 'boolean';
  if (input === 'text') return 'text';
  return 'select'; // radio / checkbox / select => choice/matching family
}

// Same projection lib/supabase.js uses (minus the writing/speaking details).
const PASSAGE_SELECT = `
  id, slug, legacy_firestore_id, skill, module, title, difficulty, status,
  listening_details ( audio_path, legacy_audio_url ),
  question_groups (
    id, position, question_type,
    questions ( id, position, global_number )
  )
`;

// Reproduce getStructuredPassage's group ordering + continuous 1..N numbering so
// the printed indexes/spans match what the page will actually receive.
function structuredGroups(row) {
  const groups = (row.question_groups || [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((g) => ({
      id: g.id,
      position: g.position,
      questionType: g.question_type,
      questions: (g.questions || [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((q) => ({ globalNumber: q.global_number })),
    }));

  let counter = 0;
  groups.forEach((g) =>
    g.questions.forEach((q) => {
      counter += 1;
      q.number = Number.isInteger(q.globalNumber) ? q.globalNumber : counter;
    })
  );
  return groups;
}

function parseArgs(argv) {
  const args = { skill: 'reading', candidates: 40 };
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    if (m[1] === 'skill') args.skill = m[2];
    if (m[1] === 'candidates') args.candidates = Math.max(1, parseInt(m[2], 10) || 40);
  }
  return args;
}

// Rank difficulty: medium preferred, then easy/hard, then unknown.
function difficultyScore(difficulty) {
  const d = String(difficulty || '').toLowerCase();
  if (d.includes('medium') || d.includes('moderate') || d === 'b1' || d === 'b2') return 0;
  if (d) return 1;
  return 2;
}

// Given a passage's non-visual groups, find the whole-group subset whose counts
// sum closest to the target (10), tie-broken toward MORE input-family variety
// and FEWER groups. Returns { indexes, total, families, exact } or null.
function bestSubset(groups, target = 10) {
  const usable = groups
    .map((g, index) => ({
      index,
      count: g.questions.length,
      family: inputFamily(g.questionType),
    }))
    .filter((g) => g.family !== 'visual' && g.count > 0);

  if (usable.length === 0) return null;

  let best = null;
  const n = usable.length;
  // Enumerate every non-empty subset (n is small: a passage has a handful of groups).
  for (let mask = 1; mask < 1 << n; mask += 1) {
    let total = 0;
    const indexes = [];
    const families = new Set();
    for (let i = 0; i < n; i += 1) {
      if (mask & (1 << i)) {
        total += usable[i].count;
        indexes.push(usable[i].index);
        families.add(usable[i].family);
      }
    }
    if (total < 8 || total > 13) continue; // acceptable window per the plan
    const cand = {
      indexes,
      total,
      families: [...families],
      exact: total === target,
      distance: Math.abs(total - target),
    };
    if (
      best === null ||
      cand.distance < best.distance ||
      (cand.distance === best.distance && cand.families.length > best.families.length) ||
      (cand.distance === best.distance &&
        cand.families.length === best.families.length &&
        cand.indexes.length < best.indexes.length)
    ) {
      best = cand;
    }
  }
  return best;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.skill !== 'reading' && args.skill !== 'listening') {
    console.error('--skill must be reading or listening');
    process.exit(1);
  }

  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
    process.exit(1);
  }
  // Anon key only: RLS restricts to published content. No writes are performed.
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from('passages')
    .select(PASSAGE_SELECT)
    .eq('skill', args.skill)
    .eq('status', 'published')
    .order('title', { ascending: true });

  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }

  const rows = (data || []).slice(0, args.candidates);
  console.log(`\n# Candidate ${args.skill} passages (published): ${rows.length}\n`);

  const scored = [];
  for (const row of rows) {
    const groups = structuredGroups(row);
    const totalQ = groups.reduce((s, g) => s + g.questions.length, 0);
    const hasAudio =
      args.skill === 'listening'
        ? !!(row.listening_details?.[0]?.audio_path ||
            row.listening_details?.audio_path ||
            row.listening_details?.[0]?.legacy_audio_url ||
            row.listening_details?.legacy_audio_url)
        : true;

    console.log(`## ${row.title}`);
    console.log(
      `   slug=${row.slug}  difficulty=${row.difficulty || '?'}  module=${row.module || '-'}` +
        `  groups=${groups.length}  totalQ=${totalQ}` +
        (args.skill === 'listening' ? `  audio=${hasAudio ? 'yes' : 'MISSING'}` : '')
    );
    groups.forEach((g, index) => {
      const nums = g.questions.map((q) => q.number).filter((x) => Number.isInteger(x));
      const span = nums.length ? `Q${Math.min(...nums)}-${Math.max(...nums)}` : 'Q?';
      const family = inputFamily(g.questionType);
      console.log(
        `     [${index}] ${g.questionType}  (${family}${family === 'visual' ? ' EXCLUDED' : ''})` +
          `  count=${g.questions.length}  ${span}  gid=${g.id}`
      );
    });

    const subset = bestSubset(groups, 10);
    if (subset && (args.skill !== 'listening' || (hasAudio && groups.length >= 2))) {
      const familyBonus = subset.families.length; // 1..3 (excl. visual)
      const booleanOK = subset.families.includes('boolean');
      // Composite score: prefer exact 10, then variety, then medium difficulty,
      // then presence of a boolean group (helps satisfy the cross-set mix).
      const score =
        (subset.exact ? 0 : subset.distance) * 10 +
        (3 - familyBonus) * 2 +
        difficultyScore(row.difficulty) +
        (booleanOK ? 0 : 1);
      scored.push({
        slug: row.slug,
        title: row.title,
        difficulty: row.difficulty,
        indexes: subset.indexes,
        total: subset.total,
        families: subset.families,
        exact: subset.exact,
        score,
      });
    }
    console.log('');
  }

  scored.sort((a, b) => a.score - b.score);
  console.log('\n# Scored shortlist (lower score = better fit for the estimator)\n');
  for (const s of scored.slice(0, 15)) {
    console.log(
      `  score=${s.score.toFixed(1)}  slug=${s.slug}  groupIndexes=[${s.indexes.join(',')}]` +
        `  total=${s.total}${s.exact ? ' (exact 10)' : ''}  families={${s.families.join(',')}}` +
        `  difficulty=${s.difficulty || '?'}`
    );
  }
  console.log(
    '\nNote: cross-set mix (boolean + select/matching + text across BOTH skills) is a' +
      '\nglobal constraint — check the reading and listening shortlists together before' +
      '\nlocking lib/estimatorConfig.js.\n'
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
