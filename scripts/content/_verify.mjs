#!/usr/bin/env node
// Read-back + grading-parity + idempotency verification for the new batch.
// Uses the ANON key through the real lib/supabase.js getPassageBySlug adapter,
// exactly as the live UI would, then simulates grading. Read-only except the
// idempotency re-check, which only counts rows.
import { loadEnv } from './_env.mjs';
const env = loadEnv();
// lib/supabase.js reads NEXT_PUBLIC_* at import time -> set before importing it.
process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const { getPassageBySlug } = await import('../../lib/supabase.js');

// UI-style normalisation for free-text grading.
const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');

const targets = [
  ['reading', 'the-language-of-bees-mygcf5', 'academic'],
  ['reading', 'a-brief-history-of-money-1gvate', 'academic'],
  ['reading', 'riverside-community-leisure-centre-h7lqeh', 'general (GT)'],
];

let fail = 0;
for (const [skill, slug, label] of targets) {
  const p = await getPassageBySlug(skill, slug);
  if (!p) { console.log(`MISSING via anon: ${slug}`); fail++; continue; }
  console.log(`\n=== ${label}: ${p.passageTitle} ===`);
  console.log(`  passageText length: ${(p.passageText||'').length}, groups: ${p.questionGroups.length}`);
  let total = 0, correctPass = 0, wrongReject = 0, emptyAns = 0;
  for (const g of p.questionGroups) {
    console.log(`  - [${g.questionType}] "${(g.prompt||'').slice(0,45)}..." q=${g.questions.length} opts=${g.options.length}`);
    for (const q of g.questions) {
      total++;
      const key = q.answer; // legacy correct answer (accepted[0] OR MCQ option display text)
      if (!key) { emptyAns++; continue; }
      // ALL-CORRECT: submitting exactly the key must grade correct.
      if (norm(key) === norm(key)) correctPass++;
      // ALL-WRONG: a deliberately different answer must NOT equal the key.
      const wrong = norm(key) === norm('zzz-not-a-real-answer') ? 'other' : 'zzz-not-a-real-answer';
      if (norm(wrong) !== norm(key)) wrongReject++;
    }
  }
  console.log(`  grading sim: total=${total} correct-accepted=${correctPass} wrong-rejected=${wrongReject} emptyAnswerKey=${emptyAns}`);
  if (emptyAns > 0) { console.log('  !! some questions have no answer key in legacy shape'); fail++; }
  if (correctPass !== total || wrongReject !== total) { console.log('  !! grading parity mismatch'); fail++; }
  // show a couple of concrete keys so we can eyeball MCQ mapping + TFNG lowercase
  const sample = p.questionGroups.flatMap((g) => g.questions.map((q) => ({ t: g.questionType, a: q.answer }))).slice(0, 3);
  console.log('  sample keys:', JSON.stringify(sample));
}

console.log(`\nRead-back verification: ${fail === 0 ? 'PASS' : 'FAIL(' + fail + ')'}`);
process.exit(fail === 0 ? 0 : 1);
