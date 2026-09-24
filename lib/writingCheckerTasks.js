// lib/writingCheckerTasks.js
// Content for the task-specific AI Writing Checker landing pages
// (pages/ielts-writing-checker/[task].jsx):
//   /ielts-writing-checker/task-2                   Task 2 essays (Academic + GT)
//   /ielts-writing-checker/task-1                   Academic Task 1 reports
//   /ielts-writing-checker/general-training-letter  General Training Task 1 letters
//
// Each page reuses the one checker (src/components/writingChecker/
// WritingCheckerTool.jsx) locked to its task, and carries unique, server-
// rendered guidance for that task: how the four criteria apply, the common
// mistakes, the word-count rules, 2–3 essay-bank samples and a FAQ.
//
// Read ONLY inside getStaticProps, so this long copy never reaches a client
// bundle (the page receives just its own entry as props). Free-allowance
// wording comes from freeScoreCopy() so NEXT_PUBLIC_FREE_SCORE_PERIOD flips it
// with every other surface.

import { SITE_URL } from './site';
import { freeScoreCopy } from './freeScorePeriod';
import { buildCheckerAppJsonLd } from './writingCheckerSeo';
import { questionPath } from './questionUrls';
import { breadcrumbJsonLd } from './breadcrumbs';

export const WRITING_CHECKER_TASK_SLUGS = ['task-2', 'task-1', 'general-training-letter'];

export function checkerTaskPath(slug) {
  return `/ielts-writing-checker/${slug}`;
}

const NOT_OFFICIAL =
  'No. It is an AI estimate made against the public IELTS Writing band descriptors, meant as a study aid. Only a certified examiner in a real IELTS test can award an official band score.';

function freeAnswer() {
  const copy = freeScoreCopy();
  return `${copy.heroFreeLine} Create an account (no card) and the checker shows your estimated overall band, a band for each of the four criteria, feedback and a corrected example from your own writing. Continued scoring with full reports is part of Pro.`;
}

function buildPages() {
  const copy = freeScoreCopy();
  return {
    'task-2': {
      slug: 'task-2',
      lockedTaskType: 'task2',
      title: 'IELTS Writing Task 2 Checker – Free AI Band Score & Feedback',
      description: `Check your IELTS Writing Task 2 essay with AI: practice band estimates and revision feedback. ${copy.checkerFreeLine}`,
      h1: 'IELTS Writing Task 2 Checker',
      taskName: 'Task 2 essays',
      eyebrow: 'Task 2 essays · Academic and General Training',
      intro:
        'Paste your Task 2 essay and the question. The checker marks it against the four IELTS Writing criteria as they apply to a 250-word argument essay, gives a band for each, and points to the sentences that are holding your score back.',
      ogTitle: 'IELTS Writing Task 2 Checker',
      appName: 'IELTS-Bank AI Writing Task 2 Checker',
      featureList: [
        'Estimated IELTS Writing Task 2 band score',
        'Feedback on Task Response, Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy',
        'Corrected sentences from your own essay',
      ],
      promptPlaceholder: 'Paste the Task 2 question, e.g. “Some people believe… To what extent do you agree or disagree?”',
      essayLabel: 'Your Task 2 essay',
      criteriaIntro:
        'Task 2 is marked on four equally weighted criteria. The first one is Task Response, which is specific to Task 2: it asks whether you answered the question you were given, not a similar one.',
      criteria: [
        {
          name: 'Task Response',
          body: 'Does the essay answer every part of the question, with a clear position that holds from the introduction to the conclusion? The checker looks for main ideas that are extended and supported with explanation or examples, not just listed, and flags paragraphs that drift away from the question.',
        },
        {
          name: 'Coherence and Cohesion',
          body: 'Is there one clear central idea per paragraph, and does the argument progress logically? It checks how you link ideas (reference words, substitution, linking phrases) and flags mechanical linkers such as “Firstly… Moreover… Furthermore…” at the start of every sentence.',
        },
        {
          name: 'Lexical Resource',
          body: 'How precise and varied is your vocabulary for this topic? The checker notes accurate collocations and less common words used naturally, and marks word-choice, word-form and spelling errors that make the reader work harder.',
        },
        {
          name: 'Grammatical Range and Accuracy',
          body: 'Do you use a mix of simple and complex sentences (relative clauses, conditionals, concessions), and how many of your sentences are free of errors? Punctuation problems such as comma splices are counted here too.',
        },
      ],
      mistakes: [
        {
          title: 'Answering only half of the question',
          body: 'Two-part questions and “discuss both views and give your opinion” prompts need every part covered. Missing one part limits Task Response however good the language is.',
        },
        {
          title: 'A position that shifts or appears only at the end',
          body: 'In an opinion essay the examiner should know where you stand from the introduction. An essay that argues both sides and decides in the conclusion reads as unclear.',
        },
        {
          title: 'Listing ideas instead of developing them',
          body: 'Three reasons with one sentence each score lower than two reasons explained with a cause, a consequence and an example.',
        },
        {
          title: 'Memorised templates and off-topic paragraphs',
          body: 'Examiners are trained to spot memorised language. A prepared paragraph that does not fit the exact question counts against you rather than for you.',
        },
        {
          title: 'Copying the wording of the question',
          body: 'Repeating the prompt word for word in your introduction shows none of your own vocabulary. Paraphrase it in one sentence and add your position.',
        },
        {
          title: 'New ideas in the conclusion',
          body: 'The conclusion should sum up your argument. A fresh point in the last paragraph is left undeveloped and weakens coherence.',
        },
      ],
      wordRules: {
        minimum: 250,
        minutes: 40,
        points: [
          'The minimum is 250 words. Essays under 250 words lose marks under Task Response, so the checker asks for at least 250 before it scores.',
          'There is no maximum, but longer is not better: 260–300 well-developed words leave time to plan and proofread.',
          'Spend about 40 minutes on Task 2. It carries twice the weight of Task 1 in your Writing band.',
          'Words copied from the question show none of your own language, so write the introduction in your own words.',
        ],
      },
      sampleSlugs: [
        'free-university-education-band-7',
        'working-from-home-vs-office-band-8',
        'children-household-chores-band-6',
      ],
      samplesIntro:
        'Original sample essays from the IELTS-Bank essay bank, each with examiner-style comments on all four criteria. Write your own answer first, then compare.',
      faq: [
        {
          q: 'How is IELTS Writing Task 2 scored?',
          a: 'On four equally weighted criteria: Task Response, Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy. Task 2 then counts for twice as much as Task 1 when your overall Writing band is worked out.',
        },
        {
          q: 'What happens if my Task 2 essay is under 250 words?',
          a: 'An under-length essay is penalised under Task Response. The checker will not score an answer below 250 words and tells you how many words you have so far.',
        },
        {
          q: 'Can it check General Training Task 2 essays?',
          a: 'Yes. Task 2 is the same kind of essay in the Academic and General Training tests and is marked on the same four criteria, so the same checker applies to both.',
        },
        { q: 'Is the band score official?', a: NOT_OFFICIAL },
        { q: 'Is the Task 2 checker free?', a: freeAnswer() },
      ],
    },

    'task-1': {
      slug: 'task-1',
      lockedTaskType: 'task1-academic',
      title: 'IELTS Writing Task 1 Checker (Academic) – Free AI Band Score',
      description: `Check your IELTS Academic Writing Task 1 report with AI: practice band estimates and overview feedback. ${copy.checkerFreeLine}`,
      h1: 'IELTS Writing Task 1 Checker for Academic Reports',
      taskName: 'Academic Task 1 reports',
      eyebrow: 'Academic Task 1 · graphs, charts, tables, maps and processes',
      intro:
        'Paste your Academic Task 1 report and, if you have it, the task wording. The checker marks it against the four criteria as they apply to a 150-word data report, with extra attention to your overview and the figures you chose to include.',
      ogTitle: 'IELTS Writing Task 1 Checker',
      appName: 'IELTS-Bank AI Writing Task 1 Checker',
      featureList: [
        'Estimated IELTS Academic Writing Task 1 band score',
        'Feedback on Task Achievement, Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy',
        'Overview and data-selection feedback with corrected sentences',
      ],
      promptPlaceholder: 'Paste the task wording, e.g. “The line graph below shows… Summarise the information by selecting and reporting the main features…”',
      essayLabel: 'Your Task 1 report',
      criteriaIntro:
        'Task 1 uses Task Achievement in place of Task Response. You are not asked for an opinion: you are asked to report what the visual shows, accurately and selectively.',
      criteria: [
        {
          name: 'Task Achievement',
          body: 'Is there a clear overview of the main trends, differences or stages? Are the key features selected and backed with accurate figures, rather than every number being reported? The checker flags a missing overview, misread data, and opinions or causes that the visual does not show.',
        },
        {
          name: 'Coherence and Cohesion',
          body: 'Is the information grouped logically, for example by category, by trend or by time period, instead of walking through the chart bar by bar? It checks paragraphing and the language that links figures (“while”, “in contrast”, “the former”).',
        },
        {
          name: 'Lexical Resource',
          body: 'How accurately do you describe change and comparison: “rose steadily”, “peaked at”, “accounted for just under a third”? The checker notes repetition of the same verb and errors in word form, such as “increase” used where “increased” is needed.',
        },
        {
          name: 'Grammatical Range and Accuracy',
          body: 'Are comparatives, superlatives and tenses correct for the time frame (past for 1990–2010, future forms for projections, the present passive for a process)? It counts error-free sentences and range, just as in Task 2.',
        },
      ],
      mistakes: [
        {
          title: 'No overview',
          body: 'Without a clear overview of the main features, Task Achievement is capped at a low band however accurate the details are. Put it in the introduction or as a short second paragraph.',
        },
        {
          title: 'Describing every number',
          body: 'Task 1 rewards selection. Pick the highest, the lowest, the biggest changes and the exceptions, and group the rest.',
        },
        {
          title: 'Giving reasons or opinions',
          body: 'Explaining why a figure rose (“because of the economy”) is information the chart does not give. Report and compare; do not speculate.',
        },
        {
          title: 'Misreading units and time frames',
          body: 'Percentages are not numbers of people, and a projection to 2040 needs future forms. Check the axis labels before you write.',
        },
        {
          title: 'Copying the task wording as the introduction',
          body: 'Paraphrase what the visual shows in one sentence (“The graph compares… between 2000 and 2020”) rather than repeating the prompt.',
        },
        {
          title: 'Processes and maps told as a list',
          body: 'A process needs sequencing language and usually the passive; a map comparison needs the main changes grouped, not every building named.',
        },
      ],
      wordRules: {
        minimum: 150,
        minutes: 20,
        points: [
          'The minimum is 150 words. Reports under 150 words are penalised under Task Achievement, so the checker asks for at least 150 before it scores.',
          'Aim for 160–190 words: enough for an overview and selected detail without running into Task 2 time.',
          'Spend about 20 minutes. Task 1 carries half the weight of Task 2 in your Writing band.',
          'No conclusion with your opinion is needed; the overview does that job.',
        ],
      },
      sampleSlugs: [
        'household-spending-pie-charts-band-7',
        'mobile-phone-subscriptions-line-graph-band-8',
        'glass-bottle-recycling-process-band-8',
      ],
      samplesIntro:
        'Original Academic Task 1 samples from the IELTS-Bank essay bank, with examiner-style comments on the overview, data selection and language.',
      faq: [
        {
          q: 'What is the difference between Task Achievement and Task Response?',
          a: 'Task Achievement is the Task 1 criterion: it asks whether you gave an accurate overview and selected the key features of the visual. Task Response is the Task 2 criterion: it asks whether you answered every part of the essay question with a clear, developed position.',
        },
        {
          q: 'Does the checker work for maps and process diagrams?',
          a: 'Yes. Paste your report and the task wording. Because the checker cannot see the image itself, it judges how clearly your report presents the main changes or stages you describe; include the task wording so the feedback is as accurate as possible.',
        },
        {
          q: 'How long should an Academic Task 1 answer be?',
          a: 'At least 150 words, written in about 20 minutes. Most strong answers are between 160 and 190 words.',
        },
        {
          q: 'Can I check a General Training Task 1 letter here?',
          a: 'Use the General Training letter checker instead: letters are judged on purpose, bullet-point coverage and tone rather than on an overview of data.',
        },
        { q: 'Is the band score official?', a: NOT_OFFICIAL },
        { q: 'Is the Task 1 checker free?', a: freeAnswer() },
      ],
    },

    'general-training-letter': {
      slug: 'general-training-letter',
      lockedTaskType: 'task1-general',
      title: 'IELTS General Training Letter Checker – Free AI Band Score',
      description: `Check your IELTS General Training Task 1 letter with AI: practice band estimates and letter feedback. ${copy.checkerFreeLine}`,
      h1: 'IELTS General Training Letter Checker',
      taskName: 'General Training letters',
      eyebrow: 'General Training Task 1 · formal, semi-formal and informal letters',
      intro:
        'Paste your General Training letter and the task with its three bullet points. The checker marks it on the four criteria as they apply to a letter: whether the purpose is clear, every bullet is covered and the tone suits the reader.',
      ogTitle: 'IELTS GT Letter Checker',
      appName: 'IELTS-Bank AI General Training Letter Checker',
      featureList: [
        'Estimated IELTS General Training Task 1 band score',
        'Feedback on purpose, bullet-point coverage, tone, organisation, vocabulary and grammar',
        'Corrected sentences from your own letter',
      ],
      promptPlaceholder: 'Paste the letter task, including the three bullet points (“In your letter: …”)',
      essayLabel: 'Your letter',
      criteriaIntro:
        'General Training Task 1 also uses Task Achievement, but for a letter it means something different from a data report: the purpose, the three bullet points and the tone.',
      criteria: [
        {
          name: 'Task Achievement',
          body: 'Is the purpose of the letter clear from the first lines? Is each of the three bullet points covered and extended with a detail, and is the tone consistent and right for the reader: formal for a manager, semi-formal for a landlord or neighbour, informal for a friend?',
        },
        {
          name: 'Coherence and Cohesion',
          body: 'Does the letter move logically, usually one paragraph per bullet point, with a suitable opening and closing? The checker looks at how requests, explanations and apologies are linked.',
        },
        {
          name: 'Lexical Resource',
          body: 'Is the vocabulary right for the register: “I would be grateful if…” to a company, “Could you…?” to a neighbour, “I’m so sorry I missed…” to a friend? It flags slang in formal letters and stiff phrasing in informal ones.',
        },
        {
          name: 'Grammatical Range and Accuracy',
          body: 'Are polite modals, conditionals and indirect questions used accurately, and how many sentences are error-free? The same standard applies as in Task 2.',
        },
      ],
      mistakes: [
        {
          title: 'Skipping or barely touching a bullet point',
          body: 'All three bullets must be covered. One line on a bullet is “mentioned”, not “developed”, and Task Achievement drops.',
        },
        {
          title: 'Hiding the purpose',
          body: 'State why you are writing in the first paragraph (“I am writing to complain about…”) instead of after several lines of greetings.',
        },
        {
          title: 'Mixing registers',
          body: 'A formal complaint that ends “Cheers” or an informal letter full of “I am writing to inform you” reads as inconsistent tone.',
        },
        {
          title: 'The wrong opening and closing pair',
          body: 'Use “Dear Sir or Madam… Yours faithfully” when you do not know the name, “Dear Mr Patel… Yours sincerely” when you do, and a first name with “Best wishes” for a friend.',
        },
        {
          title: 'Writing addresses',
          body: 'The task says you do not need to write any addresses. They add nothing to your score and use up time.',
        },
        {
          title: 'Inventing a long backstory',
          body: 'Details should serve the bullet points. A long story before the request makes the letter harder to follow.',
        },
      ],
      wordRules: {
        minimum: 150,
        minutes: 20,
        points: [
          'The minimum is 150 words. Letters under 150 words are penalised, so the checker asks for at least 150 before it scores.',
          'Aim for 160–200 words: roughly one short paragraph per bullet point plus an opening and closing line.',
          'Spend about 20 minutes, and keep the remaining 40 for Task 2, which carries twice the weight.',
          'Do not write addresses or a date; the opening line and sign-off are enough.',
        ],
      },
      sampleSlugs: [
        'hotel-complaint-letter-band-7',
        'apology-letter-to-a-friend-band-8',
        'landlord-repairs-letter-band-7',
      ],
      samplesIntro:
        'Original General Training letters from the IELTS-Bank essay bank: a formal complaint, an informal apology and a semi-formal request, each with examiner-style comments.',
      faq: [
        {
          q: 'How do I know whether a letter should be formal or informal?',
          a: 'Look at who you are writing to. A company, manager or official needs a formal letter; someone you know but not closely, such as a landlord or neighbour, needs a semi-formal one; a friend or relative gets an informal letter. The checker comments on whether your tone matches the reader.',
        },
        {
          q: 'Do I have to answer all three bullet points?',
          a: 'Yes. Each bullet point should be covered and extended with a relevant detail. A letter that ignores one is marked down under Task Achievement.',
        },
        {
          q: 'Is the letter marked on the same criteria as Task 2?',
          a: 'It is marked on four criteria as well, but the first is Task Achievement (purpose, bullet points and tone) instead of Task Response. The other three, Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy, work the same way.',
        },
        { q: 'Is the band score official?', a: NOT_OFFICIAL },
        { q: 'Is the letter checker free?', a: freeAnswer() },
      ],
    },
  };
}

export function getWritingCheckerTaskPage(slug) {
  const page = buildPages()[slug];
  if (!page) return null;
  const path = checkerTaskPath(slug);
  return {
    ...page,
    path,
    canonical: `${SITE_URL}${path}`,
    ogImage: `${SITE_URL}/api/og?title=${encodeURIComponent(page.ogTitle)}&type=writing&subtitle=${encodeURIComponent('Free AI Score')}`,
    imageAlt: `${page.h1} with a free AI band score`,
  };
}

// Visible trail; the BreadcrumbList JSON-LD is generated from the same list.
export function checkerTaskBreadcrumbs(page) {
  return [
    { label: 'Home', href: '/' },
    { label: 'IELTS Writing Checker', href: '/ielts-writing-checker' },
    { label: page.h1, href: page.canonical },
  ];
}

// The page's structured data: WebApplication (mirroring the main checker's),
// FAQPage generated from the SAME visible Q&As, and a BreadcrumbList matching
// the visible trail. Returned as separate blocks so each validates alone.
export function buildWritingCheckerTaskJsonLd(page) {
  return [
    buildCheckerAppJsonLd({
      path: page.path,
      name: page.appName,
      description: page.description,
      featureList: page.featureList,
    }),
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: page.faq.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    },
    { '@context': 'https://schema.org', ...breadcrumbJsonLd(checkerTaskBreadcrumbs(page)) },
  ];
}

// Essay-bank sample cards for a page, in the curated order. `essays` is the
// parsed list from lib/essays.js (passed in so this module stays fs-free).
export function pickCheckerSamples(page, essays = []) {
  const bySlug = new Map(essays.map((essay) => [essay.slug, essay]));
  return page.sampleSlugs
    .map((slug) => bySlug.get(slug))
    .filter(Boolean)
    .map((essay) => ({
      slug: essay.slug,
      href: `/ielts-essay-bank/${essay.slug}`,
      title: essay.title,
      band: essay.band,
      type: essay.type,
      bucket: essay.bucket,
      wordCount: essay.wordCount,
      opening: essay.opening.length > 220 ? `${essay.opening.slice(0, 217).replace(/\s+\S*$/, '')}…` : essay.opening,
      practiceHref: questionPath('writing', { slug: essay.practice }),
    }));
}
