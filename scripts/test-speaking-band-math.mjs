// scripts/test-speaking-band-math.mjs
// Unit test for the speaking overall-band rule: overallBand = average of the
// three criterion bands, rounded to the NEAREST 0.5. Mirrors roundHalfBand()
// in pages/api/score/speaking.js. Run: node scripts/test-speaking-band-math.mjs
function roundHalfBand(a, b, c) {
  const avg = (a + b + c) / 3;
  return Math.round(avg * 2) / 2;
}

const cases = [
  // [fc, lr, gr, expected]
  [6, 6, 6, 6],
  [6, 6.5, 7, 6.5], // avg 6.5 exact
  [7, 6.5, 6, 6.5], // avg 6.5
  [6, 6, 7, 6.5], // avg 6.333 -> 6.5
  [6, 6, 6.5, 6], // avg 6.166 -> 6 (rounds down)
  [5, 5, 6, 5.5], // avg 5.333 -> 5.5
  [7, 7, 8, 7.5], // avg 7.333 -> 7.5
  [8, 8, 9, 8.5], // avg 8.333 -> 8.5
  [9, 9, 9, 9],
  [4, 4, 4, 4],
  [5.5, 6, 6, 6], // avg 5.833 -> 6
  [6, 6, 6.5, 6], // avg 6.166 -> 6
];

let pass = 0;
let fail = 0;
for (const [a, b, c, expected] of cases) {
  const got = roundHalfBand(a, b, c);
  const ok = got === expected;
  if (ok) pass += 1;
  else fail += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  avg(${a},${b},${c})=${((a + b + c) / 3).toFixed(3)} -> ${got} (expected ${expected})`
  );
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
