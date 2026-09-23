// lib/indexability.js
// Which data-driven templates are worth a place in Google's index.
//
// GSC (Sep 2026): 103 pages indexed, 534 "Discovered – currently not indexed".
// Google rations crawl on a young, low-authority site, and a crop of thin
// near-duplicate URLs lowers its view of the whole domain. The rules below
// noindex (but keep FOLLOWING the links on) templates that currently render
// too little unique content, and the sitemap applies the SAME functions so the
// two can never disagree (a sitemap listing a noindex page is a GSC error).
//
// Every rule is data-driven, so a page re-enters the index on its own once the
// content arrives. Decisions and evidence: docs/growth-2026-09-23/30-TECH-SEO-CHANGES.md

export const ROBOTS_INDEX = 'index, follow';
export const ROBOTS_NOINDEX = 'noindex, follow';

// /mock/<slug>: Premium-gated shells — title, one-line description and a
// skeleton (24–29 visible words, 7 near-identical pages). The /mock-test hub
// stays indexed and is the page that should rank for "IELTS mock test".
export const MOCK_TEST_PAGES_INDEXABLE = false;

// /speaking/topics/<family>: a hub with 0–2 cue cards is a heading, a stock
// paragraph and one or two links. 3+ cards makes it a genuine collection.
// Sep 23 2026: 12 of 16 families are below the bar.
export const MIN_CUE_CARDS_FOR_TOPIC_HUB = 3;

export function speakingTopicHubIndexable(cueCardCount) {
  return Number(cueCardCount) >= MIN_CUE_CARDS_FOR_TOPIC_HUB;
}

// /ielts-writing-task-2-topics/<month>: when nothing was added that month the
// roundup falls back to "recently added" prompts — the same list as the
// previous month, i.e. a near-duplicate page. Exception: the CURRENT month
// stays indexable even in fallback, because it is the page people search for
// ("ielts writing task 2 topics september 2026" earned 17 clicks in GSC) and
// it fills up as prompts are added during the month.
export function task2MonthIndexable(roundup, now = new Date()) {
  if (!roundup) return false;
  if (roundup.source !== 'recent') return true;
  const current = new Date(now).toISOString().slice(0, 7);
  return roundup.month?.isoMonth === current;
}

export function robotsContent(indexable) {
  return indexable ? ROBOTS_INDEX : ROBOTS_NOINDEX;
}
