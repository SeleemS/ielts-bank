// Structural validator for rdA-*.json. Checks shape parity with transformReading
// expectations and grader semantics. Does NOT judge correctness of answers
// (that is done by a human blind re-answer pass); it catches shape bugs.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, 'data');
const files = readdirSync(DATA).filter((f) => /^rdA-.*\.json$/.test(f)).sort();

const TFNG = new Set(['true', 'false', 'not given']);
const YNNG = new Set(['yes', 'no', 'not given']);
let errs = 0;
const err = (m) => { console.log('  ERR', m); errs++; };
const wc = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').length;
const titles = new Set();
let totals = { passages: 0, questions: 0, academic: 0, general: 0, byType: {}, byAnswer: {} };

for (const f of files) {
  const arr = JSON.parse(readFileSync(join(DATA, f), 'utf8'));
  if (!Array.isArray(arr)) { err(`${f}: not an array`); continue; }
  console.log(`\n== ${f} (${arr.length} passages) ==`);
  for (const it of arr) {
    totals.passages++;
    if (it.module === 'general') totals.general++; else totals.academic++;
    const words = wc(it.body_html || '');
    if (titles.has(it.title)) err(`dup title in batch: ${it.title}`);
    titles.add(it.title);
    if (it.skill !== 'reading') err(`${it.title}: skill != reading`);
    if (!['academic', 'general'].includes(it.module)) err(`${it.title}: bad module ${it.module}`);
    if (!it.body_html || !/<p>/.test(it.body_html)) err(`${it.title}: body_html missing <p>`);
    let q = 0;
    const types = (it.groups || []).map((g) => g.question_type);
    for (const g of it.groups || []) {
      totals.byType[g.question_type] = (totals.byType[g.question_type] || 0) + (g.questions || []).length;
      for (const question of g.questions || []) {
        q++; totals.questions++;
        if (!question.prompt_text) err(`${it.title}: empty prompt_text`);
        if (g.question_type === 'true_false_notgiven') {
          const a = String(question.answer);
          totals.byAnswer[a] = (totals.byAnswer[a] || 0) + 1;
          if (!TFNG.has(a)) err(`${it.title}: TFNG bad answer "${a}"`);
        } else if (g.question_type === 'yes_no_notgiven') {
          const a = String(question.answer);
          totals.byAnswer[a] = (totals.byAnswer[a] || 0) + 1;
          if (!YNNG.has(a)) err(`${it.title}: YNNG bad answer "${a}"`);
        } else if (g.question_type === 'multiple_choice') {
          if (!Array.isArray(question.options) || question.options.length !== 4) err(`${it.title}: MCQ needs 4 options`);
          if (!Number.isInteger(question.answer_index) || question.answer_index < 0 || question.answer_index > 3) err(`${it.title}: MCQ bad answer_index`);
        } else if (g.question_type === 'short_answer') {
          if (!Array.isArray(question.accepted) || question.accepted.length < 1) err(`${it.title}: SA needs accepted[]`);
          const a0 = String(question.accepted[0] || '');
          const nWords = a0.trim().split(/\s+/).length;
          if (!question.word_limit || question.word_limit < nWords) err(`${it.title}: SA word_limit ${question.word_limit} < words(${nWords}) in "${a0}"`);
          if (question.word_limit > 3) err(`${it.title}: SA word_limit > 3`);
          // answer should appear verbatim (case-insensitive) in body
          const body = (it.body_html || '').toLowerCase();
          if (!body.includes(a0.toLowerCase())) err(`${it.title}: SA answer "${a0}" not verbatim in passage`);
        } else {
          err(`${it.title}: unexpected question_type ${g.question_type}`);
        }
      }
    }
    const okWords = it.module === 'general' ? (words >= 380 && words <= 700) : (words >= 700 && words <= 950);
    console.log(`  - "${it.title}" [${it.module}] ${words}w, ${q}q, groups=${types.join('+')} ${okWords ? '' : '(WORDCOUNT?)'}`);
  }
}
console.log('\n== TOTALS ==', JSON.stringify(totals, null, 0));
console.log(errs ? `\nFAILED with ${errs} structural errors` : '\nALL STRUCTURAL CHECKS PASSED');
process.exit(errs ? 1 : 0);
