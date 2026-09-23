// lib/answerKeyPages.js
// Shared getStaticPaths/getStaticProps for the answer-key routes
// (pages/readingquestion/[id]/answers.js, pages/listeningquestion/[id]/answers.js).
// Same data path as the practice pages (getStructuredPassage → the shared
// integrity guard + continuous numbering), so the key always matches the
// question numbers a learner saw while practising.

import { getRelatedPractice, getStructuredPassage, listAnswerKeySlugs } from './supabase';
import { answerPageEligible, answersPath, buildAnswerKey } from './answerKeys';

const REVALIDATE_SECONDS = 3600;
const RELATED_LIMIT = 6;

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
