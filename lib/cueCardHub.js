// lib/cueCardHub.js
// Pure helpers for /ielts-speaking-cue-cards, the seasonal hub of every
// published IELTS Speaking Part 2 cue card (it replaced /speaking/new-cue-cards,
// which now 308s here).
//
// Honesty rules (docs/growth-2026-09-23/10-SEO-STRATEGY.md action #9):
//   * the "season" in the title is the calendar window we are in, described as
//     practice cards "in the style of the current topic season" — never as
//     cards "reported in the real test";
//   * "Updated <date>" is the newest card's own created_at, never "now".

import { SITE_URL } from './site';
import { SPEAKING_TOPIC_FAMILIES } from './speakingTopicFamilies';

export const CUE_CARD_HUB_PATH = '/ielts-speaking-cue-cards';
export const CUE_CARD_HUB_CANONICAL = `${SITE_URL}${CUE_CARD_HUB_PATH}`;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// IELTS Speaking topics are commonly discussed in three four-month seasons:
// January–April, May–August and September–December.
export function cueCardSeason(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const month = date.getUTCMonth();
  const start = Math.floor(month / 4) * 4;
  const year = date.getUTCFullYear();
  return {
    start,
    year,
    label: `${MONTHS[start]}–${MONTHS[start + 3]} ${year}`,
  };
}

// "2026-09-02T06:18:42Z" -> "2 September 2026" (UTC), or null.
export function formatUpdatedDate(iso) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

const byNewest = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));

// The small card shape the page renders (keeps the page payload lean).
export function toCueCardSummary(item) {
  return {
    slug: item.slug,
    href: item.href,
    topic: item.topic || item.title,
    bullets: (item.bullets || []).slice(0, 4),
    difficulty: item.difficulty || null,
    family: item.family || null,
    createdAt: item.createdAt || null,
  };
}

// Cue cards grouped by topic family. Families are ordered by their newest card
// (so the freshest topics lead), then by size; cards inside a family are
// newest first. Cards with no family land in a final "Other topics" group.
export function groupCueCardsByFamily(cards = []) {
  const groups = new Map();
  for (const card of cards) {
    const key = card.family && SPEAKING_TOPIC_FAMILIES[card.family] ? card.family : 'other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }
  return [...groups.entries()]
    .map(([family, items]) => {
      const sorted = items.slice().sort(byNewest);
      const config = SPEAKING_TOPIC_FAMILIES[family];
      return {
        family,
        label: config ? config.label : 'Other topics',
        blurb: config ? config.blurb : '',
        hubHref: config ? `/speaking/topics/${family}` : null,
        newest: sorted[0]?.createdAt || null,
        items: sorted,
      };
    })
    .sort((a, b) => {
      if (a.family === 'other') return 1;
      if (b.family === 'other') return -1;
      return (
        String(b.newest || '').localeCompare(String(a.newest || '')) ||
        b.items.length - a.items.length ||
        a.label.localeCompare(b.label)
      );
    });
}

export function buildCueCardHub(hubItems = [], now = new Date()) {
  const cards = hubItems.filter((item) => item.part === 2).map(toCueCardSummary).sort(byNewest);
  const season = cueCardSeason(now);
  const updatedAt = cards[0]?.createdAt || null;
  const groups = groupCueCardsByFamily(cards);
  // "Recently added": the cards published in the newest calendar month.
  const newestMonth = updatedAt ? String(updatedAt).slice(0, 7) : null;
  const recent = newestMonth ? cards.filter((card) => String(card.createdAt || '').startsWith(newestMonth)) : [];
  return {
    season,
    total: cards.length,
    updatedAt,
    updatedLabel: formatUpdatedDate(updatedAt),
    recent: recent.slice(0, 8),
    recentMonthLabel: updatedAt ? `${MONTHS[new Date(updatedAt).getUTCMonth()]} ${new Date(updatedAt).getUTCFullYear()}` : null,
    groups,
  };
}

export function cueCardHubSeo(hub) {
  const title = `IELTS Speaking Cue Cards ${hub.season.label}`;
  const description = `${hub.total} free IELTS Speaking Part 2 practice cue cards for ${hub.season.label}, grouped by topic, newest first. Each card has examiner audio, a prep timer and a Band 8–9 model answer.`;
  return {
    title,
    description,
    canonical: CUE_CARD_HUB_CANONICAL,
    ogImage: `${SITE_URL}/api/og?title=${encodeURIComponent('IELTS Speaking Cue Cards')}&type=speaking&subtitle=${encodeURIComponent(hub.season.label)}`,
    imageAlt: `IELTS Speaking cue cards for ${hub.season.label} — IELTS-Bank`,
  };
}

export function buildCueCardHubJsonLd(hub, seo) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'Speaking', item: `${SITE_URL}/speakingquestion` },
          { '@type': 'ListItem', position: 3, name: 'Cue cards', item: CUE_CARD_HUB_CANONICAL },
        ],
      },
      {
        '@type': 'CollectionPage',
        '@id': `${CUE_CARD_HUB_CANONICAL}#page`,
        name: seo.title,
        url: CUE_CARD_HUB_CANONICAL,
        description: seo.description,
        inLanguage: 'en',
        // Truthful freshness: the newest cue card's own timestamp, never "now".
        ...(hub.updatedAt ? { dateModified: new Date(hub.updatedAt).toISOString() } : {}),
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: hub.total,
          itemListElement: hub.groups
            .flatMap((group) => group.items)
            .map((card, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              name: card.topic,
              url: `${SITE_URL}${card.href}`,
            })),
        },
      },
    ],
  };
}
