// scripts/apply-user-prefs-migration.mjs
// Applies supabase/migrations/20260717140000_user_prefs.sql to the live DB
// over the session pooler (same pattern as apply-billing-migration.mjs) and
// smoke-tests the new column.
//
//   node scripts/apply-user-prefs-migration.mjs

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
  path.join(ROOT, 'supabase/migrations/20260717140000_user_prefs.sql'),
  'utf8'
);

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('begin');
  await client.query(sql);
  await client.query('commit');
  console.log('migration applied');

  const check = await client.query(
    `select column_name, data_type, column_default
       from information_schema.columns
      where table_schema = 'public' and table_name = 'users' and column_name = 'prefs'`
  );
  console.log('verify users.prefs:', check.rows);
} catch (e) {
  await client.query('rollback').catch(() => {});
  throw e;
} finally {
  await client.end();
}
