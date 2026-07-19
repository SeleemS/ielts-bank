// Applies the profile-mirror repair and verifies the live invariant.
//
//   node scripts/apply-profile-mirror-guard.mjs
//   node scripts/apply-profile-mirror-guard.mjs --dry-run

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260719203000_protect_auth_profile_mirror.sql'
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

const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query('begin');
  await client.query(readFileSync(MIGRATION, 'utf8'));

  const { rows: integrityRows } = await client.query(`
    select
      (select count(*)::int
         from auth.users auth_user
         left join public.users profile on profile.id = auth_user.id
        where profile.id is null) as missing_profiles,
      (select count(*)::int
         from public.users profile
         left join public.user_quotas quota on quota.user_id = profile.id
        where quota.user_id is null) as missing_quotas
  `);
  const integrity = integrityRows[0];
  if (integrity.missing_profiles !== 0 || integrity.missing_quotas !== 0) {
    throw new Error('profile mirror or quota backfill is incomplete');
  }

  const { rows: triggerRows } = await client.query(`
    select trigger.tgenabled as enabled,
           function.prosecdef as security_definer,
           function.proconfig as function_config
      from pg_trigger trigger
      join pg_class relation on relation.oid = trigger.tgrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      join pg_proc function on function.oid = trigger.tgfoid
     where namespace.nspname = 'public'
       and relation.relname = 'users'
       and trigger.tgname = 'users_prevent_orphan_delete'
       and not trigger.tgisinternal
  `);
  const guard = triggerRows[0];
  if (
    triggerRows.length !== 1 ||
    guard.enabled !== 'O' ||
    !guard.security_definer ||
    !guard.function_config?.includes('search_path=""')
  ) {
    throw new Error('profile-delete guard metadata is invalid');
  }

  await client.query(dryRun ? 'rollback' : 'commit');
  console.log(JSON.stringify({
    migrationApplied: !dryRun,
    dryRun,
    missingProfiles: integrity.missing_profiles,
    missingQuotas: integrity.missing_quotas,
    deleteGuardEnabled: true,
  }));
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error('profile mirror migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
