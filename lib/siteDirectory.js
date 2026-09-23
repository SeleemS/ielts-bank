// lib/siteDirectory.js
// Server-side builders for crawlable "directory" link blocks.
//
// The Sep 2026 crawl found hub pages 4–5 clicks from the home page (all four
// /listening/part-N hubs, the score-requirement countries, the Task 2 month
// pages) and 67 Writing questions with no inbound link at all. These builders
// return plain [{ href, label }] data from getStaticProps, so the heavy content
// modules they read (question-type guides, part guides) never reach the client
// bundle — the page only ships the small link list it renders.

import { READING_QUESTION_TYPE_LINKS, READING_QUESTION_TYPES } from './readingQuestionTypes';
import { LISTENING_PART_LINKS } from './listeningQuestionTypes';
import { SPEAKING_PART_LINKS } from './speakingParts';

// Home page "Browse the question bank" directory: every hub one click from /.
export function buildHomeDirectory() {
  return [
    {
      title: 'Reading',
      links: [
        { href: '/readingquestion', label: 'All Reading practice' },
        ...READING_QUESTION_TYPE_LINKS.map(({ slug, label }) => ({ href: `/reading/${slug}`, label })),
      ],
    },
    {
      title: 'Listening',
      links: [
        { href: '/listeningquestion', label: 'All Listening practice' },
        ...LISTENING_PART_LINKS.map(({ slug, label }) => ({ href: `/listening/${slug}`, label: `Listening ${label}` })),
      ],
    },
    {
      title: 'Writing',
      links: [
        { href: '/writingquestion', label: 'All Writing prompts' },
        { href: '/ielts-writing-task-2-topics', label: 'Writing Task 2 topics' },
        { href: '/ielts-writing-checker', label: 'AI Writing Checker' },
        { href: '/ielts-writing-checker/task-2', label: 'Task 2 essay checker' },
        { href: '/ielts-writing-checker/task-1', label: 'Task 1 report checker' },
        { href: '/ielts-writing-checker/general-training-letter', label: 'GT letter checker' },
        { href: '/ielts-writing-checker-accuracy', label: 'Writing Checker accuracy' },
        { href: '/ielts-band-descriptors', label: 'Band descriptors' },
      ],
    },
    {
      title: 'Speaking',
      links: [
        { href: '/speakingquestion', label: 'All Speaking practice' },
        ...SPEAKING_PART_LINKS.map(({ slug, label }) => ({ href: `/speaking/${slug}`, label: `Speaking ${label}` })),
        { href: '/ielts-speaking-cue-cards', label: 'Speaking cue cards' },
        { href: '/speaking-examiner', label: 'AI Speaking Examiner' },
      ],
    },
    {
      title: 'Test guides',
      links: [
        { href: '/ielts-test-format', label: 'IELTS test format' },
        { href: '/ielts-score-requirements', label: 'Score requirements by country' },
        { href: '/ielts-vs-toefl-pte-duolingo', label: 'IELTS vs TOEFL, PTE & Duolingo' },
        { href: '/band-calculator', label: 'Band score calculator' },
        { href: '/band-estimator', label: 'Band estimator' },
        { href: '/mock-test', label: 'Mock tests' },
        { href: '/blog', label: 'Blog' },
      ],
    },
  ];
}

// Listening hub: one link per part guide.
export function listeningPartLinks() {
  return LISTENING_PART_LINKS.map(({ slug, label }) => ({ href: `/listening/${slug}`, label: `Listening ${label}` }));
}

// Contextual "Guides and tools" links for a question page (4–6 links).
// `passage` is the structured passage (reading/listening/writing) or the
// speaking item. Links are to hubs and tools only, never to another question
// (RelatedPractice covers those).
export function questionContextLinks(skill, passage = {}) {
  if (skill === 'reading') {
    const types = [...new Set((passage.groups || []).map((g) => g?.questionType || g?.question_type).filter(Boolean))];
    const typeLinks = READING_QUESTION_TYPE_LINKS.filter(({ questionType }) => types.includes(questionType))
      .slice(0, 2)
      .map(({ slug }) => ({
        href: `/reading/${slug}`,
        label: `${READING_QUESTION_TYPES[slug].label} strategy`,
      }));
    return [
      ...typeLinks,
      { href: '/readingquestion', label: 'All Reading practice passages' },
      { href: '/band-calculator', label: 'Convert your score to a band' },
      { href: '/ielts-test-format', label: 'IELTS Reading test format' },
      { href: '/mock-test', label: 'Full Reading mock tests' },
    ].slice(0, 6);
  }
  if (skill === 'listening') {
    const part = Number(passage.listeningPart);
    const partLink = LISTENING_PART_LINKS.find(({ slug }) => slug === `part-${part}`);
    return [
      ...(partLink ? [{ href: `/listening/${partLink.slug}`, label: `Listening ${partLink.label} strategy` }] : []),
      { href: '/listeningquestion', label: 'All Listening practice tests' },
      { href: '/band-calculator', label: 'Convert your score to a band' },
      { href: '/ielts-test-format', label: 'IELTS Listening test format' },
      { href: '/mock-test', label: 'Full Listening mock tests' },
    ];
  }
  if (skill === 'writing') {
    const task = Number(passage.writing?.task || passage.task);
    return [
      { href: '/ielts-writing-checker', label: 'Check your essay with the AI Writing Checker' },
      task === 1
        ? { href: '/writingquestion', label: 'More Task 1 and Task 2 prompts' }
        : { href: '/ielts-writing-task-2-topics', label: 'IELTS Writing Task 2 topics' },
      { href: '/ielts-band-descriptors', label: 'Writing band descriptors explained' },
      { href: '/ielts-writing-checker-accuracy', label: 'How accurate is the AI score?' },
      { href: '/writingquestion', label: 'All Writing practice prompts' },
    ].filter((link, i, all) => all.findIndex((other) => other.href === link.href) === i);
  }
  if (skill === 'speaking') {
    return [
      { href: '/speaking-examiner', label: 'Practise with the live AI Speaking Examiner' },
      { href: '/ielts-band-descriptors', label: 'Speaking band descriptors explained' },
      { href: '/speakingquestion', label: 'All Speaking practice' },
      { href: '/ielts-test-format', label: 'IELTS Speaking test format' },
    ];
  }
  return [];
}
