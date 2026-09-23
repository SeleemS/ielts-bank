import { describe, expect, it } from 'vitest';
import {
  WRITING_CHECKER_TASK_SLUGS,
  buildWritingCheckerTaskJsonLd,
  checkerTaskBreadcrumbs,
  checkerTaskPath,
  getWritingCheckerTaskPage,
  pickCheckerSamples,
} from './writingCheckerTasks';
import {
  WRITING_CHECKER_SEO,
  WRITING_CHECKER_TASK_LINKS,
  buildWritingCheckerAppJsonLd,
} from './writingCheckerSeo';
import { freeScoreCopy } from './freeScorePeriod';
import { essays } from './essays';
import { STATIC_ROUTES } from '../pages/sitemap.xml';
import { adsAllowedForPath } from '../src/lib/adPolicy';

const SITE = 'https://www.ielts-bank.com';
const pages = WRITING_CHECKER_TASK_SLUGS.map((slug) => getWritingCheckerTaskPage(slug));

const EXPECTED = {
  'task-2': { locked: 'task2', firstCriterion: 'Task Response', minimum: 250, buckets: ['task2-academic', 'task2-general'] },
  'task-1': { locked: 'task1-academic', firstCriterion: 'Task Achievement', minimum: 150, buckets: ['task1-academic'] },
  'general-training-letter': {
    locked: 'task1-general',
    firstCriterion: 'Task Achievement',
    minimum: 150,
    buckets: ['task1-general'],
  },
};

describe('task checker pages: routing and metadata', () => {
  it('builds the three task pages the main checker links to', () => {
    expect(WRITING_CHECKER_TASK_SLUGS).toEqual(['task-2', 'task-1', 'general-training-letter']);
    expect(WRITING_CHECKER_TASK_LINKS.map((l) => l.href)).toEqual(WRITING_CHECKER_TASK_SLUGS.map(checkerTaskPath));
    expect(getWritingCheckerTaskPage('task-3')).toBeNull();
  });

  it('lists every task page in the sitemap and keeps them ad-free like the main checker', () => {
    expect(adsAllowedForPath('/ielts-writing-checker')).toBe(false);
    for (const page of pages) {
      expect(STATIC_ROUTES, page.path).toContain(page.path);
      expect(adsAllowedForPath(page.path), page.path).toBe(false);
      expect(adsAllowedForPath(`${page.path}?entry=essay_bank`), page.path).toBe(false);
    }
  });

  it('gives each page a self-referencing canonical that no other checker page shares', () => {
    const canonicals = pages.map((page) => page.canonical);
    for (const page of pages) expect(page.canonical).toBe(`${SITE}/ielts-writing-checker/${page.slug}`);
    expect(new Set([...canonicals, WRITING_CHECKER_SEO.canonical]).size).toBe(canonicals.length + 1);
  });

  it('uses distinct, keyword-led titles and descriptions of a sensible length', () => {
    expect(pages[0].title).toBe('IELTS Writing Task 2 Checker – Free AI Band Score & Feedback');
    for (const page of pages) {
      expect(page.title).toMatch(/Checker/);
      expect(page.title).toMatch(/Free AI Band Score/);
      expect(page.title.length).toBeLessThanOrEqual(65);
      expect(page.description.length).toBeGreaterThan(100);
      expect(page.description.length).toBeLessThanOrEqual(220);
    }
    expect(new Set(pages.map((p) => p.title)).size).toBe(3);
    expect(new Set(pages.map((p) => p.description)).size).toBe(3);
    expect(new Set([...pages.map((p) => p.title), WRITING_CHECKER_SEO.title]).size).toBe(4);
  });

  it('keeps "free" honest: the free allowance wording comes from freeScoreCopy()', () => {
    const copy = freeScoreCopy();
    for (const page of pages) {
      expect(page.description).toContain(copy.checkerFreeLine);
      const freeFaq = page.faq.find((item) => /free\?$/.test(item.q));
      expect(freeFaq, page.slug).toBeTruthy();
      expect(freeFaq.a).toContain(copy.heroFreeLine);
      expect(freeFaq.a).toMatch(/Pro/);
    }
  });
});

describe('task checker pages: task-specific content', () => {
  it('locks the checker to the right task and states the right minimum', () => {
    for (const page of pages) {
      const want = EXPECTED[page.slug];
      expect(page.lockedTaskType, page.slug).toBe(want.locked);
      expect(page.wordRules.minimum, page.slug).toBe(want.minimum);
      expect(page.wordRules.points[0]).toContain(String(want.minimum));
    }
  });

  it('explains the four criteria as they apply to the task (TR vs TA)', () => {
    for (const page of pages) {
      expect(page.criteria.map((c) => c.name), page.slug).toEqual([
        EXPECTED[page.slug].firstCriterion,
        'Coherence and Cohesion',
        'Lexical Resource',
        'Grammatical Range and Accuracy',
      ]);
    }
    const letter = getWritingCheckerTaskPage('general-training-letter');
    expect(letter.criteria[0].body).toMatch(/tone/);
    expect(letter.criteria[0].body).toMatch(/bullet/);
    expect(getWritingCheckerTaskPage('task-1').criteria[0].body).toMatch(/overview/);
  });

  it('carries unique copy on every page (no templated duplicates)', () => {
    const blocks = pages.flatMap((page) => [
      page.intro,
      page.criteriaIntro,
      ...page.criteria.map((c) => c.body),
      ...page.mistakes.map((m) => m.body),
      ...page.wordRules.points,
    ]);
    expect(new Set(blocks).size).toBe(blocks.length);
    for (const page of pages) expect(page.mistakes.length).toBeGreaterThanOrEqual(5);
  });

  it('links 2–3 existing essay-bank samples of the same task', () => {
    for (const page of pages) {
      const samples = pickCheckerSamples(page, essays);
      expect(samples.length, page.slug).toBe(page.sampleSlugs.length);
      expect(samples.length).toBeGreaterThanOrEqual(2);
      expect(samples.length).toBeLessThanOrEqual(3);
      for (const sample of samples) {
        expect(EXPECTED[page.slug].buckets, sample.slug).toContain(sample.bucket);
        expect(sample.href).toBe(`/ielts-essay-bank/${sample.slug}`);
        expect(sample.practiceHref).toMatch(/^\/writingquestion\/[a-z0-9-]+$/);
        expect(sample.opening.length).toBeLessThanOrEqual(221);
      }
    }
  });
});

describe('task checker pages: structured data', () => {
  it('emits valid WebApplication, FAQPage and BreadcrumbList blocks', () => {
    const main = buildWritingCheckerAppJsonLd();
    for (const page of pages) {
      const blocks = buildWritingCheckerTaskJsonLd(page);
      // Round-trips as JSON (what the page serialises into <script>).
      expect(JSON.parse(JSON.stringify(blocks))).toEqual(blocks);
      expect(blocks.map((b) => b['@type'])).toEqual(['WebApplication', 'FAQPage', 'BreadcrumbList']);
      for (const block of blocks) expect(block['@context']).toBe('https://schema.org');

      const [app, faq, crumbs] = blocks;
      // Mirrors the main checker's WebApplication shape, with this page's URL.
      expect(Object.keys(app).sort()).toEqual(Object.keys(main).sort());
      expect(app.url).toBe(page.canonical);
      expect(app['@id']).toBe(`${page.canonical}#app`);
      expect(app.offers).toEqual(main.offers);
      expect(app.applicationCategory).toBe('EducationalApplication');
      expect(app.aggregateRating).toBeUndefined();

      // FAQPage describes exactly the visible Q&As.
      expect(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(page.faq.map((i) => [i.q, i.a]));

      // Breadcrumb JSON-LD matches the visible trail and ends at the canonical.
      const trail = checkerTaskBreadcrumbs(page);
      expect(crumbs.itemListElement.map((i) => i.name)).toEqual(trail.map((t) => t.label));
      expect(crumbs.itemListElement.at(-1).item).toBe(page.canonical);
    }
  });

  it('leaves the main checker WebApplication unchanged', () => {
    const main = buildWritingCheckerAppJsonLd();
    expect(main.url).toBe(`${SITE}/ielts-writing-checker`);
    expect(main.name).toBe('IELTS-Bank AI Writing Checker');
    expect(main.description).toBe(WRITING_CHECKER_SEO.description);
  });
});
