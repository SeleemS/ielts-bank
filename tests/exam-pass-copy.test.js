// The Exam Pass length is promised in many places. Every one of them must
// render EXAM_PASS_DAYS (src/lib/saleConfig.js) — the same value checkout
// stamps and the webhook grants — so copy can never disagree with the grant.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const COPY_FILES = [
  'pages/pricing.jsx',
  'pages/ielts-writing-checker.jsx',
  'src/components/ExamPassOffer.jsx',
  'src/components/AiQuotaPanel.jsx',
  'src/pages/HomePage.js',
  'src/pages/TermsOfService.js',
  'lib/pricingSeo.js',
  'lib/lifecycleEmail.js',
];

describe('Exam Pass length copy', () => {
  it.each(COPY_FILES)('%s has no hard-coded pass length', (file) => {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    expect(source).not.toMatch(/\b(?:30|45)[- ]day\b/i);
    expect(source).not.toMatch(/\b(?:30|45) days\b/i);
  });
});
