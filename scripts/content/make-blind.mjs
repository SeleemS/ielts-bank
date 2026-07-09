// Produce answer-stripped "blind" sheets (passage + questions, NO keys) for
// independent verification, plus a key file for diffing. Blind sheets go to
// scratchpad so verifiers cannot peek at keys.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, 'data');
const OUT = process.argv[2] || DATA; // pass scratchpad dir

let gnum = 0;
const keys = {}; // "Passage Title#N" -> canonical key

for (const f of readdirSync(DATA).filter((x) => x.endsWith('.json'))) {
  const arr = JSON.parse(readFileSync(join(DATA, f), 'utf8'));
  if (arr[0]?.skill !== 'reading') continue;
  const blind = [];
  for (const p of arr) {
    let n = 0;
    const gs = [];
    for (const g of p.groups) {
      const qs = [];
      for (const q of g.questions) {
        n++; gnum++;
        const item = { n, prompt_text: q.prompt_text };
        if (g.question_type === 'multiple_choice') {
          item.options = q.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`);
          keys[`${p.title}#${n}`] = 'MC:' + String.fromCharCode(65 + q.answer_index);
        } else if (g.question_type === 'true_false_notgiven') {
          keys[`${p.title}#${n}`] = 'TFNG:' + q.answer;
        } else if (g.question_type === 'yes_no_notgiven') {
          keys[`${p.title}#${n}`] = 'YNNG:' + q.answer;
        } else {
          keys[`${p.title}#${n}`] = 'SA:' + q.accepted[0];
        }
        qs.push(item);
      }
      gs.push({
        instruction: g.question_type === 'multiple_choice'
          ? 'Choose the correct letter A, B, C or D.'
          : g.question_type === 'true_false_notgiven'
          ? 'Answer TRUE, FALSE or NOT GIVEN.'
          : g.question_type === 'yes_no_notgiven'
          ? 'Answer YES, NO or NOT GIVEN (does it agree with the WRITER\'s view?).'
          : 'Answer with a word/phrase from the passage (short answer).',
        type: g.question_type,
        questions: qs,
      });
    }
    blind.push({ title: p.title, body_html: p.body_html, groups: gs });
  }
  writeFileSync(join(OUT, 'blind-' + f), JSON.stringify(blind, null, 2));
  console.log('wrote blind-' + f, blind.length, 'passages');
}
writeFileSync(join(__dirname, 'answer-keys.json'), JSON.stringify(keys, null, 2));
console.log('total questions keyed:', Object.keys(keys).length);
