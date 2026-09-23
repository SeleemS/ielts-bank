// scripts/apply-weekly-free-score.mjs
// Applies supabase/migrations/20260923120000_weekly_free_ai_score.sql
// (consume_ai_score v10: one free Writing + one free Speaking AI sample per
// rolling 7 days) to the live DB over the session pooler, then verifies it.
//
//   node scripts/apply-weekly-free-score.mjs             # apply + verify
//   node scripts/apply-weekly-free-score.mjs --dry-run   # apply + verify, then ROLL BACK
//   node scripts/apply-weekly-free-score.mjs --rollback  # restore v9 (lifetime samples)
//
// Everything runs in ONE transaction. Before COMMIT the behavioural checks in
// supabase/tests/weekly_free_ai_score.sql run inside a SAVEPOINT (synthetic
// @example.invalid QA users only) and are rolled back to that savepoint, so
// no QA row survives and a failing check aborts the whole apply — the live
// function is never left half-changed. Only the function body changes; no
// table or row is altered. Needs SUPABASE_DB_SESSION_URL in .env.local.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const MIGRATION = 'supabase/migrations/20260923120000_weekly_free_ai_score.sql';
const ROLLBACK = 'supabase/rollbacks/20260923120000_weekly_free_ai_score.down.sql';
const BEHAVIOUR_TEST = 'supabase/tests/weekly_free_ai_score.sql';

const args = new Set(process.argv.slice(2));
const rollback = args.has('--rollback');
const dryRun = args.has('--dry-run');

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
const url = env.SUPABASE_DB_SESSION_URL;
if (!url) {
  console.error('SUPABASE_DB_SESSION_URL missing from .env.local');
  process.exit(1);
}

const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

async function functionState(client) {
  const fns = await client.query(
    `select p.proname, pg_get_function_identity_arguments(p.oid) as args,
            d.description, p.prosecdef, p.proconfig
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       left join pg_description d on d.objoid = p.oid and d.classoid = 'pg_proc'::regclass
      where n.nspname = 'public'
        and p.proname in ('consume_ai_score', 'refund_ai_score')`
  );
  const consume = fns.rows.filter(
    (row) => row.proname === 'consume_ai_score' && row.args === 'p_uid uuid, p_skill text'
  );
  const refund = fns.rows.filter((row) => row.proname === 'refund_ai_score');
  const grants = await client.query(
    `select has_function_privilege('service_role', 'public.consume_ai_score(uuid,text)', 'EXECUTE') as service,
            has_function_privilege('authenticated', 'public.consume_ai_score(uuid,text)', 'EXECUTE') as authed,
            has_function_privilege('anon', 'public.consume_ai_score(uuid,text)', 'EXECUTE') as anon`
  );
  return {
    consumeVersion: /\bv(\d+)\b/.exec(consume[0]?.description || '')?.[1] || null,
    consumeDefiner: consume[0]?.prosecdef === true,
    consumeSearchPath: (consume[0]?.proconfig || []).includes('search_path=""'),
    refundOverloads: refund.length,
    refundV4: refund.length === 1 && /p_referral/.test(refund[0].args) && /v4/.test(refund[0].description || ''),
    grants: grants.rows[0],
  };
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  // Fail fast rather than queue behind a long-held lock on user_quotas.
  await client.query('begin');
  await client.query(`set local lock_timeout = '5s'`);
  await client.query(`set local statement_timeout = '60s'`);

  const before = await functionState(client);
  console.log(`before: consume_ai_score v${before.consumeVersion}, refund overloads ${before.refundOverloads}`);

  if (rollback) {
    await client.query(read(ROLLBACK));
  } else {
    if (before.consumeVersion !== '9' && before.consumeVersion !== '10') {
      throw new Error(
        `expected consume_ai_score v9 (or v10 on re-run) in prod, found v${before.consumeVersion}; ` +
          'someone changed it since this migration was written — stop and re-diff'
      );
    }
    await client.query(read(MIGRATION));
    // Behavioural checks against the NEW function, then throw their rows away.
    await client.query('savepoint weekly_free_score_qa');
    await client.query(read(BEHAVIOUR_TEST));
    await client.query('rollback to savepoint weekly_free_score_qa');
    console.log('behavioural checks passed (QA rows rolled back)');
  }

  const after = await functionState(client);
  const wantVersion = rollback ? '9' : '10';
  const ok =
    after.consumeVersion === wantVersion &&
    after.consumeDefiner &&
    after.consumeSearchPath &&
    after.refundV4 &&
    after.grants.service === true &&
    after.grants.authed === false &&
    after.grants.anon === false;
  if (!ok) {
    console.error('VERIFY FAILED', after);
    throw new Error('verification failed');
  }

  if (dryRun) {
    await client.query('rollback');
    console.log(`DRY RUN OK: would install consume_ai_score v${wantVersion}; rolled back, nothing changed.`);
  } else {
    await client.query('commit');
    console.log(
      rollback
        ? 'rolled back + verified: consume_ai_score v9 (lifetime free samples), refund v4 unchanged'
        : 'applied + verified: consume_ai_score v10 (weekly free samples), refund v4 unchanged'
    );
  }
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error(`${rollback ? 'rollback' : 'migration'} failed (nothing committed):`, error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
