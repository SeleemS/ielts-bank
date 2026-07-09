// scripts/apply-rate-limits.mjs
// Applies supabase/migrations/0008_rate_limits.sql to the live DB over the
// Postgres session pooler (SUPABASE_DB_SESSION_URL) and smoke-tests the
// check_rate_limit() function.
//
//   node scripts/apply-rate-limits.mjs
//
// Next.js auto-loads .env.local for the app, but a standalone node script does
// not, so we parse it here (no dotenv dependency).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadEnvLocal() {
  const raw = readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}

async function main() {
  loadEnvLocal();
  const connectionString = process.env.SUPABASE_DB_SESSION_URL;
  if (!connectionString) throw new Error('SUPABASE_DB_SESSION_URL missing');

  const sql = readFileSync(
    path.join(ROOT, 'supabase/migrations/0008_rate_limits.sql'),
    'utf8'
  );

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('connected to db');

  await client.query(sql);
  console.log('migration 0008 applied');

  // Smoke test: window 3600s, max 3. First 3 -> true, 4th -> false.
  const id = `test-${Date.now()}`;
  const results = [];
  for (let i = 0; i < 5; i++) {
    const r = await client.query(
      'select public.check_rate_limit($1,$2,$3,$4) as allowed',
      ['test-bucket', id, 3600, 3]
    );
    results.push(r.rows[0].allowed);
  }
  console.log('check_rate_limit(max=3) sequence:', results.join(', '));
  const ok =
    JSON.stringify(results) === JSON.stringify([true, true, true, false, false]);
  console.log(ok ? 'PASS: limiter behaves correctly' : 'FAIL: unexpected sequence');

  // Cleanup the test rows.
  await client.query('delete from public.rate_limits where identifier = $1', [id]);

  await client.end();
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
