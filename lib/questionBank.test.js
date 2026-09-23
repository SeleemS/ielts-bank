import { describe, expect, it } from 'vitest';
import {
  QUESTION_BANK_CANONICAL,
  buildQuestionBankJsonLd,
  buildQuestionBankSummary,
  questionBankDescription,
  questionBankFaq,
  questionBankTitle,
  questionBankTotal,
} from './questionBank';
import { STATIC_ROUTES } from '../pages/sitemap.xml';
import { sitemapSectionFor } from './sitemap';
import { adsAllowedForPath } from '../src/lib/adPolicy';
import { readFileSync } from 'node:fs';
import { buildHomeDirectory } from './siteDirectory';

const RAW = {
  readingItems: [
    { id: 'coal-and-pollution-1kkkl2', title: 'Coal and Pollution', questionTypes: ['true_false_notgiven', 'matching_headings'] },
    { id: 'numeration-h0t1fd', title: 'Numeration', questionTypes: ['true_false_notgiven'] },
    { id: 'venus-in-transit-1v2mtl', title: 'Venus in Transit', questionTypes: [] },
  ],
  listeningItems: [
    { id: 'booking-a-taxi-abc123', title: 'Booking a Taxi' },
    { id: 'museum-tour-def456', title: 'Museum Tour' },
  ],
  writingItems: [{ id: 'w1', title: 'W1' }, { id: 'w2', title: 'W2' }],
  speakingItems: [
    { slug: 's1', part: 1 },
    { slug: 's2', part: 2 },
    { slug: 's3', part: 2 },
    { slug: 's4', part: 3 },
  ],
  readingQuestions: 40,
  listeningQuestions: 20,
  listeningPartCounts: { 1: 1, 2: 0, 3: 1, 4: 0 },
  answerKeySlugs: { reading: ['numeration-h0t1fd', 'coal-and-pollution-1kkkl2', 'missing-slug'], listening: [] },
  essayBankCount: 204,
  mockTestCount: 7,
};

describe('question bank counts', () => {
  const summary = buildQuestionBankSummary(RAW);

  it('counts Reading/Listening questions individually and Writing/Speaking items once', () => {
    expect(summary.skills.reading).toMatchObject({ items: 3, questions: 40 });
    expect(summary.skills.listening).toMatchObject({ items: 2, questions: 20 });
    expect(summary.skills.writing).toMatchObject({ items: 2, questions: 2 });
    expect(summary.skills.speaking).toMatchObject({ items: 4, questions: 4 });
    expect(summary.total).toBe(40 + 20 + 2 + 4);
    expect(questionBankTotal({ readingQuestions: -3, listeningQuestions: 'x', writingPrompts: 2.7, speakingSets: 1 })).toBe(3);
  });

  it('counts passages per Reading question type, hiding empty types', () => {
    const byHref = Object.fromEntries(summary.readingTypes.map((t) => [t.href, t.count]));
    expect(byHref['/reading/true-false-not-given']).toBe(2);
    expect(byHref['/reading/matching-headings']).toBe(1);
    expect(summary.readingTypes.every((t) => t.count > 0)).toBe(true);
  });

  it('counts Listening and Speaking parts and cue cards', () => {
    expect(summary.listeningParts.map((p) => [p.href, p.count])).toEqual([
      ['/listening/part-1', 1],
      ['/listening/part-2', 0],
      ['/listening/part-3', 1],
      ['/listening/part-4', 0],
    ]);
    expect(summary.speakingParts.map((p) => p.count)).toEqual([1, 2, 1]);
    expect(summary.cueCards).toBe(2);
  });

  it('links answer-key pages only for passages it can name, A–Z', () => {
    const reading = summary.answerKeys.find((k) => k.skill === 'reading');
    expect(reading.count).toBe(3);
    expect(reading.links).toEqual([
      { href: '/readingquestion/coal-and-pollution-1kkkl2/answers', label: 'Coal and Pollution answers' },
      { href: '/readingquestion/numeration-h0t1fd/answers', label: 'Numeration answers' },
    ]);
  });

  it('survives empty input without inventing numbers', () => {
    const empty = buildQuestionBankSummary({});
    expect(empty.total).toBe(0);
    expect(questionBankTitle(empty.total)).toBe('IELTS Question Bank: Free Practice Questions with Answers');
  });
});

describe('question bank page metadata', () => {
  const summary = buildQuestionBankSummary(RAW);

  it('puts the live total in the title', () => {
    expect(questionBankTitle(2806)).toBe('IELTS Question Bank: 2,806 Free Practice Questions with Answers');
    expect(questionBankDescription(summary)).toMatch(/question bank and test database/);
    expect(questionBankDescription(summary)).toMatch(/Original practice material/);
  });

  it('is an indexable, ad-eligible guide page in the sitemap with a self canonical', () => {
    expect(STATIC_ROUTES).toContain('/ielts-question-bank');
    expect(sitemapSectionFor('/ielts-question-bank')).toBe('guides');
    expect(adsAllowedForPath('/ielts-question-bank')).toBe(true);
    expect(QUESTION_BANK_CANONICAL).toBe('https://www.ielts-bank.com/ielts-question-bank');
  });

  it('is linked from the home page directory and the footer on every page', () => {
    const hrefs = buildHomeDirectory().flatMap((g) => g.links.map((l) => l.href));
    expect(hrefs).toContain('/ielts-question-bank');
    const footer = readFileSync(new URL('../src/components/Footer.jsx', import.meta.url), 'utf8');
    expect(footer).toContain("href: '/ielts-question-bank'");
  });

  it('never claims to be official material', () => {
    const faq = questionBankFaq(summary);
    expect(faq[0].q).toBe('Are these official IELTS questions?');
    expect(faq[0].a).toMatch(/^No\./);
    expect(faq[0].a).toMatch(/original practice material/);
  });

  it('emits valid CollectionPage, BreadcrumbList and FAQPage JSON-LD mirroring the visible FAQ', () => {
    const title = questionBankTitle(summary.total);
    const jsonLd = buildQuestionBankJsonLd(summary, title, questionBankDescription(summary));
    expect(JSON.parse(JSON.stringify(jsonLd))).toEqual(jsonLd);
    expect(jsonLd['@graph'].map((n) => n['@type'])).toEqual(['CollectionPage', 'BreadcrumbList', 'FAQPage']);
    const [page, crumbs, faq] = jsonLd['@graph'];
    expect(page.url).toBe(QUESTION_BANK_CANONICAL);
    expect(page.name).toBe(title);
    expect(page.mainEntity.numberOfItems).toBe(page.mainEntity.itemListElement.length);
    for (const item of page.mainEntity.itemListElement) {
      const path = item.url.replace('https://www.ielts-bank.com', '');
      expect(STATIC_ROUTES, path).toContain(path);
    }
    expect(crumbs.itemListElement.at(-1).item).toBe(QUESTION_BANK_CANONICAL);
    expect(faq.mainEntity.map((q) => q.name)).toEqual(questionBankFaq(summary).map((i) => i.q));
  });
});
