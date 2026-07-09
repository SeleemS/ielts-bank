// Structural validation of authored JSON before import. No DB access.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, 'data');

const ALLOWED = new Set(['true_false_notgiven', 'yes_no_notgiven', 'multiple_choice', 'short_answer']);
const TFNG = new Set(['true', 'false', 'not given']);
const YNNG = new Set(['yes', 'no', 'not given']);

let errors = 0;
const err = (m) => { console.log('  ERROR: ' + m); errors++; };

const files = readdirSync(DATA).filter((f) => f.endsWith('.json'));
const titles = new Set();
let readingPassages = 0, readingQuestions = 0, writingT1 = 0, writingT2 = 0;
const typeCounts = {};
const tfCounts = { true: 0, false: 0, 'not given': 0, yes: 0, no: 0 };

for (const f of files) {
  const arr = JSON.parse(readFileSync(join(DATA, f), 'utf8'));
  console.log(`\n[${f}] ${arr.length} items`);
  for (const p of arr) {
    if (!p.title) err('missing title');
    if (titles.has(p.title)) err('duplicate title: ' + p.title);
    titles.add(p.title);

    if (p.skill === 'writing') {
      if (![1, 2].includes(p.task)) err('writing bad task: ' + p.title);
      if (!/<p>/.test(p.prompt_html || '')) err('writing prompt not html: ' + p.title);
      if (p.task === 1) { writingT1++; if (p.word_limit_min !== 150) err('T1 wlm!=150: ' + p.title); }
      if (p.task === 2) { writingT2++; if (p.word_limit_min !== 250) err('T2 wlm!=250: ' + p.title); }
      continue;
    }

    // reading
    readingPassages++;
    const wc = String(p.body_html || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    let qn = 0;
    if (!Array.isArray(p.groups) || p.groups.length < 2) err('groups<2: ' + p.title);
    for (const g of p.groups) {
      if (!ALLOWED.has(g.question_type)) err('bad type ' + g.question_type + ' in ' + p.title);
      typeCounts[g.question_type] = (typeCounts[g.question_type] || 0) + (g.questions?.length || 0);
      for (const q of (g.questions || [])) {
        qn++; readingQuestions++;
        if (!q.prompt_text) err('q no prompt_text in ' + p.title);
        if (g.question_type === 'true_false_notgiven') {
          if (!TFNG.has(q.answer)) err(`TFNG bad answer "${q.answer}" in ${p.title}`);
          else tfCounts[q.answer]++;
        } else if (g.question_type === 'yes_no_notgiven') {
          if (!YNNG.has(q.answer)) err(`YNNG bad answer "${q.answer}" in ${p.title}`);
          else tfCounts[q.answer]++;
        } else if (g.question_type === 'multiple_choice') {
          if (!Array.isArray(q.options) || q.options.length !== 4) err('MC options!=4 in ' + p.title);
          if (typeof q.answer_index !== 'number' || q.answer_index < 0 || q.answer_index > 3) err('MC bad answer_index in ' + p.title);
          for (const o of (q.options || [])) if (o !== o.trim()) err('MC option has whitespace pad: ' + JSON.stringify(o));
        } else if (g.question_type === 'short_answer') {
          if (!Array.isArray(q.accepted) || q.accepted.length < 1) err('SA no accepted in ' + p.title);
          if (!q.accepted[0] || !q.accepted[0].trim()) err('SA empty canonical in ' + p.title);
          const words = q.accepted[0].trim().split(/\s+/).length;
          if (q.word_limit && words > q.word_limit) err(`SA canonical "${q.accepted[0]}" exceeds word_limit ${q.word_limit} in ${p.title}`);
        }
      }
    }
    console.log(`  - ${p.title}: ${wc} words, ${qn} questions`);
    if (wc < 700 || wc > 950) console.log(`    WARN word count ${wc} outside 750-900 target`);
    if (qn < 12 || qn > 14) console.log(`    WARN question count ${qn} outside 12-14`);
  }
}

console.log('\n=== TOTALS ===');
console.log('reading passages:', readingPassages, 'reading questions:', readingQuestions);
console.log('writing Task 2:', writingT2, 'Task 1:', writingT1);
console.log('question type counts:', typeCounts);
console.log('answer distribution:', tfCounts);
console.log(errors ? `\n${errors} ERROR(S)` : '\nALL STRUCTURAL CHECKS PASSED');
process.exit(errors ? 1 : 0);
