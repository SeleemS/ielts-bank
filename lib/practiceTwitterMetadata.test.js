import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const templates = [
  {
    name: 'section landing',
    path: '../src/components/SectionLanding.js',
    title: 'content={title}',
    description: 'content={description}',
  },
  {
    name: 'speaking landing',
    path: '../pages/speakingquestion/index.js',
    title: 'content={PAGE_TITLE}',
    description: 'content={PAGE_DESCRIPTION}',
  },
  {
    name: 'reading exercise',
    path: '../src/pages/ReadingQuestion.js',
    title: 'content={pageTitle}',
    description: 'content={metaDescription}',
  },
  {
    name: 'listening exercise',
    path: '../src/pages/ListeningQuestion.js',
    title: 'content={pageTitle}',
    description: 'content={metaDescription}',
  },
  {
    name: 'writing exercise',
    path: '../src/pages/WritingQuestion.js',
    title: 'content={pageTitle}',
    description: 'content={metaDescription}',
  },
  {
    name: 'speaking exercise',
    path: '../src/pages/SpeakingQuestion.js',
    title: 'content={pageTitle}',
    description: 'content={metaDescription}',
  },
];

describe.each(templates)('$name Twitter metadata', ({ path, title, description }) => {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');

  it('publishes an explicit complete large-card contract', () => {
    expect(source).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(source).toContain(`<meta name="twitter:title" ${title} />`);
    expect(source).toContain(`<meta name="twitter:description" ${description} />`);
    expect(source).toContain('<meta name="twitter:image" content=');
    expect(source).toContain('<meta name="twitter:image:alt" content=');
  });
});
