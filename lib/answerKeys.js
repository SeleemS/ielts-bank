// lib/answerKeys.js
// Pure builders for the per-passage answer-key pages
// (/readingquestion/<slug>/answers and /listeningquestion/<slug>/answers).
//
// Learners search "<passage title> reading answers"; these pages answer that
// query with a genuinely useful key — answer, explanation, the evidence
// sentence and where it sits in the passage/transcript, question-type tips and
// a raw-score → band table — while funnelling back to the timed practice page.
//
// Everything here is deterministic and data-only (no network), so the page's
// getStaticProps, the sitemap and the practice pages share ONE definition of
// "this passage has a publishable answer key" (answerPageEligible) and the
// numbering matches the practice engine exactly (the continuous `number`
// assigned by toStructuredPassageShape in lib/supabase.js).

import { READING_QUESTION_TYPES } from './readingQuestionTypes';
import { LISTENING_PARTS } from './listeningQuestionTypes';
import { SITE_URL } from './site';
import { isAnswerKeyTitleDenied } from './answerKeyDenylist';
import {
  estimateBand,
  typeConfig,
  stripOptionKeyPrefix,
  cleanGroupPrompt,
  groupRangeLabel,
} from '../src/components/question/grade';

export const ANSWER_SKILLS = ['reading', 'listening'];

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------
export function practicePath(skill, id) {
  return `/${skill}question/${encodeURIComponent(id)}`;
}

// Answer pages always live on the clean slug (never the legacy Firestore id),
// so each passage has exactly one answers URL.
export function answersPath(skill, slug) {
  return `${practicePath(skill, slug)}/answers`;
}

export function answersUrl(skill, slug) {
  return `${SITE_URL}${answersPath(skill, slug)}`;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------
const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  eacute: 'é',
  egrave: 'è',
  pound: '£',
  euro: '€',
  deg: '°',
  times: '×',
};

export function decodeEntities(text) {
  return String(text ?? '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    const named = NAMED_ENTITIES[code.toLowerCase()];
    return named ?? match;
  });
}

export function htmlToText(html) {
  return decodeEntities(String(html ?? '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

// Letters and digits only — makes verbatim-quote detection immune to
// punctuation, curly quotes, entities and whitespace differences.
function squash(text) {
  return decodeEntities(String(text ?? ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function countWords(text) {
  return String(text ?? '').split(/\s+/).filter(Boolean).length;
}

export function splitSentences(text) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  return clean
    .split(/(?<=[.!?…])["”’)]?\s+(?=["“‘(]?[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function truncate(text, max) {
  const s = String(text ?? '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trim()}…`;
}

// ---------------------------------------------------------------------------
// Passage / transcript blocks with human-readable locations
// ---------------------------------------------------------------------------
// Splits body HTML into paragraphs, tracking any section heading ("Text A —
// …") and IELTS paragraph letters ("<strong>A</strong> …"), so evidence can be
// located as "Paragraph C" or "Text B, paragraph 2" the way learners expect.
export function splitBlocks(html) {
  const source = String(html ?? '')
    .replace(/<br\s*\/?>\s*(?:&nbsp;|\s)*<br\s*\/?>/gi, '</p><p>')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '$&\n\n')
    .replace(/<(h[1-6])[^>]*>/gi, '\n\n<$1>');
  const rawBlocks = source.split(/\n\s*\n/);
  const blocks = [];
  let section = null;
  let paraInSection = 0;
  for (const raw of rawBlocks) {
    const text = htmlToText(raw);
    if (!text) continue;
    if (/^\s*<h[1-6]/i.test(raw.trim())) {
      section = text;
      paraInSection = 0;
      continue;
    }
    paraInSection += 1;
    const letterMatch = raw.match(/^\s*(?:<p[^>]*>\s*)?<(?:strong|b)>\s*([A-Z])\s*<\/(?:strong|b)>/);
    const speakerMatch = !letterMatch
      ? raw.match(/^\s*(?:<p[^>]*>\s*)?<(?:strong|b)>\s*([^<]{2,40}?)\s*:?\s*<\/(?:strong|b)>\s*:?/)
      : null;
    let body = text;
    if (letterMatch) body = text.replace(/^[A-Z]\s+/, '');
    else if (speakerMatch) body = text.slice(htmlToText(speakerMatch[0]).length).replace(/^\s*:\s*/, '');
    blocks.push({
      section,
      index: paraInSection,
      letter: letterMatch ? letterMatch[1] : null,
      speaker: speakerMatch ? htmlToText(speakerMatch[1]).replace(/:$/, '') : null,
      text: body.trim() || text,
    });
  }
  // Only treat letters as paragraph labels when they run A, B, C… in order —
  // a stray bold capital is not a label.
  const lettered = blocks.filter((b) => b.letter);
  const sequential =
    lettered.length >= 2 &&
    lettered.every((b, i) => b.letter === String.fromCharCode(65 + i));
  if (!sequential) blocks.forEach((b) => (b.letter = null));
  return blocks;
}

export function blockLocation(block, skill = 'reading') {
  if (!block) return null;
  const base = block.letter ? `Paragraph ${block.letter}` : `paragraph ${block.index}`;
  if (skill === 'listening') {
    const who = block.speaker && !/^(part|section)\b/i.test(block.speaker) ? ` (${block.speaker})` : '';
    return `Transcript, ${block.letter ? base : base}${who}`;
  }
  if (block.section) {
    const sectionName = block.section.split(/\s+[—–-]\s+/)[0];
    return `${sectionName}, ${base.charAt(0).toLowerCase()}${base.slice(1)}`;
  }
  return base.charAt(0).toUpperCase() + base.slice(1);
}

// ---------------------------------------------------------------------------
// Evidence finder
// ---------------------------------------------------------------------------
const STOPWORDS = new Set(
  `a about above after again against all also am an and any are as at be because been before being
  below between both but by can could did do does doing down during each few for from further had has
  have having he her here hers him his how i if in into is it its itself just me more most my no nor not
  of off on once only or other our ours out over own same she should so some such than that the their
  theirs them then there these they this those through to too under until up very was we were what when
  where which while who whom why will with would you your yours
  passage statement statements answer answers correct option options question questions state states
  stated mention mentions mentioned mentioning says said explain explains explained indicates indicating
  according speaker speakers recording talk writer author text therefore thus however neither nor confirm
  confirms deny denies claim claims part`.split(/\s+/)
);

function stem(word) {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

export function contentTokens(text) {
  return decodeEntities(String(text ?? ''))
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && (w.length > 2 || /\d/.test(w)) && !STOPWORDS.has(w))
    .map(stem);
}

// Split an explanation into verbatim-quote fragments ("…" / "..." joins
// non-contiguous excerpts in the backfilled keys).
function quoteFragments(explanation) {
  return htmlToText(explanation)
    .replace(/^["“‘']+|["”’']+$/g, '')
    .split(/\s*(?:\.\.\.|…)\s*/)
    .map((f) => f.trim())
    .filter((f) => countWords(f) >= 4);
}

// True when the explanation IS a verbatim excerpt of the source (as most of
// the backfilled Reading keys are) — then it doubles as the evidence quote.
export function findVerbatimBlock(blocks, explanation) {
  const fragments = quoteFragments(explanation);
  if (!fragments.length) return null;
  const squashedBlocks = blocks.map((b) => squash(b.text));
  const firstIdx = squashedBlocks.findIndex((sb) => sb.includes(squash(fragments[0])));
  if (firstIdx < 0) return null;
  const whole = squashedBlocks.join('');
  if (!fragments.every((f) => whole.includes(squash(f)))) return null;
  return blocks[firstIdx];
}

// Best-matching sentence for a paraphrased explanation. Scores each sentence
// by weighted content-word overlap with the explanation, the correct answer
// and the question prompt, with a strong bonus when the sentence contains the
// exact answer words (typical for completion answers in Listening).
export function findBestSentence(
  blocks,
  { explanation = '', answerText = '', promptText = '', answerIsVerbatim = false, strict = false } = {}
) {
  const weights = new Map();
  const add = (tokens, w) =>
    tokens.forEach((t) => weights.set(t, Math.max(weights.get(t) || 0, w)));
  add(contentTokens(htmlToText(explanation)), 1);
  // The prompt names WHAT is being asked about ("the Tuesday group"), which
  // pins the right sentence better than generic explanation words.
  add(contentTokens(promptText), 1.5);
  // Completion answers are copied from the source, so their words (and the
  // exact phrase) are the strongest signal; option texts are paraphrases.
  add(contentTokens(answerText), answerIsVerbatim ? 2 : 1);
  if (!weights.size) return null;
  const answerSquash = answerIsVerbatim ? squash(answerText) : '';

  let best = null;
  blocks.forEach((block) => {
    splitSentences(block.text).forEach((sentence) => {
      const tokens = new Set(contentTokens(sentence));
      let score = 0;
      let hits = 0;
      let strongHits = 0;
      weights.forEach((w, t) => {
        if (tokens.has(t)) {
          score += w;
          hits += 1;
          if (w >= 1) strongHits += 1;
        }
      });
      if (answerSquash.length >= 3 && squash(sentence).includes(answerSquash)) score += 3;
      if (!best || score > best.score) best = { block, sentence, score, hits, strongHits };
    });
  });
  // `strict` (NOT GIVEN answers): the source never states the answer, so only
  // point at a line when it is clearly about the same thing.
  if (!best || best.score < (strict ? 4 : 3) || best.strongHits < (strict ? 3 : 2)) return null;
  return best;
}

// ---------------------------------------------------------------------------
// Answer display
// ---------------------------------------------------------------------------
function optionLine(group, key) {
  const opt = (group.options || []).find((o) => o.key === key);
  if (!opt) return key;
  const text = stripOptionKeyPrefix(opt.key, opt.text);
  // Matching-information banks are often just "Paragraph C" — don't print
  // "C — Paragraph C".
  if (new RegExp(`^(paragraph|section|text)\\s+${key}$`, 'i').test(String(text).trim())) return text;
  return `${key} — ${text}`;
}

export function answerDisplay(group, question) {
  const cfg = typeConfig(group.questionType);
  const ak = question.answerKey || {};
  if (cfg.grade === 'optionKeySingle' || cfg.grade === 'optionKeySet') {
    const keys = ak.correctOptionKeys || [];
    return {
      short: keys.join(', '),
      full: keys.map((k) => optionLine(group, k)).join('; '),
      text: keys
        .map((k) => {
          const opt = (group.options || []).find((o) => o.key === k);
          return opt ? stripOptionKeyPrefix(opt.key, opt.text) : k;
        })
        .join(' '),
      alsoAccepted: [],
    };
  }
  const accepted = (ak.accepted || []).filter(Boolean);
  if (cfg.input === 'boolean') {
    const v = String(accepted[0] || '').toUpperCase();
    return { short: v, full: v, text: '', alsoAccepted: [] };
  }
  return {
    short: accepted[0] || '',
    full: accepted[0] || '',
    text: accepted[0] || '',
    alsoAccepted: accepted.slice(1),
  };
}

// One-line reasoning for keys whose explanation is a bare evidence quote.
export function templatedReasoning(group, question, answer, skill) {
  const cfg = typeConfig(group.questionType);
  const source = skill === 'listening' ? 'the recording' : 'the passage';
  const verdict = answer.short;
  if (group.questionType === 'true_false_notgiven') {
    if (verdict === 'TRUE') return `This sentence confirms the statement, so the answer is TRUE.`;
    if (verdict === 'FALSE') return `This sentence directly contradicts the statement, so the answer is FALSE.`;
    return `${source[0].toUpperCase()}${source.slice(1)} discusses this topic here but never confirms or contradicts the statement, so the answer is NOT GIVEN.`;
  }
  if (group.questionType === 'yes_no_notgiven') {
    if (verdict === 'YES') return `The writer's view here agrees with the statement, so the answer is YES.`;
    if (verdict === 'NO') return `The writer's view here contradicts the statement, so the answer is NO.`;
    return `The writer touches on this topic but never gives a view on the statement, so the answer is NOT GIVEN.`;
  }
  if (cfg.grade === 'optionKeySingle' || cfg.grade === 'optionKeySet') {
    return `This is the part of ${source} that supports ${answer.full}.`;
  }
  const limit = question.answerKey?.wordLimit;
  const limitNote = limit ? ` It fits the ${limit}-word limit.` : '';
  return `The answer “${answer.short}” is taken from this sentence — copy the word(s) exactly as they appear.${limitNote}`;
}

// ---------------------------------------------------------------------------
// Eligibility — only fully keyed, fully explained passages get a page
// ---------------------------------------------------------------------------
export function passageQuestions(passage) {
  return (passage?.groups || []).flatMap((g) => g.questions || []);
}

export function answerPageEligible(passage) {
  if (!passage || !ANSWER_SKILLS.includes(passage.skill)) return false;
  // Editorial exclusion: titles that collide with published IELTS passages.
  if (isAnswerKeyTitleDenied(passage.title)) return false;
  const questions = passageQuestions(passage);
  if (!questions.length) return false;
  // toStructuredPassageShape drops ungradeable questions; a passage that lost
  // any is not "complete", so its key would disagree with the numbering of
  // any printed/official version — skip it rather than publish a partial key.
  if (Number(passage.droppedQuestionCount || 0) > 0) return false;
  if (!questions.every((q) => htmlToText(q.answerKey?.explanation).length > 0)) return false;
  if (passage.skill === 'reading' && !htmlToText(passage.bodyHtml)) return false;
  if (passage.skill === 'listening' && !htmlToText(passage.transcriptHtml)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Band table for THIS passage's raw scores (same scaling as the practice
// page's results panel — see estimateBand in grade.js).
// ---------------------------------------------------------------------------
export function bandRowsForPassage(total, skill = 'reading', module = 'academic') {
  if (!total) return [];
  const rows = [];
  for (let score = total; score >= 0; score -= 1) {
    const band = estimateBand(score, total, skill, module);
    const last = rows[rows.length - 1];
    if (last && last.band === band) last.min = score;
    else rows.push({ min: score, max: score, band });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Question-type tips
// ---------------------------------------------------------------------------
const READING_TYPE_BY_ENUM = Object.values(READING_QUESTION_TYPES).reduce((acc, t) => {
  acc[t.questionType] = t;
  return acc;
}, {});

export function questionTypeLabel(questionType) {
  return (
    READING_TYPE_BY_ENUM[questionType]?.label ||
    {
      form_completion: 'Form Completion',
      plan_map_diagram_label: 'Plan / Map Labelling',
    }[questionType] ||
    String(questionType || '')
      .split('_')
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ')
  );
}

export function tipsForPassage(passage, skill) {
  const types = [...new Set((passage.groups || []).map((g) => g.questionType))];
  if (skill === 'listening') {
    const part = Object.values(LISTENING_PARTS).find((p) => p.part === passage.listeningPart);
    const tips = [];
    if (part) {
      tips.push({
        key: part.slug,
        label: `Listening ${part.label}`,
        href: `/listening/${part.slug}`,
        steps: part.guide.steps.slice(0, 2),
        trap: part.guide.traps[0] || null,
      });
    }
    return tips;
  }
  return types
    .map((t) => READING_TYPE_BY_ENUM[t])
    .filter(Boolean)
    .map((t) => ({
      key: t.slug,
      label: t.label,
      href: `/reading/${t.slug}`,
      steps: t.guide.steps.slice(0, 2),
      trap: t.guide.traps[0] || null,
    }));
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
export function passageSummary(passage, skill) {
  const html = skill === 'listening' ? passage.transcriptHtml : passage.bodyHtml;
  const blocks = splitBlocks(html);
  const firstLong = blocks.find((b) => countWords(b.text) >= 12) || blocks[0];
  const lead = firstLong ? truncate(splitSentences(firstLong.text).slice(0, 2).join(' '), 320) : '';
  const questions = passageQuestions(passage);
  return {
    lead,
    wordCount: countWords(blocks.map((b) => b.text).join(' ')),
    paragraphCount: blocks.length,
    questionCount: questions.length,
    typeLabels: [...new Set((passage.groups || []).map((g) => questionTypeLabel(g.questionType)))],
  };
}

// ---------------------------------------------------------------------------
// Main builder → serialisable page props
// ---------------------------------------------------------------------------
export function buildAnswerKey(passage, skill = passage?.skill) {
  if (!passage) return null;
  const html = skill === 'listening' ? passage.transcriptHtml : passage.bodyHtml;
  const blocks = splitBlocks(html);

  let exactEvidence = 0;
  let locatedEvidence = 0;
  const groups = (passage.groups || []).map((group) => {
    const cfg = typeConfig(group.questionType);
    const showOptions = (group.options || []).length > 0;
    return {
      id: group.id,
      range: groupRangeLabel(group),
      questionType: group.questionType,
      typeLabel: questionTypeLabel(group.questionType),
      prompt: cleanGroupPrompt(group.prompt) || '',
      instructions: htmlToText(group.instructionsHtml),
      options: showOptions
        ? group.options.map((o) => ({ key: o.key, text: stripOptionKeyPrefix(o.key, o.text) }))
        : [],
      isChoice: cfg.grade === 'optionKeySingle' || cfg.grade === 'optionKeySet',
      questions: (group.questions || []).map((question) => {
        const answer = answerDisplay(group, question);
        const explanation = question.answerKey?.explanation || '';
        const verbatimBlock = findVerbatimBlock(blocks, explanation);
        let evidence = null;
        let reasoning = null;
        let explanationHtml = explanation;
        if (verbatimBlock) {
          exactEvidence += 1;
          const quote = truncate(htmlToText(explanation).replace(/^["“‘']+|["”’']+$/g, ''), 420);
          evidence = {
            // A fragment that starts mid-sentence reads as a quote with "…".
            quote: /^[a-z]/.test(quote) ? `…${quote}` : quote,
            location: blockLocation(verbatimBlock, skill),
            exact: true,
            label: answer.short === 'NOT GIVEN' ? 'Closest related text' : 'Evidence',
          };
          reasoning = templatedReasoning(group, question, answer, skill);
          explanationHtml = '';
        } else {
          const best = findBestSentence(blocks, {
            explanation,
            answerText: answer.text,
            promptText: question.promptText,
            answerIsVerbatim: cfg.input === 'text' || cfg.input === 'visual',
            strict: answer.short === 'NOT GIVEN',
          });
          if (best) {
            locatedEvidence += 1;
            evidence = {
              quote: truncate(best.sentence, 420),
              location: blockLocation(best.block, skill),
              exact: false,
              label:
                answer.short === 'NOT GIVEN'
                  ? 'Closest related text'
                  : skill === 'listening'
                    ? 'What you hear'
                    : 'Where to find it',
            };
          }
        }
        return {
          number: question.number,
          prompt: question.promptText || '',
          answer: answer.short,
          answerFull: answer.full,
          alsoAccepted: answer.alsoAccepted,
          wordLimit: question.answerKey?.wordLimit ?? null,
          explanationHtml,
          reasoning,
          evidence,
        };
      }),
    };
  });

  const total = passageQuestions(passage).length;
  const readingModule = passage.module === 'general' ? 'general' : 'academic';
  return {
    skill,
    slug: passage.slug,
    title: passage.title,
    module: skill === 'reading' ? readingModule : null,
    difficulty: passage.difficulty || null,
    listeningPart: passage.listeningPart ?? null,
    practiceHref: practicePath(skill, passage.legacyId || passage.slug),
    answersHref: answersPath(skill, passage.slug),
    summary: passageSummary(passage, skill),
    groups,
    total,
    tips: tipsForPassage(passage, skill),
    bandRows: bandRowsForPassage(total, skill, readingModule),
    evidenceStats: { exact: exactEvidence, located: locatedEvidence, total },
  };
}

// ---------------------------------------------------------------------------
// SEO
// ---------------------------------------------------------------------------
export function answerPageTitle(title, skill) {
  const skillName = skill === 'listening' ? 'Listening' : 'Reading';
  return `${title} ${skillName} Answers with Explanations (IELTS Practice)`;
}

// Practice-page <title>. "…Practice Test with Answers" (matching
// "<passage> reading answers" searches) only when a published answer-key page
// backs the claim — denylisted / incomplete passages keep the plain form.
export function practicePageTitle(title, skill, hasAnswers) {
  const skillName = skill === 'listening' ? 'Listening' : 'Reading';
  if (!title) return `IELTS ${skillName} Practice | IELTS-Bank`;
  return hasAnswers
    ? `${title} – IELTS ${skillName} Practice Test with Answers`
    : `${title} | IELTS ${skillName} Practice | IELTS-Bank`;
}

export function answerPageDescription(key) {
  const skillName = key.skill === 'listening' ? 'Listening' : 'Reading';
  const evidence = key.skill === 'listening' ? 'transcript evidence' : 'the evidence sentence and paragraph';
  return truncate(
    `Answers for all ${key.total} questions in the IELTS ${skillName} practice test “${key.title}”, with explanations, ${evidence}, and an estimated band score. Try the timed test first.`,
    300
  );
}

export function answerPageJsonLd(key, { description } = {}) {
  const url = `${SITE_URL}${key.answersHref}`;
  const practiceUrl = `${SITE_URL}${key.practiceHref}`;
  const skillName = key.skill === 'listening' ? 'Listening' : 'Reading';
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: truncate(`${key.title}: ${skillName} Answers & Explanations`, 110),
        description,
        url,
        mainEntityOfPage: url,
        inLanguage: 'en',
        isAccessibleForFree: true,
        articleSection: `IELTS ${skillName}`,
        about: [
          { '@type': 'Thing', name: `IELTS ${skillName}` },
          { '@type': 'LearningResource', name: key.title, url: practiceUrl },
        ],
        author: { '@type': 'Organization', name: 'IELTS-Bank', url: SITE_URL },
        publisher: {
          '@type': 'Organization',
          name: 'IELTS-Bank',
          url: SITE_URL,
          logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo512.png` },
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          {
            '@type': 'ListItem',
            position: 2,
            name: `IELTS ${skillName}`,
            item: `${SITE_URL}/${key.skill}question`,
          },
          { '@type': 'ListItem', position: 3, name: key.title, item: practiceUrl },
          { '@type': 'ListItem', position: 4, name: 'Answers', item: url },
        ],
      },
    ],
  };
}
