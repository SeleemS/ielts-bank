import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';
import {
  CUE_CARD_HUB_CANONICAL,
  buildCueCardHub,
  buildCueCardHubJsonLd,
  cueCardHubSeo,
  cueCardSeason,
  formatUpdatedDate,
  groupCueCardsByFamily,
} from './cueCardHub';
import { STATIC_ROUTES } from '../pages/sitemap.xml';
import { sitemapSectionFor } from './sitemap';
import { buildHomeDirectory } from './siteDirectory';

const require = createRequire(import.meta.url);
const nextConfig = require('../next.config.js');

const item = (slug, part, family, createdAt, extra = {}) => ({
  slug,
  href: `/speakingquestion/${slug}`,
  title: `Title ${slug}`,
  topic: `Describe ${slug}.`,
  part,
  family,
  createdAt,
  difficulty: 'medium',
  bullets: ['who', 'when', 'what', 'why', 'extra'],
  ...extra,
});

const ITEMS = [
  item('old-person', 2, 'people', '2026-07-12T04:52:24Z'),
  item('new-person', 2, 'people', '2026-09-02T06:18:42Z'),
  item('new-place', 2, 'places', '2026-09-01T10:00:00Z'),
  item('film', 2, 'media', '2026-07-10T10:00:00Z'),
  item('mystery', 2, null, '2026-06-01T10:00:00Z'),
  item('part1-set', 1, 'people', '2026-09-20T10:00:00Z'),
];
const NOW = new Date('2026-09-23T12:00:00Z');

describe('cue card season', () => {
  it('names the current four-month topic season', () => {
    expect(cueCardSeason(new Date('2026-01-05T00:00:00Z')).label).toBe('January–April 2026');
    expect(cueCardSeason(new Date('2026-05-01T00:00:00Z')).label).toBe('May–August 2026');
    expect(cueCardSeason(new Date('2026-09-23T00:00:00Z')).label).toBe('September–December 2026');
    expect(cueCardSeason(new Date('2026-12-31T23:00:00Z')).label).toBe('September–December 2026');
  });

  it('formats the real update date and refuses bad input', () => {
    expect(formatUpdatedDate('2026-09-02T06:18:42Z')).toBe('2 September 2026');
    expect(formatUpdatedDate(null)).toBeNull();
    expect(formatUpdatedDate('nope')).toBeNull();
  });
});

describe('cue card hub payload', () => {
  const hub = buildCueCardHub(ITEMS, NOW);

  it('lists only Part 2 cue cards, newest first, dated from the newest card', () => {
    expect(hub.total).toBe(5);
    expect(hub.updatedAt).toBe('2026-09-02T06:18:42Z');
    expect(hub.updatedLabel).toBe('2 September 2026');
    expect(hub.recent.map((c) => c.slug)).toEqual(['new-person', 'new-place']);
    expect(hub.recentMonthLabel).toBe('September 2026');
  });

  it('groups by topic family, freshest family first, with Other topics last', () => {
    expect(hub.groups.map((g) => g.family)).toEqual(['people', 'places', 'media', 'other']);
    expect(hub.groups[0].items.map((c) => c.slug)).toEqual(['new-person', 'old-person']);
    expect(hub.groups[0].hubHref).toBe('/speaking/topics/people');
    expect(hub.groups.at(-1)).toMatchObject({ label: 'Other topics', hubHref: null });
    // Every card appears in exactly one family group.
    expect(hub.groups.flatMap((g) => g.items).length).toBe(hub.total);
  });

  it('keeps the page payload lean', () => {
    const card = hub.groups[0].items[0];
    expect(Object.keys(card).sort()).toEqual(['bullets', 'createdAt', 'difficulty', 'family', 'href', 'slug', 'topic']);
    expect(card.bullets).toHaveLength(4);
  });

  it('handles an empty bank', () => {
    const empty = buildCueCardHub([], NOW);
    expect(empty).toMatchObject({ total: 0, updatedAt: null, updatedLabel: null, recent: [], groups: [] });
    expect(groupCueCardsByFamily([])).toEqual([]);
  });
});

describe('cue card hub SEO', () => {
  const hub = buildCueCardHub(ITEMS, NOW);
  const seo = cueCardHubSeo(hub);

  it('titles the page for the season and describes practice cards honestly', () => {
    expect(seo.title).toBe('IELTS Speaking Cue Cards September–December 2026');
    expect(seo.canonical).toBe(CUE_CARD_HUB_CANONICAL);
    expect(seo.canonical).toBe('https://www.ielts-bank.com/ielts-speaking-cue-cards');
    expect(`${seo.title} ${seo.description}`).not.toMatch(/recent exam|reported|real test|actual test/i);
    expect(seo.description).toMatch(/practice cue cards/);
  });

  it('emits valid JSON-LD with truthful freshness and every card listed', () => {
    const jsonLd = buildCueCardHubJsonLd(hub, seo);
    expect(JSON.parse(JSON.stringify(jsonLd))).toEqual(jsonLd);
    const page = jsonLd['@graph'].find((n) => n['@type'] === 'CollectionPage');
    expect(page.dateModified).toBe('2026-09-02T06:18:42.000Z');
    expect(page.mainEntity.numberOfItems).toBe(5);
    expect(page.mainEntity.itemListElement).toHaveLength(5);
    const crumbs = jsonLd['@graph'].find((n) => n['@type'] === 'BreadcrumbList');
    expect(crumbs.itemListElement.at(-1).item).toBe(CUE_CARD_HUB_CANONICAL);
  });

  it('omits dateModified when there is no card date', () => {
    const empty = buildCueCardHub([], NOW);
    const page = buildCueCardHubJsonLd(empty, cueCardHubSeo(empty))['@graph'][1];
    expect(page.dateModified).toBeUndefined();
  });
});

describe('cue card hub replaces /speaking/new-cue-cards', () => {
  it('is in the speaking sitemap; the old URL is not', () => {
    expect(STATIC_ROUTES).toContain('/ielts-speaking-cue-cards');
    expect(STATIC_ROUTES).not.toContain('/speaking/new-cue-cards');
    expect(sitemapSectionFor('/ielts-speaking-cue-cards')).toBe('speaking');
  });

  it('permanently redirects the old URL (no duplicate hub)', async () => {
    const redirects = await nextConfig.redirects();
    expect(redirects).toContainEqual({
      source: '/speaking/new-cue-cards',
      destination: '/ielts-speaking-cue-cards',
      permanent: true,
    });
    // The destination is not itself redirected (no chain).
    expect(redirects.some((r) => r.source === '/ielts-speaking-cue-cards')).toBe(false);
  });

  it('is linked from the home directory instead of the old URL', () => {
    const hrefs = buildHomeDirectory().flatMap((g) => g.links.map((l) => l.href));
    expect(hrefs).toContain('/ielts-speaking-cue-cards');
    expect(hrefs).not.toContain('/speaking/new-cue-cards');
  });
});
