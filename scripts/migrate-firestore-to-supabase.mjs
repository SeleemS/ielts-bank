#!/usr/bin/env node
/**
 * migrate-firestore-to-supabase.mjs
 * ----------------------------------
 * One-shot, IDEMPOTENT migration of the three Firestore collections
 * (readingPassages, writingPassages, listeningPassages) into the new Supabase
 * Postgres schema defined under supabase/migrations/.
 *
 * WHAT IT DOES
 *   - Reads all docs from Firestore using the PUBLIC firebase client SDK
 *     (config copied from src/firebase.js; public reads work without secrets).
 *   - Maps the current 4 legacy question types into the new question_type enum.
 *   - Upcasts the single-string `answer` into answer_keys.accepted (+ splits the
 *     overloaded 'Match' type into multiple_choice vs matching_information by
 *     heuristic; see classifyMatchGroup()).
 *   - Generates a stable slug and stores the old Firestore id in
 *     legacy_firestore_id.
 *   - Upserts on legacy_firestore_id, so re-running is safe (children are
 *     replaced per passage).
 *   - Writes via @supabase/supabase-js using the SERVICE_ROLE key (bypasses RLS).
 *
 * SAFETY
 *   - Requires BOTH env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 *     Never hardcodes them. Refuses to touch Supabase without both.
 *   - --dry-run performs the Firestore read + full transform and PRINTS what it
 *     WOULD insert. It never imports the Supabase client and never needs creds.
 *
 * USAGE
 *   node scripts/migrate-firestore-to-supabase.mjs --dry-run
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/migrate-firestore-to-supabase.mjs
 *
 * Optional flags:
 *   --only=reading|writing|listening   Migrate a single collection.
 *   --limit=N                          Process at most N docs per collection.
 *
 * ARCHIVED TOOLING NOTE: the production app no longer depends on Firebase.
 * To rerun this completed one-shot migration, temporarily install the matching
 * Firebase client in an isolated checkout; do not restore it as an app dependency.
 * DO NOT run against a live project until the owner has provisioned Supabase.
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
} from 'firebase/firestore';

// --- Firebase public config (mirror of src/firebase.js) --------------------
// Archived public web config retained only so this one-shot script is reproducible.
const firebaseConfig = {
  apiKey: 'AIzaSyCxAGciWo48j3A2P1okoK-3midsNm14cDk',
  authDomain: 'ieltsbank-a2bc1.firebaseapp.com',
  databaseURL: 'https://ieltsbank-a2bc1-default-rtdb.firebaseio.com',
  projectId: 'ieltsbank-a2bc1',
  storageBucket: 'ieltsbank-a2bc1.appspot.com',
  messagingSenderId: '612897473864',
  appId: '1:612897473864:web:60200b92143c0c1faf9f7d',
  measurementId: 'G-1KRYZZY68X',
};

const COLLECTIONS = {
  reading: 'readingPassages',
  writing: 'writingPassages',
  listening: 'listeningPassages',
};

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const getOpt = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : null;
};

const DRY_RUN = hasFlag('dry-run');
const ONLY = getOpt('only'); // reading | writing | listening | null
const LIMIT = getOpt('limit') ? parseInt(getOpt('limit'), 10) : null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function log(...args) {
  console.log('[migrate]', ...args);
}

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'passage';
}

// Short, deterministic suffix so slugs collide-proof even if two titles match.
function shortHash(input) {
  let h = 5381;
  const s = String(input);
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36).slice(0, 6);
}

function stableSlug(title, legacyId) {
  return `${slugify(title)}-${shortHash(legacyId)}`;
}

// Normalise legacy difficulty ('Easy'|'Medium'|'Hard') -> enum, else null.
// Writing docs carry 'Task 2' here, which is NOT a difficulty -> null.
function mapDifficulty(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'easy' || v === 'medium' || v === 'hard') return v;
  return null;
}

// Legacy writing docs put the task marker ('Task 2') in passageDifficulty.
function mapWritingTask(raw) {
  const m = String(raw || '').match(/task\s*([12])/i);
  return m ? parseInt(m[1], 10) : 2;
}

function optionKeyFor(index) {
  // A, B, ... Z, then AA, AB, ... (more than enough for IELTS option sets).
  let n = index;
  let key = '';
  do {
    key = String.fromCharCode(65 + (n % 26)) + key;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return key;
}

const norm = (s) => String(s ?? '').trim().toLowerCase();

/**
 * Split the overloaded legacy 'Match' type.
 *
 * HEURISTIC: in the current data, a 'Match' group that is really a
 * multiple-choice question stores the WHOLE option string as each question's
 * answer (answer ∈ options). A genuine matching group would instead store a
 * short option KEY / label. So:
 *   - if EVERY question.answer equals one of group.options (case-insensitive)
 *     -> multiple_choice (answer embeds the whole option string)
 *   - otherwise -> matching_information (answer is a key/label)
 */
function classifyMatchGroup(group) {
  const options = Array.isArray(group.options) ? group.options : [];
  const questions = Array.isArray(group.questions) ? group.questions : [];
  if (options.length === 0 || questions.length === 0) return 'matching_information';
  const optionSet = new Set(options.map(norm));
  const everyAnswerIsAnOption = questions.every((q) => optionSet.has(norm(q.answer)));
  return everyAnswerIsAnOption ? 'multiple_choice' : 'matching_information';
}

// Map a legacy questionType (+ its group, for 'Match' disambiguation) to the
// new question_type enum value.
function mapQuestionType(group) {
  switch (group.questionType) {
    case 'True or False':
      return 'true_false_notgiven';
    case 'Yes or No':
      return 'yes_no_notgiven';
    case 'Short Answer':
      return 'short_answer';
    case 'Match':
      return classifyMatchGroup(group);
    default:
      // Unknown legacy type -> treat as free-text short answer (safest fallback).
      return 'short_answer';
  }
}

/**
 * Build the normalized in-memory representation of ONE passage doc:
 * { passage, writing_details?, listening_details?, groups: [{ group, options, questions:[{question, answer_key}] }] }
 * Skill-agnostic transform reused by both dry-run printing and real inserts.
 */
function transformDoc(skill, id, data) {
  const title = data.passageTitle || 'Untitled';
  const legacyId = id;
  const slug = stableSlug(title, legacyId);

  const passage = {
    slug,
    legacy_firestore_id: legacyId,
    skill,
    // Reading is typically Academic in this dataset; leave module null unless
    // we can infer it. Owner can classify later. (See open decisions.)
    module: skill === 'writing' ? 'academic' : null,
    title,
    body_html: skill === 'writing' ? null : (data.passageText || null),
    difficulty: mapDifficulty(data.passageDifficulty),
    topic_tags: [],
    status: 'published', // migrate live content as published
    source: 'firestore',
  };

  const out = { passage, groups: [] };

  if (skill === 'writing') {
    out.writing_details = {
      task: mapWritingTask(data.passageDifficulty),
      prompt_html: data.passageText || '',
      chart_image_path: null,
      word_limit_min: 250,
      rubric_id: null,
    };
  }

  if (skill === 'listening') {
    out.listening_details = {
      audio_path: null, // filled during storage migration; keep legacy url for now
      legacy_audio_url: data.audioUrl || null,
      transcript_html: null,
      voices: null,
    };
  }

  // Question groups (reading + listening carry these; writing does not).
  const groups = Array.isArray(data.questionGroups) ? data.questionGroups : [];
  let globalNumber = 0;

  groups.forEach((g, gi) => {
    const qType = mapQuestionType(g);
    const legacyOptions = Array.isArray(g.options) ? g.options : [];

    // group_options: only meaningful for choice/matching types. For MCQ we
    // synthesise keys A/B/C... from the legacy option strings.
    const options = [];
    const optionKeyByText = new Map();
    if (qType === 'multiple_choice' || qType === 'multiple_choice_multi'
        || qType.startsWith('matching')) {
      legacyOptions.forEach((text, oi) => {
        const key = optionKeyFor(oi);
        optionKeyByText.set(norm(text), key);
        options.push({ option_key: key, display_text: String(text), position: oi });
      });
    }

    const questions = (Array.isArray(g.questions) ? g.questions : []).map((q, qi) => {
      globalNumber += 1;
      const answerRaw = q.answer;

      // Build the answer key uniformly.
      const answerKey = {
        accepted: [],
        correct_option_keys: [],
        spelling_variants: false,
        word_limit: null,
        normalize: 'lower_trim',
      };

      if (qType === 'multiple_choice') {
        // Answer embeds the whole option string -> resolve to its synthesised key.
        const key = optionKeyByText.get(norm(answerRaw));
        if (key) answerKey.correct_option_keys = [key];
        else answerKey.accepted = [String(answerRaw ?? '')]; // fallback: keep raw
      } else if (qType === 'true_false_notgiven' || qType === 'yes_no_notgiven') {
        answerKey.accepted = [norm(answerRaw)]; // 'true' | 'false' | 'not given' etc.
      } else {
        // short_answer / matching_information (key/label) / anything else.
        answerKey.accepted = [String(answerRaw ?? '')];
      }

      return {
        question: {
          position: qi,
          global_number: globalNumber,
          prompt_text: q.text || null,
        },
        answer_key: answerKey,
      };
    });

    out.groups.push({
      group: {
        position: gi,
        question_type: qType,
        prompt: g.prompt || null,
        instructions_html: null,
      },
      options,
      questions,
    });
  });

  return out;
}

// ---------------------------------------------------------------------------
// Firestore read
// ---------------------------------------------------------------------------
async function readCollection(db, collectionName) {
  const snap = await getDocs(collection(db, collectionName));
  return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
}

// ---------------------------------------------------------------------------
// Supabase write (only reached when NOT dry-run)
// ---------------------------------------------------------------------------
async function upsertPassage(supabase, transformed) {
  const { passage, groups } = transformed;

  // 1. Upsert the passage on its natural key (legacy_firestore_id).
  const { data: passRows, error: passErr } = await supabase
    .from('passages')
    .upsert(passage, { onConflict: 'legacy_firestore_id' })
    .select('id')
    .limit(1);
  if (passErr) throw new Error(`passages upsert failed (${passage.legacy_firestore_id}): ${passErr.message}`);
  const passageId = passRows[0].id;

  // 2. Skill-specific details.
  if (transformed.writing_details) {
    const { error } = await supabase
      .from('writing_details')
      .upsert({ passage_id: passageId, ...transformed.writing_details }, { onConflict: 'passage_id' });
    if (error) throw new Error(`writing_details upsert failed: ${error.message}`);
  }
  if (transformed.listening_details) {
    const { error } = await supabase
      .from('listening_details')
      .upsert({ passage_id: passageId, ...transformed.listening_details }, { onConflict: 'passage_id' });
    if (error) throw new Error(`listening_details upsert failed: ${error.message}`);
  }

  // 3. Replace children idempotently: delete existing groups (cascades to
  //    options/questions/answer_keys), then re-insert from the transform.
  const { error: delErr } = await supabase
    .from('question_groups')
    .delete()
    .eq('passage_id', passageId);
  if (delErr) throw new Error(`question_groups delete failed: ${delErr.message}`);

  for (const g of groups) {
    const { data: groupRows, error: gErr } = await supabase
      .from('question_groups')
      .insert({ passage_id: passageId, ...g.group })
      .select('id')
      .limit(1);
    if (gErr) throw new Error(`question_groups insert failed: ${gErr.message}`);
    const groupId = groupRows[0].id;

    if (g.options.length > 0) {
      const { error: oErr } = await supabase
        .from('group_options')
        .insert(g.options.map((o) => ({ question_group_id: groupId, ...o })));
      if (oErr) throw new Error(`group_options insert failed: ${oErr.message}`);
    }

    for (const q of g.questions) {
      const { data: qRows, error: qErr } = await supabase
        .from('questions')
        .insert({ question_group_id: groupId, passage_id: passageId, ...q.question })
        .select('id')
        .limit(1);
      if (qErr) throw new Error(`questions insert failed: ${qErr.message}`);
      const questionId = qRows[0].id;

      const { error: akErr } = await supabase
        .from('answer_keys')
        .insert({ question_id: questionId, ...q.answer_key });
      if (akErr) throw new Error(`answer_keys insert failed: ${akErr.message}`);
    }
  }

  return passageId;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)) {
    console.error(
      '\nRefusing to run: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.\n' +
        'Set them in your shell (never commit them), or use --dry-run to preview without writing.\n'
    );
    process.exit(1);
  }

  log(DRY_RUN ? 'DRY RUN — no writes will be performed.' : 'LIVE RUN — writing to Supabase.');

  // Init Firebase (guarded, mirrors src/firebase.js pattern).
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const db = getFirestore(app);

  // Lazily import supabase-js ONLY for a live run so --dry-run needs no creds
  // and no installed package.
  let supabase = null;
  if (!DRY_RUN) {
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  const skillsToRun = ONLY ? [ONLY] : ['reading', 'writing', 'listening'];
  const summary = {};

  for (const skill of skillsToRun) {
    const collectionName = COLLECTIONS[skill];
    if (!collectionName) {
      log(`Skipping unknown skill "${skill}".`);
      continue;
    }

    log(`Reading Firestore collection "${collectionName}"...`);
    let docs = await readCollection(db, collectionName);
    if (LIMIT) docs = docs.slice(0, LIMIT);
    log(`  ${docs.length} doc(s).`);

    let ok = 0;
    for (const { id, data } of docs) {
      const transformed = transformDoc(skill, id, data);

      if (DRY_RUN) {
        console.log(
          `\n--- WOULD INSERT [${skill}] legacy_id="${id}" slug="${transformed.passage.slug}" ---`
        );
        console.log(JSON.stringify(transformed, null, 2));
        ok += 1;
        continue;
      }

      try {
        const passageId = await upsertPassage(supabase, transformed);
        log(`  upserted ${skill} "${id}" -> ${passageId}`);
        ok += 1;
      } catch (err) {
        console.error(`  FAILED ${skill} "${id}": ${err.message}`);
      }
    }
    summary[skill] = { total: docs.length, processed: ok };
  }

  log('Done.');
  log('Summary:', JSON.stringify(summary));
}

main().catch((err) => {
  console.error('[migrate] fatal:', err);
  process.exit(1);
});
