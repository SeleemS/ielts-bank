// Run only against a NEW disposable local Postgres database. No production use.
// TEST_DATABASE_URL=postgres://.../ielts_auth_guard_test_... node scripts/test-auth-mailbox-claims.mjs
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import pg from 'pg';
const url = new URL(process.env.TEST_DATABASE_URL || 'postgres://localhost/invalid');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
assert.ok(url.pathname.startsWith('/ielts_auth_guard_test_'));
const client = new pg.Client({ connectionString: url.href });
await client.connect();
const contenders = [];
try {
  assert.equal((await client.query("select count(*)::int as n from information_schema.tables where table_schema in ('public','auth')")).rows[0].n, 0, 'database must be empty');
  for (const role of ['anon', 'authenticated', 'service_role', 'supabase_auth_admin']) {
    await client.query(`do $$ begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role}; end if; end $$;`);
  }
  await client.query('create schema auth; create table auth.users (id uuid primary key, email text, encrypted_password text, email_confirmed_at timestamptz)');
  const historical = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'];
  await client.query("insert into auth.users(id,email) values ($1,'legacy@example.test'),($2,'legacy+old@example.test')", historical);
  await client.query('BEGIN');
  await client.query(await fs.readFile(new URL('../supabase/migrations/20260911010000_auth_mailbox_claims.sql', import.meta.url), 'utf8'));
  await client.query('COMMIT');
  assert.equal((await client.query("select cardinality(user_ids) as n from public.auth_mailbox_claims where mailbox='legacy@example.test'")).rows[0].n, 2);
  await client.query("update auth.users set encrypted_password='synthetic-new-password', email_confirmed_at=now() where id=any($1::uuid[])", [historical]);
  await client.query("update auth.users set email='legacy+renamed@example.test' where id=$1", [historical[1]]);
  await assert.rejects(client.query("insert into auth.users values(gen_random_uuid(),'legacy+new@example.test')"), { code: '23505' });
  await client.query('delete from auth.users where id=$1', [historical[0]]);
  await assert.rejects(client.query("insert into auth.users values(gen_random_uuid(),'legacy+new@example.test')"), { code: '23505' });
  await client.query('delete from auth.users where id=$1', [historical[1]]);
  await client.query("insert into auth.users values(gen_random_uuid(),'legacy+new@example.test')");
  await client.query(await fs.readFile(new URL('../supabase/tests/auth_mailbox_claims.sql', import.meta.url), 'utf8'));
  await client.query('grant usage on schema auth to supabase_auth_admin; grant select, insert, update, delete on auth.users to supabase_auth_admin');
  await client.query('SET ROLE supabase_auth_admin');
  await client.query("insert into auth.users values(gen_random_uuid(),'auth-role@example.test')");
  assert.equal((await client.query("select public.before_user_created_mailbox_guard('{\"user\":{\"email\":\"auth-role+duplicate@example.test\"}}') as result")).rows[0].result.error.http_code, 422);
  await assert.rejects(client.query("insert into auth.users values(gen_random_uuid(),'auth-role+duplicate@example.test')"), { code: '23505' });
  await client.query('RESET ROLE');
  await client.query('BEGIN');
  await client.query("insert into auth.users values(gen_random_uuid(),'rollback@example.test')");
  await client.query('ROLLBACK');
  await client.query("insert into auth.users values(gen_random_uuid(),'rollback+retry@example.test')");
  for (let i = 0; i < 2; i++) { const c = new pg.Client({connectionString:url.href}); await c.connect(); contenders.push(c); }
  const [first, second] = contenders;
  await first.query('BEGIN');
  await first.query("insert into auth.users values(gen_random_uuid(),'race+first@example.test')");
  const losingSignup = second.query("insert into auth.users values(gen_random_uuid(),'race+second@example.test')").then(() => null, error => error.code);
  await new Promise(resolve => setTimeout(resolve, 100));
  await first.query('COMMIT');
  assert.equal(await losingSignup, '23505');
  assert.equal((await client.query("select count(*)::int as n from auth.users where email like 'race+%'")).rows[0].n, 1);
  // A concurrent claimant must succeed when the first transaction aborts.
  await first.query('BEGIN');
  await first.query("insert into auth.users values(gen_random_uuid(),'race-abort+first@example.test')");
  const retrySignup = second.query("insert into auth.users values(gen_random_uuid(),'race-abort+second@example.test')");
  await new Promise(resolve => setTimeout(resolve, 100));
  await first.query('ROLLBACK');
  await retrySignup;
  console.log('PASS: SQL scenarios, legacy duplicate bootstrap/recovery/deletion, rollback, concurrent commit and abort.');
} finally {
  await Promise.all(contenders.map(c => c.end()));
  await client.end();
}
