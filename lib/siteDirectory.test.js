import { describe, expect, it } from 'vitest';
import { buildHomeDirectory, listeningPartLinks, questionContextLinks } from './siteDirectory';
import { breadcrumbJsonLd, questionBreadcrumbs } from './breadcrumbs';
import { STATIC_ROUTES } from '../pages/sitemap.xml';

const indexable = new Set(STATIC_ROUTES);

describe('home directory', () => {
  const groups = buildHomeDirectory();
  const hrefs = groups.flatMap((g) => g.links.map((l) => l.href));

  it('links every reading type, listening part and speaking part hub from the home page', () => {
    for (const route of STATIC_ROUTES.filter((r) => /^\/(reading|listening)\/|^\/speaking\/part-/.test(r))) {
      expect(hrefs, route).toContain(route);
    }
  });

  it('only links live, indexable static routes, once each', () => {
    for (const href of hrefs) expect(indexable.has(href), href).toBe(true);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe('question context links', () => {
  const allowed = (href) => indexable.has(href);

  it('gives reading pages their question-type guides first', () => {
    const links = questionContextLinks('reading', {
      groups: [{ questionType: 'matching_headings' }, { questionType: 'true_false_notgiven' }],
    });
    expect(links[0].href).toBe('/reading/true-false-not-given');
    expect(links.map((l) => l.href)).toContain('/reading/matching-headings');
    expect(links.length).toBeGreaterThanOrEqual(4);
    expect(links.length).toBeLessThanOrEqual(6);
  });

  it('gives listening pages their part guide', () => {
    expect(questionContextLinks('listening', { listeningPart: 3 })[0].href).toBe('/listening/part-3');
    expect(questionContextLinks('listening', {}).map((l) => l.href)).not.toContain('/listening/part-undefined');
  });

  it('points every skill at 4–6 indexable hubs and tools', () => {
    for (const [skill, passage] of [
      ['reading', { groups: [] }],
      ['writing', { writing: { task: 1 } }],
      ['writing', { writing: { task: 2 } }],
      ['listening', { listeningPart: 1 }],
      ['speaking', {}],
    ]) {
      const links = questionContextLinks(skill, passage);
      expect(links.length, skill).toBeGreaterThanOrEqual(4);
      expect(links.length, skill).toBeLessThanOrEqual(6);
      for (const { href } of links) expect(allowed(href), `${skill} ${href}`).toBe(true);
      expect(new Set(links.map((l) => l.href)).size).toBe(links.length);
    }
  });

  it('returns nothing for an unknown skill', () => {
    expect(questionContextLinks('maths', {})).toEqual([]);
  });

  it('builds the listening part chips', () => {
    expect(listeningPartLinks().map((l) => l.href)).toEqual([
      '/listening/part-1',
      '/listening/part-2',
      '/listening/part-3',
      '/listening/part-4',
    ]);
  });
});

describe('breadcrumbs', () => {
  it('builds the visible trail and matching BreadcrumbList JSON-LD', () => {
    const trail = questionBreadcrumbs('reading', 'Coal and Pollution', 'https://www.ielts-bank.com/readingquestion/coal-and-pollution-1kkkl2');
    expect(trail.map((t) => t.label)).toEqual(['Home', 'IELTS Reading', 'Coal and Pollution']);
    expect(breadcrumbJsonLd(trail)).toEqual({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.ielts-bank.com/' },
        { '@type': 'ListItem', position: 2, name: 'IELTS Reading', item: 'https://www.ielts-bank.com/readingquestion' },
        {
          '@type': 'ListItem',
          position: 3,
          name: 'Coal and Pollution',
          item: 'https://www.ielts-bank.com/readingquestion/coal-and-pollution-1kkkl2',
        },
      ],
    });
  });
});
