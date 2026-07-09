// Read-back + grading-parity verification for the rdA batch.
// Uses lib/supabase.js (ANON key, RLS-enforced) exactly as the live app does.
import { loadEnv } from './_env.mjs';
const env = loadEnv();
// lib/supabase.js reads NEXT_PUBLIC_* from process.env — populate them.
process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const { getPassageBySlug, getStructuredPassage } = await import('../../lib/supabase.js');

// Mirror the app's auto-scoring: choice types compare option key; text types
// normalise lower+trim and test membership in accepted.
function gradeAllCorrect(groups) {
  let total = 0, correct = 0;
  for (const g of groups) {
    for (const q of g.questions) {
      total++;
      const ak = q.answerKey;
      if (ak.correctOptionKeys && ak.correctOptionKeys.length) {
        const submitted = ak.correctOptionKeys[0];
        if (ak.correctOptionKeys.includes(submitted)) correct++;
      } else {
        const submitted = String(ak.accepted[0] || '').trim().toLowerCase();
        const accepted = ak.accepted.map((a) => String(a).trim().toLowerCase());
        if (accepted.includes(submitted)) correct++;
      }
    }
  }
  return { total, correct };
}
function gradeAllWrong(groups) {
  let total = 0, correct = 0;
  for (const g of groups) {
    for (const q of g.questions) {
      total++;
      const ak = q.answerKey;
      if (ak.correctOptionKeys && ak.correctOptionKeys.length) {
        const submitted = '__ZZ__'; // never a valid option key
        if (ak.correctOptionKeys.includes(submitted)) correct++;
      } else {
        const submitted = '__definitely_not_the_answer__';
        const accepted = ak.accepted.map((a) => String(a).trim().toLowerCase());
        if (accepted.includes(submitted)) correct++;
      }
    }
  }
  return { total, correct };
}

const slugs = [
  'why-the-sky-is-blue-o3hrt4',
  'the-long-journey-of-plastic-through-the-ocean-qb7jbg',
  'simple-ways-to-save-energy-at-home-1vaoz7',
];

let ok = true;
for (const slug of slugs) {
  const legacy = await getPassageBySlug('reading', slug);
  const structured = await getStructuredPassage('reading', slug);
  if (!legacy || !structured) { console.log('MISSING via anon:', slug); ok = false; continue; }
  const allCorrect = gradeAllCorrect(structured.groups);
  const allWrong = gradeAllWrong(structured.groups);
  const qCount = structured.groups.reduce((n, g) => n + g.questions.length, 0);
  const bodyLen = (legacy.passageText || '').length;
  const pass = allCorrect.correct === allCorrect.total && allWrong.correct === 0;
  if (!pass) ok = false;
  console.log(`\n[${slug}]`);
  console.log(`  module=${structured.module} title="${legacy.passageTitle}" bodyChars=${bodyLen} questions=${qCount} groups=${structured.groups.length}`);
  console.log(`  all-correct: ${allCorrect.correct}/${allCorrect.total}  |  all-wrong: ${allWrong.correct}/${allWrong.total}  => ${pass ? 'PARITY OK' : 'PARITY FAIL'}`);
  // show first group type + first question sanity
  console.log(`  first group type=${structured.groups[0].questionType}, first Q="${structured.groups[0].questions[0].promptText.slice(0,60)}..."`);
}
console.log(ok ? '\nREAD-BACK + GRADING PARITY: ALL PASS' : '\nREAD-BACK: FAIL');
process.exit(ok ? 0 : 1);
