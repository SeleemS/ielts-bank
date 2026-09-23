// lib/answerKeyPages.js
// Shared getStaticPaths/getStaticProps for the answer-key routes
// (pages/readingquestion/[id]/answers.js, pages/listeningquestion/[id]/answers.js).
// Same data path as the practice pages (getStructuredPassage → the shared
// integrity guard + continuous numbering), so the key always matches the
// question numbers a learner saw while practising.
//
// SERVER-ONLY. The answer-key builder, question-type copy and the title
// denylist (lib/answerKeys.js) must never be imported from lib/supabase.js,
// which is in the _app bundle via src/lib/auth.jsx — keep eligibility here.

import {
  getRelatedPractice,
  getStructuredPassage,
  getSupabase,
  toStructuredPassageShape,
} from './supabase';
import { answerPageEligible, answersPath, buildAnswerKey } from './answerKeys';

const REVALIDATE_SECONDS = 3600;
const RELATED_LIMIT = 6;

// Slugs of every published passage whose answer key is complete, explained
// and publishable (see answerPageEligible in lib/answerKeys.js). ONE query per
// skill, reusing the structured shape + integrity guard, so the answers
// pages' getStaticPaths, the sitemap and cross-links all agree. Memoised for a
// few minutes because every answers page asks for it during a build.
const ANSWER_KEY_AUDIT_SELECT = `
  slug, legacy_firestore_id, skill, module, title, body_html, difficulty,
  listening_details ( transcript_html, part ),
  question_groups (
    id, position, question_type,
    group_options ( option_key, display_text, position ),
    questions (
      id, position, global_number,
      answer_keys ( accepted, correct_option_keys, explanation )
    )
  )
`;
const SLUG_CACHE_TTL_MS = 5 * 60 * 1000;
const slugCache = new Map();

export async function listAnswerKeySlugs(skill) {
  const hit = slugCache.get(skill);
  if (hit && Date.now() - hit.at < SLUG_CACHE_TTL_MS) return hit.value;
  const { data, error } = await getSupabase()
    .from('passages')
    .select(ANSWER_KEY_AUDIT_SELECT)
    .eq('skill', skill)
    .eq('status', 'published')
    .order('title', { ascending: true });
  if (error) throw error;
  // No audio_path is selected, so no storage URLs are resolved here.
  const value = (data || [])
    .map(toStructuredPassageShape)
    .filter(answerPageEligible)
    .map((p) => p.slug);
  slugCache.set(skill, { at: Date.now(), value });
  return value;
}

// Stable small hash so each answers page links a DIFFERENT window of sibling
// passages — spreads internal links across the bank instead of every page
// pointing at the same alphabetically-first items.
export function slugHash(slug) {
  let h = 0;
  for (const ch of String(slug || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function pickRelated(candidates, currentSlug, eligibleSlugs, limit = RELATED_LIMIT) {
  const ok = new Set(eligibleSlugs);
  const pool = [];
  const seen = new Set();
  for (const item of candidates || []) {
    if (!item?.id || item.id === currentSlug || !ok.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    pool.push({ slug: item.id, title: item.title, difficulty: item.difficulty || null });
  }
  if (pool.length <= limit) return pool;
  const start = slugHash(currentSlug) % pool.length;
  return Array.from({ length: limit }, (_, i) => pool[(start + i) % pool.length]);
}

export async function answerKeyStaticPaths(skill) {
  const slugs = await listAnswerKeySlugs(skill);
  return {
    paths: slugs.map((id) => ({ params: { id } })),
    fallback: 'blocking',
  };
}

export async function answerKeyStaticProps(skill, id) {
  const passage = await getStructuredPassage(skill, id);
  // Check eligibility BEFORE redirecting so an ineligible passage's legacy id
  // 404s directly instead of redirecting to a slug URL that then 404s.
  if (!passage || !answerPageEligible(passage)) {
    return { notFound: true, revalidate: REVALIDATE_SECONDS };
  }
  // One URL per passage: legacy-id / alternate lookups redirect to the slug.
  if (id !== passage.slug) {
    return { redirect: { destination: answersPath(skill, passage.slug), permanent: true } };
  }

  let related = [];
  try {
    const [candidates, eligible] = await Promise.all([
      getRelatedPractice(skill, passage.slug, passage.groups?.[0]?.questionType, 1000),
      listAnswerKeySlugs(skill),
    ]);
    related = pickRelated(candidates, passage.slug, eligible);
  } catch (err) {
    // Related links are an enhancement; never fail the page over them.
    console.error(`answers: related lookup failed for ${skill}/${passage.slug}`, err);
  }

  return {
    props: { answerKey: buildAnswerKey(passage, skill), related },
    revalidate: REVALIDATE_SECONDS,
  };
}
