// lib/sitemapData.js
// Gathers the entries for each child sitemap (server-side only: reads
// content/posts via lib/posts and Supabase via the anon key).
//
// ADDING URLS: a new static page goes in STATIC_ROUTES (pages/sitemap.xml.js)
// and is routed to its child sitemap by path (lib/sitemap.js
// sitemapSectionFor). A new DATA-DRIVEN page type gets a loader in
// SECTION_LOADERS below. Noindex rules live in lib/indexability.js and are
// applied here too, so the sitemap never lists a page that asks not to be
// indexed.

import { posts } from './posts';
import { essays } from './essays';
import { answersPath } from './answerKeys';
import { SKILLS, listSitemapPassages } from './supabase';
import { listAnswerKeySlugs } from './answerKeyPages';
import { listSpeakingHubItems, newestCreatedAt } from './speakingHubs';
import { SPEAKING_FAMILY_SLUGS } from './speakingTopicFamilies';
import { buildMonthlyRoundup, listAvailableRoundupMonths } from './task2Roundup';
import { TASK2_PROMPTS } from './task2Prompts';
import { questionPath, withoutRetiredDuplicates } from './questionUrls';
import { speakingTopicHubIndexable, task2MonthIndexable } from './indexability';
import {
  SITEMAP_SECTIONS,
  isoDate,
  latestDate,
  normaliseEntries,
  sendXml,
  sitemapSectionFor,
  urlsetXml,
} from './sitemap';

function logFailure(what, err) {
  // eslint-disable-next-line no-console
  console.error(`Sitemap: failed to enumerate ${what}`, err?.message || err);
}

// Question pages of one skill, lastmod = the passage row's updated_at, plus the
// skill hub, whose list changes whenever a passage is added.
async function passageEntries(skill, hubPath) {
  try {
    const rows = await listSitemapPassages(skill);
    return [
      { path: hubPath, lastmod: latestDate(rows.map((r) => r.createdAt)) },
      ...rows.map((row) => ({
        path: questionPath(skill, { slug: row.slug }),
        lastmod: row.updatedAt || row.createdAt,
      })),
    ];
  } catch (err) {
    logFailure(skill, err);
    return [];
  }
}

// Answer-key pages (/readingquestion/<slug>/answers …) exist only for passages
// with a complete, publishable key (lib/answerKeys.js answerPageEligible).
async function answerKeyEntries(skill) {
  try {
    const slugs = await listAnswerKeySlugs(skill);
    return slugs.map((slug) => ({ path: answersPath(skill, slug), lastmod: null }));
  } catch (err) {
    logFailure(`${skill} answer keys`, err);
    return [];
  }
}

// Essay-bank sample answers (pages/ielts-essay-bank/[slug].js).
function essayEntries() {
  return essays.map((essay) => ({ path: `/ielts-essay-bank/${essay.slug}`, lastmod: isoDate(essay.date) }));
}

function task2MonthEntries(now) {
  const prompts = withoutRetiredDuplicates('writing', TASK2_PROMPTS);
  return listAvailableRoundupMonths(prompts, now, 6)
    .map((slug) => buildMonthlyRoundup(prompts, slug, { now }))
    .filter((roundup) => task2MonthIndexable(roundup, now))
    .map((roundup) => ({
      path: `/ielts-writing-task-2-topics/${roundup.month.slug}`,
      lastmod: roundup.dateModified,
    }));
}

async function speakingEntries() {
  let items;
  try {
    items = await listSpeakingHubItems();
  } catch (err) {
    logFailure('speaking', err);
    // Without card counts we cannot tell thin topic hubs from full ones, so
    // leave them all out of this response rather than list a noindex page.
    return { entries: [], exclude: SPEAKING_FAMILY_SLUGS.map((family) => `/speaking/topics/${family}`) };
  }
  const cueCards = items.filter((item) => item.part === 2);
  const entries = [
    { path: '/speakingquestion', lastmod: newestCreatedAt(items) },
    { path: '/speaking/part-1', lastmod: newestCreatedAt(items) },
    { path: '/speaking/part-2', lastmod: newestCreatedAt(cueCards) },
    { path: '/speaking/part-3', lastmod: newestCreatedAt(items) },
    { path: '/ielts-speaking-cue-cards', lastmod: newestCreatedAt(cueCards) },
    ...items.map((item) => ({
      path: questionPath('speaking', { slug: item.slug }),
      lastmod: item.updatedAt || item.createdAt,
    })),
  ];
  const exclude = [];
  for (const family of SPEAKING_FAMILY_SLUGS) {
    const cards = cueCards.filter((item) => item.family === family);
    const path = `/speaking/topics/${family}`;
    if (speakingTopicHubIndexable(cards.length)) entries.push({ path, lastmod: newestCreatedAt(cards) });
    else exclude.push(path);
  }
  return { entries, exclude };
}

// Each loader returns { entries, exclude } for its section (static routes of
// the section are merged in by collectSitemapSection).
const SECTION_LOADERS = {
  guides: async () => ({ entries: [], exclude: [] }),
  blog: async () => ({
    entries: [
      { path: '/blog', lastmod: latestDate(posts.map((p) => p.updated || p.date)) },
      ...posts.map((post) => ({ path: `/blog/${post.slug}`, lastmod: isoDate(post.updated || post.date) })),
    ],
    exclude: [],
  }),
  reading: async () => ({
    entries: [
      ...(await passageEntries(SKILLS.reading, '/readingquestion')),
      ...(await answerKeyEntries(SKILLS.reading)),
    ],
    exclude: [],
  }),
  writing: async (now) => ({
    entries: [
      ...(await passageEntries(SKILLS.writing, '/writingquestion')),
      ...task2MonthEntries(now),
      { path: '/ielts-essay-bank', lastmod: latestDate(essays.map((e) => e.date)) },
      ...essayEntries(),
    ],
    exclude: [],
  }),
  listening: async () => ({
    entries: [
      ...(await passageEntries(SKILLS.listening, '/listeningquestion')),
      ...(await answerKeyEntries(SKILLS.listening)),
    ],
    exclude: [],
  }),
  speaking: speakingEntries,
};

export async function collectSitemapSection(section, { staticRoutes = [], now = new Date() } = {}) {
  if (!SITEMAP_SECTIONS.includes(section)) return null;
  const { entries, exclude } = await SECTION_LOADERS[section](now);
  // Static routes first (in declaration order); data entries with real dates
  // are merged over them by normaliseEntries.
  const statics = staticRoutes
    .filter((route) => sitemapSectionFor(route) === section)
    .map((path) => ({ path, lastmod: null }));
  return normaliseEntries([...statics, ...entries], { exclude, today: isoDate(now) });
}

export async function collectAllSitemapSections({ staticRoutes = [], now = new Date() } = {}) {
  const lists = await Promise.all(
    SITEMAP_SECTIONS.map((section) => collectSitemapSection(section, { staticRoutes, now }))
  );
  return Object.fromEntries(SITEMAP_SECTIONS.map((section, i) => [section, lists[i]]));
}

// getServerSideProps body for a child sitemap (pages/sitemap-<section>.xml.js).
// Lives here, not in a page module, so the fs-reading post loader can never be
// pulled into a client bundle.
export async function renderSitemapSection(section, res, staticRoutes) {
  const entries = await collectSitemapSection(section, { staticRoutes });
  sendXml(res, urlsetXml(entries || []));
  return { props: {} };
}
