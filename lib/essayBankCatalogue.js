// lib/essayBankCatalogue.js
// The core catalogue of /ielts-essay-bank: every published writing question
// that carries a Band 8–9 model answer on its /writingquestion page, shaped
// into the same filterable card fields (task bucket, topic families, question
// type, band group) that the authored comparison essays use.
//
// Pure: the page fetches rows via lib/supabase.js listWritingModelAnswers()
// and maps them here, so the classification rules are unit-testable offline.

import {
  cleanWritingTitle,
  questionTypeFor,
  taskBucket,
  topicsFor,
} from './essayTaxonomy';

function plainText(html) {
  return String(html || '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&(?:#39|apos|rsquo|lsquo);/g, "'")
    .replace(/&(?:quot|ldquo|rdquo);/g, '"')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Trim to a word boundary so a card preview never ends mid-word.
function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.\s]+$/, '')}…`;
}

// The prompt's own question sentence is the most informative line to show on
// a card; boilerplate ("Write about the following topic", "Give reasons…",
// "Write at least…") is dropped first.
function promptSummary(promptHtml) {
  const text = plainText(promptHtml)
    .replace(/write about the following topic:?/gi, ' ')
    .replace(/give reasons for your answer[^.]*\./gi, ' ')
    .replace(/include any relevant examples[^.]*\./gi, ' ')
    .replace(/write at least \d+ words\.?/gi, ' ')
    .replace(/you do not need to write any addresses\.?/gi, ' ')
    .replace(/summarise the information by selecting and reporting the main features, and make comparisons where relevant\.?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clip(text, 220);
}

/**
 * One Supabase writing row -> a catalogue card, or null when the page has no
 * model answer (the catalogue lists sample answers, not bare prompts).
 */
export function toCatalogueItem(row) {
  const details = Array.isArray(row?.writing_details) ? row.writing_details[0] : row?.writing_details;
  if (!row?.slug || !details?.model_answer_html) return null;
  const task = details.task === 1 ? 1 : 2;
  const moduleName = row.module === 'general' ? 'general' : 'academic';
  const tags = Array.isArray(row.topic_tags) ? row.topic_tags : [];
  const promptHtml = details.prompt_html || '';
  const modelText = plainText(details.model_answer_html);
  return {
    slug: row.slug,
    title: cleanWritingTitle(row.title) || row.slug,
    bucket: taskBucket(task, moduleName),
    topics: topicsFor({ tags, title: row.title }),
    type: questionTypeFor({ task, module: moduleName, title: row.title, promptHtml, tags }),
    bandGroup: '8',
    summary: promptSummary(promptHtml),
    wordCount: modelText ? modelText.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length : 0,
  };
}

/** Rows -> sorted catalogue (Task 2 first, then Task 1, then letters; A–Z within). */
export function buildCatalogue(rows = []) {
  const order = { 'task2-academic': 0, 'task2-general': 1, 'task1-academic': 2, 'task1-general': 3 };
  return rows
    .map(toCatalogueItem)
    .filter(Boolean)
    .sort((a, b) => order[a.bucket] - order[b.bucket] || a.title.localeCompare(b.title));
}
