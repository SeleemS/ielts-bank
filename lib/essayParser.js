// lib/essayParser.js
// Parses and validates ONE content/essays/*.md file. Split out of lib/essays.js
// (which loads the whole folder at import time and throws on the first invalid
// file, so a broken essay fails the build loudly) so that lib/essayFiles.test.js
// can validate every file independently and report each problem on its own.
// The file format is documented at the top of lib/essays.js.

import { parseFrontmatter } from './frontmatter.mjs';
import {
  countWords,
  highlightsIn,
  listItems,
  renderBlocks,
  renderInline,
  splitSections,
  stripInline,
} from './essayMarkup';
import {
  QUESTION_TYPE_IDS,
  TOPIC_IDS,
  bandGroup,
  criteriaFor,
  formatBand,
  overallBand,
  questionTypeTask,
  taskBucket,
} from './essayTaxonomy';

const CRITERION_SECTIONS = {
  tr: ['Task Response', 'Task Achievement'],
  cc: ['Coherence and Cohesion'],
  lr: ['Lexical Resource'],
  gra: ['Grammatical Range and Accuracy'],
};

// Visible words claiming official status are a trademark + trust problem; the
// bank is original practice material and must never read otherwise.
const FORBIDDEN_CLAIMS = [/past papers?/i, /leaked/i, /real (?:exam|test) (?:questions?|papers?)/i, /official (?:ielts )?(?:essay|answer|sample)/i];

const VOCAB_LINE = /^\*\*(.+?)\*\*\s*[—–-]\s*(.+)$/;

function fail(file, message) {
  throw new Error(`content/essays/${file}: ${message}`);
}

function requireString(file, data, key) {
  if (typeof data[key] !== 'string' || !data[key].trim()) {
    fail(file, `frontmatter "${key}" is required.`);
  }
}

function requireBand(file, data, key) {
  const value = data[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 9) {
    fail(file, `frontmatter "${key}" must be a whole band from 1 to 9 (criterion bands are never half bands).`);
  }
}

function normalise(text) {
  return stripInline(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Parse and validate one essay file's raw text. Exported for the tests so the
 * validation rules can be exercised on fixtures without touching the disk.
 */
export function parseEssay(file, raw) {
  const slug = file.replace(/\.md$/, '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail(file, 'filename must be a lowercase hyphenated slug.');
  const { data, content } = parseFrontmatter(raw, { source: `content/essays/${file}` });

  ['title', 'module', 'topic', 'type', 'practice', 'date', 'excerpt'].forEach((key) =>
    requireString(file, data, key)
  );
  if (data.task !== 1 && data.task !== 2) fail(file, 'frontmatter "task" must be 1 or 2.');
  if (!['academic', 'general'].includes(data.module)) fail(file, 'frontmatter "module" must be academic or general.');
  ['tr', 'cc', 'lr', 'gra'].forEach((key) => requireBand(file, data, key));

  if (!TOPIC_IDS.includes(data.topic)) fail(file, `unknown topic "${data.topic}".`);
  const extraTopics = data.topics === undefined ? [] : data.topics;
  if (!Array.isArray(extraTopics) || extraTopics.some((t) => !TOPIC_IDS.includes(t))) {
    fail(file, 'frontmatter "topics" must be a JSON array of known topic ids.');
  }

  const bucket = taskBucket(data.task, data.module);
  if (!QUESTION_TYPE_IDS.includes(data.type)) fail(file, `unknown question type "${data.type}".`);
  const typeTask = questionTypeTask(data.type);
  const expectedTypeTask = data.task === 2 ? 'task2' : bucket;
  if (typeTask !== expectedTypeTask) fail(file, `question type "${data.type}" does not belong to ${bucket}.`);

  const computed = overallBand(data);
  if (typeof data.band !== 'number' || data.band !== computed) {
    fail(file, `"band" is ${data.band} but the four criteria average to ${formatBand(computed)}.`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.practice)) fail(file, '"practice" must be a /writingquestion slug.');
  if (Number.isNaN(new Date(data.date).getTime())) fail(file, '"date" is not a parseable date.');
  if (data.excerpt.length < 80 || data.excerpt.length > 170) {
    fail(file, `"excerpt" must be 80–170 characters (is ${data.excerpt.length}).`);
  }

  const sections = splitSections(content);
  const need = (name) => {
    if (!sections[name]) fail(file, `body section "## ${name}" is missing or empty.`);
    return sections[name];
  };
  const promptText = need('Prompt');
  const essayText = need('Essay');

  const criteria = criteriaFor(data.task).map((criterion) => {
    const heading = CRITERION_SECTIONS[criterion.key].find((name) => sections[name]);
    if (!heading) fail(file, `body section "## ${criterion.label}" is missing or empty.`);
    return { ...criterion, band: data[criterion.key], commentHtml: renderBlocks(sections[heading]) };
  });

  const minimum = data.task === 1 ? 150 : 250;
  const wordCount = countWords(essayText);
  if (wordCount < minimum) fail(file, `essay is ${wordCount} words; Task ${data.task} needs at least ${minimum}.`);

  const highlights = highlightsIn(essayText).map(normalise);
  const vocabLines = listItems(need('Vocabulary'));
  if (vocabLines.length < 4) fail(file, 'the Vocabulary section needs at least 4 items.');
  const vocabulary = vocabLines.map((line, i) => {
    const match = VOCAB_LINE.exec(line);
    if (!match) fail(file, `Vocabulary item ${i + 1} must look like "- **phrase** — note".`);
    const term = match[1].trim();
    if (!highlights.includes(normalise(term))) {
      fail(file, `Vocabulary term "${term}" is not ==highlighted== in the essay.`);
    }
    return { term, noteHtml: renderInline(match[2].trim()) };
  });

  const nextBand = listItems(need('Next band'));
  if (nextBand.length < 2 || nextBand.length > 3) fail(file, 'the Next band section needs 2–3 bullet points.');

  const visibleText = [data.title, data.excerpt, content].join('\n');
  FORBIDDEN_CLAIMS.forEach((pattern) => {
    if (pattern.test(visibleText)) fail(file, `contains a forbidden claim matching ${pattern}.`);
  });

  const band = data.band;
  const topics = [data.topic, ...extraTopics.filter((t) => t !== data.topic)];
  return {
    slug,
    title: data.title,
    seoTitle: `IELTS Essay Bank: ${data.title} Band ${formatBand(band)} Sample Answer`,
    excerpt: data.excerpt,
    date: data.date,
    task: data.task,
    module: data.module,
    bucket,
    topic: data.topic,
    topics,
    type: data.type,
    band,
    bandGroup: bandGroup(band),
    criteria,
    practice: data.practice,
    promptHtml: renderBlocks(promptText),
    promptText: stripInline(promptText).replace(/^- /gm, '• ').replace(/\s*\n\s*/g, '\n').trim(),
    essayHtml: renderBlocks(essayText),
    // First paragraph, plain text — the hub card's preview line.
    opening: stripInline(essayText.split(/\n\s*\n/)[0]).replace(/\s+/g, ' ').trim(),
    wordCount,
    vocabulary,
    nextBandHtml: nextBand.map(renderInline),
  };
}
