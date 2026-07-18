// scripts/apply-premium-only-migration.mjs
// Applies supabase/migrations/20260718120000_premium_only_ai_scoring.sql to
// the live DB over the session pooler (same pattern as
// apply-billing-migration.mjs) and smoke-tests the updated function.
//
//   node scripts/apply-premium-only-migration.mjs

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
  path.join(ROOT, 'supabase/migrations/20260718120000_premium_only_ai_scoring.sql'),
  'utf8'
);

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('begin');
  await client.query(sql);
  await client.query('commit');
  console.log('migration applied');

  const fn = await client.query(`
    select obj_description(p.oid) as comment
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'consume_ai_score'
      and pg_get_function_identity_arguments(p.oid) = 'p_uid uuid, p_skill text'`);
  console.log('consume_ai_score comment:', fn.rows[0]?.comment || '(missing)');
  if (!/Premium-only/.test(fn.rows[0]?.comment || '')) {
    throw new Error('function comment does not look like v5 — check the migration ran');
  }
} catch (e) {
  await client.query('rollback').catch(() => {});
  console.error('migration failed:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
