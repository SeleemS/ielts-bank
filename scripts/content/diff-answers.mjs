// Diff independent blind answers against stored keys; flag disagreements for
// manual adjudication. Short-answer matching is lenient (substring/variant).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRATCH = process.argv[2];
const keys = JSON.parse(readFileSync(join(__dirname, 'answer-keys.json'), 'utf8'));

const ans = {};
for (const f of ['environment', 'history', 'science', 'social']) {
  Object.assign(ans, JSON.parse(readFileSync(join(SCRATCH, `ans-${f}.json`), 'utf8')));
}

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/^the\s+/, '').replace(/[.]$/, '');
let agree = 0;
const flags = [];
for (const [k, v] of Object.entries(keys)) {
  const [kind, ...rest] = v.split(':');
  const key = rest.join(':');
  const got = ans[k];
  if (got === undefined) { flags.push(`${k}: NO INDEPENDENT ANSWER (key=${v})`); continue; }
  let ok;
  if (kind === 'MC') {
    ok = norm(got).toUpperCase().startsWith(key.toUpperCase()) || norm(got) === norm(key);
    ok = norm(got).replace(/[^a-d]/gi, '').toUpperCase() === key.toUpperCase();
  } else if (kind === 'SA') {
    const a = norm(got), b = norm(key);
    ok = a === b || a.includes(b) || b.includes(a);
  } else {
    ok = norm(got) === norm(key);
  }
  if (ok) agree++;
  else flags.push(`${k}  KEY=[${v}]  BLIND=[${got}]`);
}

console.log(`agreements: ${agree}/${Object.keys(keys).length}`);
console.log(`disagreements: ${flags.length}`);
for (const f of flags) console.log('  * ' + f);
