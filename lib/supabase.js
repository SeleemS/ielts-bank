// lib/supabase.js
// New Supabase data-access layer. Mirrors the shape of lib/passages.js so that,
// at cutover, the [id].js pages and DataTable can swap imports with minimal
// churn. ADDITIVE for now: nothing imports this yet. See supabase/MIGRATION_PLAN.md
// for the exact cutover swap list.
//
// Env vars (public, browser-safe; NOT the service role):
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY
//
// The anon key only ever sees data allowed by RLS (published content + the
// signed-in user's own rows), so it is safe to expose to the client.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Section -> skill enum, replacing lib/passages.js COLLECTIONS.
export const SKILLS = {
  reading: 'reading',
  writing: 'writing',
  listening: 'listening',
  speaking: 'speaking',
};

// Public listening-audio bucket, matching supabase/migrations/0007.
const LISTENING_BUCKET = 'listening-audio';

let _client = null;

// Lazily instantiate a singleton. Throwing here (rather than at import time)
// keeps the module importable during builds where env vars may be absent.
export function getSupabase() {
  if (_client) return _client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Set them in .env.local (local) and Vercel env (deploy).'
    );
  }
  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return _client;
}

// Resolve a listening-audio storage PATH -> a public URL. Used by
// getStaticProps so the built page ships a stable public URL instead of a
// Firebase token URL. Returns null when there is no path.
export function audioPublicUrl(audioPath) {
  if (!audioPath) return null;
  const supabase = getSupabase();
  const { data } = supabase.storage.from(LISTENING_BUCKET).getPublicUrl(audioPath);
  return data?.publicUrl || null;
}

// Reassemble the nested passage shape the existing page components expect:
//   { passageTitle, passageText, passageDifficulty, audioUrl?, questionGroups:[
//       { prompt, questionType, options:[], questions:[{ text, answer }] } ] }
// from the normalized relational rows. This adapter means the React components
// (ReadingQuestion/ListeningQuestion/WritingQuestion) need little-to-no change
// at cutover.
function toLegacyPassageShape(row) {
  const groups = (row.question_groups || [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((g) => {
      const options = (g.group_options || [])
        .slice()
        .sort((a, b) => a.position - b.position);
      const optionText = options.map((o) => o.display_text);
      const optionTextByKey = new Map(options.map((o) => [o.option_key, o.display_text]));

      const questions = (g.questions || [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((q) => {
          const ak = Array.isArray(q.answer_keys) ? q.answer_keys[0] : q.answer_keys;
          let answer = '';
          if (ak) {
            if (ak.correct_option_keys && ak.correct_option_keys.length > 0) {
              // Map the correct option key(s) back to display text for the
              // legacy MCQ/matching UI (which compares against option strings).
              answer = ak.correct_option_keys
                .map((k) => optionTextByKey.get(k) || k)
                .join(', ');
            } else if (ak.accepted && ak.accepted.length > 0) {
              answer = ak.accepted[0];
            }
          }
          return { text: q.prompt_text || '', answer };
        });

      return {
        prompt: g.prompt || '',
        questionType: legacyTypeLabel(g.question_type),
        options: optionText,
        questions,
      };
    });

  const shaped = {
    passageTitle: row.title || 'Untitled',
    passageText:
      row.skill === 'writing'
        ? row.writing_details?.[0]?.prompt_html || row.writing_details?.prompt_html || ''
        : row.body_html || '',
    passageDifficulty: row.difficulty || null,
    questionGroups: groups,
  };

  if (row.skill === 'listening') {
    const details = Array.isArray(row.listening_details)
      ? row.listening_details[0]
      : row.listening_details;
    const path = details?.audio_path || null;
    shaped.audioUrl = audioPublicUrl(path) || details?.legacy_audio_url || '';
  }

  return shaped;
}

// New enum value -> the label string the current UI switches on.
function legacyTypeLabel(qType) {
  switch (qType) {
    case 'true_false_notgiven':
      return 'True or False';
    case 'yes_no_notgiven':
      return 'Yes or No';
    case 'short_answer':
      return 'Short Answer';
    case 'multiple_choice':
    case 'multiple_choice_multi':
    case 'matching_information':
    case 'matching_headings':
    case 'matching_features':
    case 'matching_sentence_endings':
      return 'Match';
    default:
      return 'Short Answer';
  }
}

const PASSAGE_SELECT = `
  id, slug, legacy_firestore_id, skill, module, title, body_html, difficulty, status,
  writing_details ( task, prompt_html, chart_image_path, word_limit_min ),
  listening_details ( audio_path, legacy_audio_url, transcript_html ),
  question_groups (
    id, position, question_type, prompt,
    group_options ( option_key, display_text, position ),
    questions (
      id, position, global_number, prompt_text,
      answer_keys ( accepted, correct_option_keys, spelling_variants, word_limit, normalize )
    )
  )
`;

// Strip HTML tags and collapse whitespace, then truncate for meta descriptions.
// Mirrors the helper previously provided by lib/passages.js so pages no longer
// need to import the (Firestore-backed) passages module.
export function toMetaDescription(html, max = 150) {
  if (!html) return '';
  const text = String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  return text.slice(0, max).trim() + '...';
}

// ---- Public API (mirrors lib/passages.js) --------------------------------

// getStaticPaths helper: all published slugs for a skill.
export async function getPassageSlugs(skill) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('passages')
    .select('slug')
    .eq('skill', skill)
    .eq('status', 'published');
  if (error) throw error;
  return (data || []).map((r) => r.slug);
}

// Also expose legacy ids so cutover can build redirect maps (old SSG URLs).
export async function getLegacyIdSlugMap(skill) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('passages')
    .select('slug, legacy_firestore_id')
    .eq('skill', skill)
    .eq('status', 'published');
  if (error) throw error;
  return (data || []).reduce((acc, r) => {
    if (r.legacy_firestore_id) acc[r.legacy_firestore_id] = r.slug;
    return acc;
  }, {});
}

// Fetch a single passage by slug; returns the legacy-shaped object or null.
// Accepts a legacy Firestore id too (for redirect / backward-compat lookups).
export async function getPassageBySlug(skill, slugOrLegacyId) {
  const supabase = getSupabase();
  let { data, error } = await supabase
    .from('passages')
    .select(PASSAGE_SELECT)
    .eq('skill', skill)
    .eq('slug', slugOrLegacyId)
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    // Fall back to legacy id lookup so old URLs still resolve.
    const res = await supabase
      .from('passages')
      .select(PASSAGE_SELECT)
      .eq('skill', skill)
      .eq('legacy_firestore_id', slugOrLegacyId)
      .maybeSingle();
    if (res.error) throw res.error;
    data = res.data;
  }

  if (!data) return null;
  return JSON.parse(JSON.stringify(toLegacyPassageShape(data)));
}

// Section landing list (mirrors lib/passages.js listPassages projection).
export async function listPassages(skill) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('passages')
    .select('slug, legacy_firestore_id, title, difficulty')
    .eq('skill', skill)
    .eq('status', 'published')
    .order('title', { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.slug, // route param going forward is the slug
    legacyId: r.legacy_firestore_id,
    title: r.title || 'Untitled',
    difficulty: r.difficulty || null,
  }));
}
