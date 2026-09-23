// lib/essayTaxonomy.js
// Browser-safe vocabulary for the IELTS Essay Bank (/ielts-essay-bank): the
// task, topic-family, question-type and band-group ids that BOTH halves of the
// bank are filtered by —
//   * the authored band 6/7/8 comparison essays in content/essays/*.md
//     (loaded by lib/essays.js), and
//   * the Band 8–9 model answers that already live on every
//     /writingquestion/<slug> page (catalogued by lib/essayBankCatalogue.js).
//
// No fs, no Supabase: the hub's filter UI imports these labels on the client.

import { TASK2_FRAMES, classifyTask2Frame } from './task2Frames';

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
// `task` + `module` together decide the filter bucket. Task 2 is the same essay
// in both modules, but GT prompts are phrased differently enough that learners
// ask for them separately.
export const ESSAY_TASKS = [
  { id: 'task2-academic', label: 'Task 2 Academic', short: 'Task 2' },
  { id: 'task2-general', label: 'Task 2 General Training', short: 'GT Task 2' },
  { id: 'task1-academic', label: 'Task 1 Academic', short: 'Task 1' },
  { id: 'task1-general', label: 'GT Task 1 letters', short: 'GT letter' },
];
export const ESSAY_TASK_IDS = ESSAY_TASKS.map((t) => t.id);

export function taskBucket(task, module) {
  const t = Number(task) === 1 ? 'task1' : 'task2';
  const m = module === 'general' ? 'general' : 'academic';
  return `${t}-${m}`;
}

export function taskLabel(bucket) {
  return ESSAY_TASKS.find((t) => t.id === bucket)?.label || 'IELTS Writing';
}

// ---------------------------------------------------------------------------
// Topic families
// ---------------------------------------------------------------------------
export const TOPIC_FAMILIES = [
  { id: 'education', label: 'Education' },
  { id: 'technology', label: 'Technology' },
  { id: 'environment', label: 'Environment' },
  { id: 'health', label: 'Health' },
  { id: 'work', label: 'Work & careers' },
  { id: 'society', label: 'Society' },
  { id: 'government', label: 'Government' },
  { id: 'crime', label: 'Crime & law' },
  { id: 'media', label: 'Media & advertising' },
  { id: 'globalisation', label: 'Globalisation' },
  { id: 'family', label: 'Family' },
  { id: 'culture', label: 'Culture & arts' },
  { id: 'cities', label: 'Cities & transport' },
  { id: 'tourism', label: 'Tourism' },
  { id: 'economy', label: 'Money & economy' },
  { id: 'science', label: 'Science' },
];
export const TOPIC_IDS = TOPIC_FAMILIES.map((t) => t.id);

export function topicLabel(id) {
  return TOPIC_FAMILIES.find((t) => t.id === id)?.label || id;
}

// Database topic_tags -> family. Tags that describe a LETTER'S PURPOSE
// (complaint, request…) are deliberately absent: they are question types, not
// topics, and are handled by classifyLetterType below.
const TAG_TO_TOPIC = {
  education: 'education',
  technology: 'technology',
  environment: 'environment',
  health: 'health',
  sport: 'health',
  work: 'work',
  society: 'society',
  community: 'society',
  lifestyle: 'society',
  government: 'government',
  crime: 'crime',
  media: 'media',
  globalisation: 'globalisation',
  family: 'family',
  culture: 'culture',
  urbanisation: 'cities',
  transport: 'cities',
  housing: 'cities',
  tourism: 'tourism',
  economics: 'economy',
  economy: 'economy',
  science: 'science',
};

// Keyword fallback for the older prompts that were imported without tags.
// Ordered: the first match becomes the primary family.
const TITLE_KEYWORDS = [
  [/crime|prison|police|surveillance|death penalty/i, 'crime'],
  [/advertis|news|media|celebrit/i, 'media'],
  [/school|universit|student|educat|homework|subject|learning|language|study/i, 'education'],
  [/animal|species|zoo|experiment|genetic|space|science/i, 'science'],
  [/recycl|plastic|pollut|climate|energy|oil|gas|environment|agricult|water|waste|fuel/i, 'environment'],
  [/computer|internet|online|digital|phone|technolog|screen|robot|automat/i, 'technology'],
  [/health|food|diet|sport|exercise|sedentary|medicine/i, 'health'],
  [/job|work|career|employ|salar/i, 'work'],
  [/wealth|money|price|spending|debt|cash|shop/i, 'economy'],
  [/art|museum|tradition|culture|reading|restoration|building/i, 'culture'],
  [/touris|travel/i, 'tourism'],
  [/city|cities|traffic|town|transport|urban/i, 'cities'],
  [/parent|family|children|elderly|older/i, 'family'],
  [/government|tax|law|responsibilit/i, 'government'],
  [/global|international|multinational/i, 'globalisation'],
  [/population|society|societal|humanity|leisure/i, 'society'],
];

/**
 * Topic families for a writing prompt, primary family first. Uses the
 * database tags when present, falling back to title keywords, and finally to
 * "society" so no prompt is ever dropped from the hub.
 */
export function topicsFor({ tags = [], title = '' } = {}) {
  const out = [];
  (Array.isArray(tags) ? tags : []).forEach((tag) => {
    const family = TAG_TO_TOPIC[String(tag).toLowerCase()];
    if (family && !out.includes(family)) out.push(family);
  });
  if (!out.length) {
    TITLE_KEYWORDS.forEach(([pattern, family]) => {
      if (pattern.test(title) && !out.includes(family)) out.push(family);
    });
  }
  return out.length ? out.slice(0, 3) : ['society'];
}

// ---------------------------------------------------------------------------
// Question types
// ---------------------------------------------------------------------------
// One id space across all three tasks so a single filter can carry them; each
// type records which task it belongs to so the UI can group the options.
const TASK2_SHORT_LABELS = {
  opinion: 'Opinion (agree/disagree)',
  discussion: 'Discussion (both views)',
  'advantages-disadvantages': 'Advantages & disadvantages',
  'problem-solution': 'Problem & solution',
  'positive-negative': 'Positive or negative',
  'two-part': 'Two-part question',
};

export const QUESTION_TYPES = [
  ...TASK2_FRAMES.map((frame) => ({
    id: frame.id,
    label: TASK2_SHORT_LABELS[frame.id] || frame.name,
    task: 'task2',
  })),
  { id: 'line-graph', label: 'Line graph', task: 'task1-academic' },
  { id: 'bar-chart', label: 'Bar chart', task: 'task1-academic' },
  { id: 'pie-chart', label: 'Pie chart', task: 'task1-academic' },
  { id: 'table', label: 'Table', task: 'task1-academic' },
  { id: 'process', label: 'Process / diagram', task: 'task1-academic' },
  { id: 'map', label: 'Map', task: 'task1-academic' },
  { id: 'letter-complaint', label: 'Complaint letter', task: 'task1-general' },
  { id: 'letter-request', label: 'Request letter', task: 'task1-general' },
  { id: 'letter-apology', label: 'Apology letter', task: 'task1-general' },
  { id: 'letter-invitation', label: 'Invitation letter', task: 'task1-general' },
  { id: 'letter-application', label: 'Application letter', task: 'task1-general' },
  { id: 'letter-information', label: 'Information / explanation letter', task: 'task1-general' },
];
export const QUESTION_TYPE_IDS = QUESTION_TYPES.map((t) => t.id);

export function questionTypeLabel(id) {
  return QUESTION_TYPES.find((t) => t.id === id)?.label || id;
}

/** Which task family ('task2' | 'task1-academic' | 'task1-general') a type belongs to. */
export function questionTypeTask(id) {
  return QUESTION_TYPES.find((t) => t.id === id)?.task || null;
}

function plain(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Visual type of an Academic Task 1 prompt, from its title and instruction. */
export function classifyTask1Visual(title = '', promptHtml = '') {
  // The instruction sentence ("The line graph below shows…") is the most
  // reliable signal; the title is a fallback for untitled imports.
  const text = `${plain(promptHtml).slice(0, 300)} ${title}`.toLowerCase();
  if (/\bmaps?\b/.test(text)) return 'map';
  if (/process|diagram|life cycle|how .* (?:is|are) (?:made|produced|treated|recycled)/.test(text)) return 'process';
  if (/pie chart/.test(text)) return 'pie-chart';
  if (/\btable\b/.test(text)) return 'table';
  if (/bar chart|bar graph/.test(text)) return 'bar-chart';
  if (/line graph|line chart/.test(text)) return 'line-graph';
  return 'bar-chart';
}

/** Purpose of a General Training Task 1 letter, from its tags and title. */
export function classifyLetterType(tags = [], title = '') {
  const tagSet = new Set((tags || []).map((t) => String(t).toLowerCase()));
  const t = String(title).toLowerCase();
  if (tagSet.has('complaint') || /complain|faulty|noise|opposing/.test(t)) return 'letter-complaint';
  if (tagSet.has('apology') || /apolog/.test(t)) return 'letter-apology';
  if (tagSet.has('invitation') || /invit/.test(t)) return 'letter-invitation';
  if (tagSet.has('application') || /apply|application/.test(t)) return 'letter-application';
  if (tagSet.has('request') || /request|asking|repairs|time off/.test(t)) return 'letter-request';
  return 'letter-information';
}

/** Question type for any writing prompt. */
export function questionTypeFor({ task, module, title = '', promptHtml = '', tags = [] }) {
  const bucket = taskBucket(task, module);
  if (bucket === 'task1-academic') return classifyTask1Visual(title, promptHtml);
  if (bucket === 'task1-general') return classifyLetterType(tags, title);
  return classifyTask2Frame(promptHtml || title);
}

// ---------------------------------------------------------------------------
// Bands
// ---------------------------------------------------------------------------
export const BAND_GROUPS = [
  { id: '6', label: 'Band 6', min: 6, max: 6.5 },
  { id: '7', label: 'Band 7', min: 7, max: 7.5 },
  { id: '8', label: 'Band 8+', min: 8, max: 9 },
];
export const BAND_GROUP_IDS = BAND_GROUPS.map((b) => b.id);

export function bandGroup(band) {
  const n = Number(band);
  if (n >= 8) return '8';
  if (n >= 7) return '7';
  return '6';
}

/**
 * Overall task band from the four criterion bands: the mean, rounded to the
 * nearest half band with quarter-bands rounding UP (6.25 -> 6.5, 6.75 -> 7) —
 * the same convention the AI scorer states in lib/writingScoreSchema.js.
 */
export function overallBand({ tr, cc, lr, gra }) {
  const mean = (Number(tr) + Number(cc) + Number(lr) + Number(gra)) / 4;
  return Math.round(mean * 2) / 2;
}

export function formatBand(band) {
  const n = Number(band);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// Criterion labels. Task 1 is marked on Task ACHIEVEMENT, Task 2 on Task
// RESPONSE; the other three criteria are named identically.
export function criteriaFor(task) {
  const isTask1 = Number(task) === 1;
  return [
    { key: 'tr', label: isTask1 ? 'Task Achievement' : 'Task Response', abbr: isTask1 ? 'TA' : 'TR' },
    { key: 'cc', label: 'Coherence and Cohesion', abbr: 'CC' },
    { key: 'lr', label: 'Lexical Resource', abbr: 'LR' },
    { key: 'gra', label: 'Grammatical Range and Accuracy', abbr: 'GRA' },
  ];
}

// ---------------------------------------------------------------------------
// Writing-question page titles
// ---------------------------------------------------------------------------
// Imported titles carry a redundant prefix ("IELTS Writing Task 2: …",
// "IELTS General Task 1: …"); strip it so a retitled page doesn't say IELTS
// three times.
export function cleanWritingTitle(title = '') {
  return String(title)
    .replace(/^IELTS\s+(?:Writing|General|Academic)(?:\s+Training)?\s+Task\s+[12]\s*:\s*/i, '')
    .trim();
}

/**
 * <title> for a /writingquestion page. Pages that carry a model answer are
 * retitled around what searchers actually type ("sample essay", "band"); the
 * rare page without one keeps the practice-focused title.
 */
export function writingPageTitle({ title, task, module, hasModelAnswer }) {
  const topic = cleanWritingTitle(title) || 'IELTS Writing Practice';
  if (!hasModelAnswer) return `${topic} | IELTS Writing Practice | IELTS-Bank`;
  const bucket = taskBucket(task, module);
  if (bucket === 'task1-general') {
    return `${topic} – Sample Letter (Band 8–9) | IELTS General Training Task 1`;
  }
  if (bucket === 'task1-academic') {
    return `${topic} – Sample Answer (Band 8–9) | IELTS Writing Task 1`;
  }
  return `${topic} – Sample Essay (Band 8–9) | IELTS Writing Task 2`;
}
