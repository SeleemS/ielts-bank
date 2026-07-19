// Applies and verifies the remaining SECURITY DEFINER search-path hardening.
//
//   node scripts/apply-definer-path-hardening.mjs
//   node scripts/apply-definer-path-hardening.mjs --dry-run

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260719204100_harden_definer_search_paths.sql'
);
const dryRun = process.argv.includes('--dry-run');

function loadEnvLocal() {
  const raw = readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

const env = loadEnvLocal();
const connectionString = env.SUPABASE_DB_SESSION_URL || env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('SUPABASE_DB_SESSION_URL missing from .env.local');
  process.exit(1);
}

const expected = new Set([
  'check_rate_limit(p_bucket text, p_identifier text, p_window_seconds integer, p_max integer)',
  'handle_new_user()',
  'handle_user_update()',
  'record_login(p_user_id uuid, p_country text, p_source text, p_referrer text, p_landing text, p_utm jsonb)',
]);

const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query('begin');
  await client.query(readFileSync(MIGRATION, 'utf8'));

  const { rows } = await client.query(`
    select function.proname as name,
           pg_get_function_identity_arguments(function.oid) as arguments,
           function.proconfig as config
      from pg_proc function
      join pg_namespace namespace on namespace.oid = function.pronamespace
     where namespace.nspname = 'public'
       and function.prosecdef
     order by function.proname, arguments
  `);
  const actual = new Map(
    rows.map((row) => [`${row.name}(${row.arguments})`, row.config || []])
  );
  for (const signature of expected) {
    if (!actual.get(signature)?.includes('search_path=""')) {
      throw new Error(`function search path is not empty: ${signature}`);
    }
  }
  const mutable = rows.filter((row) => row.config?.includes('search_path=public'));
  if (mutable.length) {
    throw new Error('a public SECURITY DEFINER function still uses search_path=public');
  }

  await client.query(dryRun ? 'rollback' : 'commit');
  console.log(JSON.stringify({
    migrationApplied: !dryRun,
    dryRun,
    hardenedFunctions: expected.size,
    mutableDefinerPaths: 0,
  }));
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error('definer search-path migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
