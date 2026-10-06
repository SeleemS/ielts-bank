// Targeted migration only; never runs pending pricing/free-allowance migrations.
// Default is a rolled-back rehearsal. --apply commits only the reviewed schema,
// after synthetic data, access-control, replay, and deletion checks pass.
import fs from 'node:fs';
import pg from 'pg';
import assert from 'node:assert/strict';
const env = { ...process.env };
for (const line of fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const db = new pg.Client({ connectionString: env.SUPABASE_DB_SESSION_URL || env.SUPABASE_DB_URL, connectionTimeoutMillis: 15000 });
const migration = fs.readFileSync(new URL('../supabase/migrations/20261006104030_durable_writing_reports.sql', import.meta.url), 'utf8');
const apply = process.argv.includes('--apply');
await db.connect();
try {
  await db.query('begin');
  await db.query("set local lock_timeout='5s'; set local statement_timeout='30s'");
  const present = (await db.query("select to_regclass('public.writing_reports') is not null present")).rows[0].present;
  if (!present) await db.query(migration);
  const permissions = (await db.query(`select
    (select relrowsecurity from pg_class where oid='public.writing_reports'::regclass) rls,
    has_table_privilege('anon','public.writing_reports','SELECT,INSERT,UPDATE,DELETE') anon,
    has_table_privilege('authenticated','public.writing_reports','SELECT,INSERT,UPDATE,DELETE') authenticated,
    has_table_privilege('service_role','public.writing_reports','SELECT') service_read,
    has_table_privilege('service_role','public.writing_reports','INSERT') service_insert,
    has_table_privilege('service_role','public.writing_reports','UPDATE') service_update,
    (select count(*)::int from pg_policies where schemaname='public' and tablename='writing_reports') policies`)).rows[0];
  assert.deepEqual(permissions, {rls:true,anon:false,authenticated:false,service_read:true,service_insert:true,service_update:true,policies:0});
  await db.query('savepoint synthetic_qa');
  const uid = (await db.query('select gen_random_uuid() id')).rows[0].id;
  await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{}')", [uid, `writing-report-qa-${uid}@example.invalid`]);
  await db.query('insert into public.users(id) values($1) on conflict do nothing', [uid]);
  const attempt = (await db.query("insert into public.attempts(user_id,skill,responses) values($1,'writing','{\"essay\":\"synthetic\"}') returning id", [uid])).rows[0].id;
  await db.query("insert into public.writing_reports(attempt_id,user_id,task,task_type,result) values($1,$2,2,'task2','{\"summary\":\"synthetic private feedback\"}')",[attempt,uid]);
  for (const role of ['anon','authenticated']) {
    await db.query('savepoint permission_probe');
    await db.query(`set local role ${role}`);
    await assert.rejects(db.query('select result from public.writing_reports where attempt_id=$1',[attempt]), {code:'42501'});
    await db.query('rollback to savepoint permission_probe');
  }
  await db.query('set local role service_role');
  const read = await db.query('select result from public.writing_reports where attempt_id=$1 and user_id=$2',[attempt,uid]);
  assert.equal(read.rows[0].result.summary,'synthetic private feedback');
  assert.equal((await db.query('select result from public.writing_reports where attempt_id=$1 and user_id=gen_random_uuid()',[attempt])).rowCount,0);
  assert.equal((await db.query('update public.writing_reports set unlocked_at=now() where attempt_id=$1 and unlocked_at is null',[attempt])).rowCount,1);
  assert.equal((await db.query('update public.writing_reports set unlocked_at=now() where attempt_id=$1 and unlocked_at is null',[attempt])).rowCount,0);
  await db.query('reset role');
  await db.query('delete from auth.users where id=$1',[uid]);
  assert.equal((await db.query('select 1 from public.writing_reports where attempt_id=$1',[attempt])).rowCount,0);
  await db.query('rollback to savepoint synthetic_qa');
  if (apply && !present) {
    const history = (await db.query("select to_regclass('supabase_migrations.schema_migrations') is not null present")).rows[0].present;
    if (history) await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3) on conflict(version) do nothing', ['20261006104030','durable_writing_reports',[migration]]);
    await db.query("notify pgrst, 'reload schema'");
  }
  await db.query(apply ? 'commit' : 'rollback');
  console.log(JSON.stringify({status:apply?'applied and verified':'verified and rolled back',alreadyPresent:present,checks:['RLS','no public grants','actual anon/authenticated SELECT denied','service role access','owner predicate','replay','account deletion cascade','all QA data rolled back']}));
} catch (error) { await db.query('rollback'); throw error; } finally { await db.end(); }
