#!/usr/bin/env node
// Local structural validator for the new batch. No DB access. Checks JSON parse,
// word counts, question counts, and answer-key sanity for the 4 supported types.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, 'data');
const NEW = process.argv.slice(2);
const files = readdirSync(DATA).filter((f) => f.endsWith('.json') && (NEW.length === 0 || NEW.some((n) => f.includes(n))));

const TF = new Set(['true', 'false', 'not given']);
const YN = new Set(['yes', 'no', 'not given']);
const wc = (html) => (String(html).replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length);

let problems = 0;
const titles = [];
for (const f of files) {
  let arr;
  try { arr = JSON.parse(readFileSync(join(DATA, f), 'utf8')); }
  catch (e) { console.log(`PARSE FAIL ${f}: ${e.message}`); problems++; continue; }
  for (const item of arr) {
    titles.push(`${item.skill}/${item.module || 'academic'}/${item.title}`);
    if (item.skill === 'reading') {
      const words = wc(item.body_html);
      let qn = 0;
      for (const g of item.groups) {
        for (const q of g.questions) {
          qn++;
          if (g.question_type === 'true_false_notgiven' && !TF.has(String(q.answer))) { console.log(`BAD TFNG "${item.title}": ${q.answer}`); problems++; }
          if (g.question_type === 'yes_no_notgiven' && !YN.has(String(q.answer))) { console.log(`BAD YNNG "${item.title}": ${q.answer}`); problems++; }
          if (g.question_type === 'multiple_choice') {
            if (!Array.isArray(q.options) || q.options.length < 2) { console.log(`BAD MCQ options "${item.title}"`); problems++; }
            if (typeof q.answer_index !== 'number' || q.answer_index < 0 || q.answer_index >= (q.options||[]).length) { console.log(`BAD MCQ index "${item.title}": ${q.answer_index}`); problems++; }
          }
          if (g.question_type === 'short_answer') {
            if (!Array.isArray(q.accepted) || q.accepted.length === 0) { console.log(`BAD SA accepted "${item.title}": ${q.prompt_text}`); problems++; }
          }
        }
      }
      const flag = (item.module === 'general')
        ? (qn < 8 ? ' <-- LOW(GT ok if >=8)' : '')
        : ((words < 700 || words > 950) ? ` <-- WORDS out of 700-950` : '') + (qn < 12 || qn > 14 ? ` <-- Q=${qn} out of 12-14` : '');
      console.log(`${item.module||'academic'} | ${item.title} | ${words}w | ${qn}q${flag}`);
    } else if (item.skill === 'writing') {
      const ok = item.prompt_html && item.task && item.word_limit_min;
      console.log(`writing/${item.module||'academic'} | task${item.task} | ${item.essay_type} | ${item.title}${ok?'':' <-- MISSING FIELD'}`);
      if (!ok) problems++;
    }
  }
}
// duplicate title within batch
const seen = new Set();
for (const t of titles) { if (seen.has(t)) { console.log(`DUP TITLE ${t}`); problems++; } seen.add(t); }
console.log(`\nProblems: ${problems}. Items: ${titles.length}`);
