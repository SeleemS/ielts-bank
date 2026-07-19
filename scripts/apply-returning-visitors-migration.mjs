// scripts/apply-returning-visitors-migration.mjs
// Applies supabase/migrations/20260719050000_returning_visitor_stats.sql to
// the live DB over the session pooler (same pattern as
// apply-premium-only-migration.mjs) and smoke-tests the new function against
// yesterday's window, cross-checking the visitor total.
//
//   node scripts/apply-returning-visitors-migration.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadEnvLocal() {
  const raw = readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[m[1]] = val;
  }
  return env;
}

const env = loadEnvLocal();
const url = env.SUPABASE_DB_SESSION_URL || env.SUPABASE_DB_URL;
if (!url) {
  console.error('SUPABASE_DB_SESSION_URL missing from .env.local');
  process.exit(1);
}

const sql = readFileSync(
  path.join(ROOT, 'supabase/migrations/20260719050000_returning_visitor_stats.sql'),
  'utf8'
);

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('begin');
  await client.query(sql);
  await client.query('commit');
  console.log('migration applied');

  // Smoke test on yesterday's UTC day; cross-check the distinct-visitor count
  // the same way the daily report counts visitors.
  const start = new Date(Date.now() - 864e5);
  const dayStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 864e5);

  const rpc = await client.query('select * from public.returning_visitor_stats($1, $2)', [
    dayStart.toISOString(),
    dayEnd.toISOString(),
  ]);
  const manual = await client.query(
    `select count(distinct coalesce(user_id::text, anon_id))::bigint as visitors
     from public.activity_events where created_at >= $1 and created_at < $2`,
    [dayStart.toISOString(), dayEnd.toISOString()]
  );
  const stats = rpc.rows[0];
  console.log('yesterday:', JSON.stringify(stats), '| manual distinct visitors:', manual.rows[0].visitors);
  if (String(stats.visitors) !== String(manual.rows[0].visitors)) {
    throw new Error('visitor count mismatch between RPC and manual query');
  }
  if (Number(stats.returning_visitors) > Number(stats.visitors)) {
    throw new Error('returning > visitors — check the RPC logic');
  }
  console.log('smoke test passed');
} catch (e) {
  try {
    await client.query('rollback');
  } catch {}
  console.error('failed:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
