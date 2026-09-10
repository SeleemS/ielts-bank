-- Run in a disposable PostgreSQL database after fixture auth.users and migration.
-- Never run against production; intentionally exercises account mutation.
do $$
declare
  a uuid := '00000000-0000-4000-8000-000000000001';
  b uuid := '00000000-0000-4000-8000-000000000002';
  c uuid := '00000000-0000-4000-8000-000000000003';
begin
  if public.canonical_auth_mailbox(' User+tag@Example.TEST ') <> 'user@example.test'
    or public.canonical_auth_mailbox('user.name+tag@example.test') <> 'user.name@example.test'
    or public.canonical_auth_mailbox('user@gmail.com') = public.canonical_auth_mailbox('user@googlemail.com')
    or public.canonical_auth_mailbox(null) is not null then
    raise exception 'canonicalization failed';
  end if;
  insert into auth.users(id,email) values(a,'Audit+first@example.test');
  if (select email from auth.users where id=a) <> 'Audit+first@example.test' then
    raise exception 'delivery email was rewritten';
  end if;
  begin
    insert into auth.users(id,email) values(b,'audit@example.test');
    raise exception 'base signup after alias was accepted';
  exception when unique_violation then null; end;
  begin
    insert into auth.users(id,email) values(b,'AUDIT+second@EXAMPLE.TEST');
    raise exception 'second alias accepted';
  exception when unique_violation then null; end;
  insert into auth.users(id,email) values(b,'audit.dot@example.test');
  insert into auth.users(id,email) values(c,'audit@different.test');
  begin
    update auth.users set email='audit+switch@example.test' where id=b;
    raise exception 'email-change bypass accepted';
  exception when unique_violation then null; end;
  update auth.users set email='Audit+changed@example.test' where id=a;
  update auth.users set email=null where id=c;
  if exists(select 1 from public.auth_mailbox_claims where mailbox='audit@different.test') then
    raise exception 'email removal leaked claim';
  end if;
  update auth.users set email='audit@different.test' where id=c;
  delete from auth.users where id=a;
  insert into auth.users(id,email) values(a,'audit+after-delete@example.test');
  if public.before_user_created_mailbox_guard('{"user":{"email":"audit+new@example.test"}}')->'error'->>'http_code' <> '422' then
    raise exception 'friendly precheck failed';
  end if;
  if public.before_user_created_mailbox_guard('{"user":{"email":"brandnew@example.test"}}') <> '{}'::jsonb then
    raise exception 'new mailbox denied by precheck';
  end if;
  if has_table_privilege('anon','public.auth_mailbox_claims','SELECT')
    or has_table_privilege('authenticated','public.auth_mailbox_claims','SELECT')
    or has_function_privilege('anon','public.before_user_created_mailbox_guard(jsonb)','EXECUTE')
    or not has_function_privilege('supabase_auth_admin','public.before_user_created_mailbox_guard(jsonb)','EXECUTE') then
    raise exception 'claim permissions unsafe';
  end if;
end;
$$;
