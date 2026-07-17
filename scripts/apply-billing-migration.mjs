// scripts/apply-billing-migration.mjs
// Applies supabase/migrations/20260717130000_billing_and_premium_limits.sql to
// the live DB over the session pooler (same pattern as apply-rate-limits.mjs)
// and smoke-tests the new functions/columns.
//
//   node scripts/apply-billing-migration.mjs

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
  path.join(ROOT, 'supabase/migrations/20260717130000_billing_and_premium_limits.sql'),
  'utf8'
);

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('begin');
  await client.query(sql);
  await client.query('commit');
  console.log('migration applied');

  // Smoke tests -------------------------------------------------------------
  const cols = await client.query(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'users'
      and column_name in ('plan','plan_status','plan_renews_at','plan_started_at','stripe_customer_id','stripe_subscription_id')
    order by column_name`);
  console.log('users billing columns:', cols.rows.map((r) => r.column_name).join(', '));

  const qcols = await client.query(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'user_quotas'
      and column_name in ('writing_scores_today','speaking_scores_today','daily_counters_date','realtime_seconds_quota','realtime_seconds_remaining','realtime_period_resets_at')
    order by column_name`);
  console.log('user_quotas new columns:', qcols.rows.map((r) => r.column_name).join(', '));

  const fns = await client.query(`
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('consume_ai_score','consume_realtime_seconds')
    order by p.proname, args`);
  console.log('functions:', fns.rows.map((r) => `${r.proname}(${r.args})`).join(' | '));

  const trg = await client.query(`
    select tgname from pg_trigger where tgname = 'users_protect_billing'`);
  console.log('billing-guard trigger present:', trg.rows.length === 1);
} catch (e) {
  await client.query('rollback').catch(() => {});
  console.error('migration failed:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
