// lib/essays.js
// IELTS Essay Bank loader. Authored sample answers live one-per-file in
// content/essays/<slug>.md, mirroring lib/posts.js + content/posts: a YAML
// frontmatter header (parsed by lib/frontmatter.mjs) and a body split into
// `## Heading` sections (parsed by lib/essayMarkup.js).
//
// These are ORIGINAL essays written for the bank at deliberately different
// levels — the same prompt answered at Band 6, 7 and 8 — so a learner can see
// what actually separates the bands. The Band 8–9 model answers that already
// sit on every /writingquestion page are catalogued separately
// (lib/essayBankCatalogue.js); nothing here duplicates them.
//
// CONSUMERS (all server-side, inside getStaticProps/getStaticPaths or
// getServerSideProps so Next strips `fs` from the client bundle):
// pages/ielts-essay-bank/index.js, pages/ielts-essay-bank/[slug].js,
// pages/writingquestion/[id].js, pages/blog/[slug].js, pages/sitemap.xml.js.
// Routes that run this at REQUEST time (ISR regeneration, the sitemap) need
// content/essays in next.config.js outputFileTracingIncludes.
//
// FRONTMATTER FIELDS (all required unless marked optional)
//   title     short topic name, e.g. "Free University Education" — used in
//             "IELTS Essay Bank: <title> Band <x> Sample Answer"
//   task      1 or 2
//   module    academic | general
//   topic     primary topic family id (lib/essayTaxonomy.js TOPIC_IDS)
//   topics    (optional) JSON array of extra topic family ids
//   type      question type id valid for the task (QUESTION_TYPE_IDS)
//   band      overall band; MUST equal overallBand(tr, cc, lr, gra)
//   tr cc lr gra   whole-number criterion bands (tr = Task Achievement on Task 1)
//   practice  slug of the /writingquestion page with the same prompt
//   date      human-readable publish date, e.g. "September 23, 2026"
//   excerpt   meta description (80–170 chars)
//
// BODY SECTIONS
//   ## Prompt                         the question, verbatim from the bank
//   ## Essay                          the answer; ==phrase== marks vocabulary
//   ## Task Response | Task Achievement
//   ## Coherence and Cohesion
//   ## Lexical Resource
//   ## Grammatical Range and Accuracy  examiner-style justification per band
//   ## Vocabulary                     "- **phrase** — note" (phrase highlighted in the essay)
//   ## Next band                      2–3 "- " bullets: what would lift it a band
// The slug is the filename.

import fs from 'fs';
import path from 'path';
import { parseEssay } from './essayParser';
import { TOPIC_IDS } from './essayTaxonomy';

export { parseEssay };

export const ESSAYS_DIR = path.join(process.cwd(), 'content', 'essays');

function loadEssays() {
  if (!fs.existsSync(ESSAYS_DIR)) return [];
  const files = fs
    .readdirSync(ESSAYS_DIR)
    .filter((file) => file.endsWith('.md'))
    .sort();
  const loaded = files.map((file) => parseEssay(file, fs.readFileSync(path.join(ESSAYS_DIR, file), 'utf8')));

  // Deterministic order: grouped by prompt, bands ascending within a prompt,
  // so a Band 6/7/8 set always reads as a progression on the hub.
  return loaded.sort(
    (a, b) => a.practice.localeCompare(b.practice) || a.band - b.band || a.slug.localeCompare(b.slug)
  );
}

export const essays = loadEssays();

export const essaySlugs = essays.map((essay) => essay.slug);

export function getEssayBySlug(slug) {
  return essays.find((essay) => essay.slug === slug) || null;
}

/** Authored essays answering the prompt on a given /writingquestion page. */
export function getEssaysForPractice(practiceSlug) {
  return essays.filter((essay) => essay.practice === practiceSlug);
}

/** The small card shape the hub, related lists and cross-links render. */
export function toEssayCard(essay) {
  return {
    slug: essay.slug,
    title: essay.title,
    seoTitle: essay.seoTitle,
    bucket: essay.bucket,
    topic: essay.topic,
    topics: essay.topics,
    type: essay.type,
    band: essay.band,
    bandGroup: essay.bandGroup,
    practice: essay.practice,
    wordCount: essay.wordCount,
    opening: essay.opening,
  };
}

/**
 * Related essays for an essay page: the same prompt at other bands first (the
 * comparison is the point of the bank), then the same topic, then the same
 * question type.
 */
export function relatedEssays(essay, limit = 6) {
  const others = essays.filter((e) => e.slug !== essay.slug);
  const score = (e) =>
    (e.practice === essay.practice ? 100 : 0) +
    (e.topics.some((t) => essay.topics.includes(t)) ? 10 : 0) +
    (e.type === essay.type ? 5 : 0) +
    (e.bucket === essay.bucket ? 1 : 0);
  return others
    .map((e) => ({ e, s: score(e) }))
    .filter(({ s }) => s > 1)
    .sort((a, b) => b.s - a.s || a.e.slug.localeCompare(b.e.slug))
    .slice(0, limit)
    .map(({ e }) => toEssayCard(e));
}

/**
 * Authored essays relevant to a blog post, for the essay-bank callout on
 * writing articles: matched on question type / task / topic words in the
 * post's slug and title. Returns cards, best match first.
 */
export function essaysForBlogPost({ slug = '', title = '' }, limit = 3) {
  const text = `${slug} ${title}`.toLowerCase();
  const wantsTask1 = /task-1|task 1|graph|chart|table|process|map|letter/.test(text);
  const typeHints = [
    ['opinion', /agree|opinion/],
    ['discussion', /discuss|both-views|both views/],
    ['advantages-disadvantages', /advantage/],
    ['problem-solution', /problem|solution/],
    ['positive-negative', /positive|negative/],
    ['two-part', /two-part|double/],
    ['line-graph', /line-graph|line graph/],
    ['bar-chart', /bar-chart|bar chart/],
    ['pie-chart', /pie/],
    ['table', /table/],
    ['process', /process/],
    ['map', /map/],
  ]
    .filter(([, pattern]) => pattern.test(text))
    .map(([id]) => id);
  const topicHints = TOPIC_IDS.filter((id) => text.includes(id));
  const wantsLetter = /letter/.test(text);

  const score = (e) =>
    (typeHints.includes(e.type) ? 20 : 0) +
    (wantsLetter && e.bucket === 'task1-general' ? 20 : 0) +
    (e.topics.some((t) => topicHints.includes(t)) ? 10 : 0) +
    ((e.task === 1) === wantsTask1 ? 3 : 0) +
    // A band-comparison set is the most useful thing to show; prefer the
    // middle essay (Band 7) as the entry point into it.
    (e.bandGroup === '7' ? 1 : 0);
  return essays
    .map((e) => ({ e, s: score(e) }))
    .sort((a, b) => b.s - a.s || a.e.slug.localeCompare(b.e.slug))
    .slice(0, limit)
    .map(({ e }) => toEssayCard(e));
}
