// STEP 5 verification. Reads new passages back through the REAL lib/supabase.js
// getPassageBySlug (ANON key + RLS) in the exact legacy shape the UI consumes,
// then hand-simulates the ReadingQuestion handleSubmit grading to prove parity.
import { loadEnv } from './_env.mjs';

const env = loadEnv();
// lib/supabase.js reads these public vars at import time.
process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const { getPassageBySlug } = await import('../../lib/supabase.js');

const readingSlugs = [
  'bioluminescence-in-the-deep-ocean-gukott',
  'the-library-of-alexandria-1l1vs5',
  'the-global-journey-of-coffee-3x5el1',
];
const writingSlug = 'free-university-tuition-1ha5az';

// Replicate handleSubmit grading exactly: continuous global numbering, and
// userAnswer === qMap.answer.toLowerCase() after trim/lower on the user side.
function gradePassage(passage, pickAnswer) {
  let counter = 0;
  let correct = 0, total = 0;
  const numbered = passage.questionGroups.map((g) => ({
    ...g,
    questions: g.questions.map((q) => { counter += 1; return { ...q, questionNumber: counter }; }),
  }));
  const detail = [];
  for (const g of numbered) {
    for (const q of g.questions) {
      total += 1;
      const correctAnswer = q.answer.toLowerCase();
      // Simulate the value a user would submit; handleAnswerChange does trim+lower.
      const raw = pickAnswer(g, q);
      const userAnswer = (raw ?? '-').trim().toLowerCase();
      const ok = userAnswer === correctAnswer;
      if (ok) correct += 1;
      detail.push({ n: q.questionNumber, type: g.questionType, ok, userAnswer, correctAnswer });
    }
  }
  return { correct, total, detail };
}

for (const slug of readingSlugs) {
  const p = await getPassageBySlug('reading', slug);
  if (!p) { console.log(`\n!! ${slug} NOT READABLE via anon/RLS`); continue; }
  const groups = p.questionGroups;
  const qTotal = groups.reduce((n, g) => n + g.questions.length, 0);
  const types = [...new Set(groups.map((g) => g.questionType))];
  console.log(`\n=== ${slug} ===`);
  console.log(`  title: ${p.passageTitle} | difficulty: ${p.passageDifficulty} | body chars: ${p.passageText.length}`);
  console.log(`  groups: ${groups.length}, questions: ${qTotal}, group types: ${JSON.stringify(types)}`);
  // sample one option-based (MCQ) answer to show it round-trips to display text
  const mc = groups.find((g) => g.questionType === 'Match');
  if (mc) console.log(`  sample MCQ q1 answer="${mc.questions[0].answer}" options=${JSON.stringify(mc.options.slice(0,4))}`);

  // Grade ALL-CORRECT: user picks each stored answer -> expect full marks.
  const allCorrect = gradePassage(p, (g, q) => q.answer);
  // Grade ALL-WRONG: user picks a deliberately different value -> expect 0.
  const allWrong = gradePassage(p, (g, q) => (q.answer.toLowerCase() === 'true' ? 'false' : 'zzz-wrong'));
  console.log(`  GRADING all-correct: ${allCorrect.correct}/${allCorrect.total}  |  all-wrong: ${allWrong.correct}/${allWrong.total}`);
  if (allCorrect.correct !== allCorrect.total) {
    console.log('  !! PARITY FAILURE — mismatches:', allCorrect.detail.filter((d) => !d.ok));
  }
}

// Writing read-back: confirm prompt_html surfaces as passageText.
const w = await getPassageBySlug('writing', writingSlug);
console.log(`\n=== ${writingSlug} (writing) ===`);
if (w) console.log(`  title: ${w.passageTitle} | prompt chars: ${w.passageText.length} | groups: ${w.questionGroups.length}`);
else console.log('  NOT READABLE');

// Detailed parity dump for ONE passage (first slug), one Q per type.
const one = await getPassageBySlug('reading', readingSlugs[0]);
console.log(`\n--- DETAILED grading trace: ${one.passageTitle} (one per type) ---`);
const traced = gradePassage(one, (g, q) => q.answer);
const seen = new Set();
for (const d of traced.detail) {
  if (seen.has(d.type)) continue; seen.add(d.type);
  console.log(`  Q${d.n} [${d.type}] user="${d.userAnswer}" vs key="${d.correctAnswer}" -> ${d.ok ? 'CORRECT' : 'WRONG'}`);
}
console.log('\nverify done.');
