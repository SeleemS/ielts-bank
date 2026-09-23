// lib/questionUrls.js
// The ONE rule for a practice question's public URL: /<skill>question/<slug>.
//
// Every published passage has a clean slug ("computer-games-vs-sports-7279qb").
// 50 older passages (23 Writing, 27 Reading, imported from Firestore) also carry
// a legacy id — a title with spaces ("Computer Games vs Sports") or an opaque
// key ("IXAmkcfLtFLibCSJjZLv"). Until Sep 2026 the sitemap and canonical used
// the legacy id while related-practice cards and the Task 2 pages linked the
// slug, so Google saw two URLs per passage (GSC: 50 x "Alternate page with
// proper canonical tag"; Writing even had two SELF-canonical duplicates).
//
// Now the slug is canonical everywhere and the legacy URL permanently
// redirects to it (canonicalQuestionRedirect, called from each question
// route's getStaticProps). Every link, canonical and sitemap entry for a
// question page must go through questionPath()/questionUrl().

import { SITE_URL } from './site';

export const QUESTION_SKILLS = ['reading', 'writing', 'listening', 'speaking'];

// Exact-duplicate prompts that were imported twice under different titles
// (identical prompt text, verified Sep 23 2026). The retired slug permanently
// redirects to the kept one and is left out of hubs, related links and the
// sitemap. To retire them in the database as well, see
// docs/growth-2026-09-23/30-TECH-SEO-CHANGES.md.
export const RETIRED_DUPLICATE_QUESTIONS = {
  writing: {
    'learning-a-language-xbqoua': 'learning-a-foreign-language-19xpmz',
    'opportunity-of-wealth-54ayk6': 'the-purpose-of-wealth-1i3c20',
    'recycling-at-home-1hqf94': 'recycling-regulation-192dud',
  },
};

// Canonical route id for a passage-like object: { slug } from the structured
// passage, or the listPassages projection { id: slug, legacyId }.
export function canonicalQuestionId(item) {
  if (!item) return '';
  return item.slug || item.id || '';
}

export function retiredDuplicateTarget(skill, slug) {
  return RETIRED_DUPLICATE_QUESTIONS[skill]?.[slug] || null;
}

export function isRetiredDuplicate(skill, item) {
  return Boolean(retiredDuplicateTarget(skill, canonicalQuestionId(item)));
}

// Drop retired duplicates from any list of passage-like items.
export function withoutRetiredDuplicates(skill, items = []) {
  return items.filter((item) => !isRetiredDuplicate(skill, item));
}

// Site-relative canonical path, e.g. /writingquestion/computer-games-vs-sports-7279qb
export function questionPath(skill, item) {
  const id = canonicalQuestionId(item);
  if (!id || !QUESTION_SKILLS.includes(skill)) return '';
  const target = retiredDuplicateTarget(skill, id) || id;
  return `/${skill}question/${encodeURIComponent(target)}`;
}

export function questionUrl(skill, item) {
  const path = questionPath(skill, item);
  return path ? `${SITE_URL}${path}` : '';
}

// For getStaticProps: when a passage was requested through a NON-canonical id
// (its legacy Firestore id) or is a retired duplicate, return a Next.js
// permanent (308) redirect to the canonical slug URL; otherwise null.
// `requestedId` is the decoded route param.
export function canonicalQuestionRedirect(skill, requestedId, item) {
  const slug = canonicalQuestionId(item);
  if (!slug || !requestedId) return null;
  const target = retiredDuplicateTarget(skill, slug);
  if (!target && requestedId === slug) return null;
  return { redirect: { destination: questionPath(skill, item), permanent: true } };
}
