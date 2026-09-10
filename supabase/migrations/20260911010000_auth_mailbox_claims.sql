-- One new account per case-insensitive, plus-addressed mailbox. Preserve the
-- actual delivery address; do not fold dots or rewrite domains. Existing
-- duplicate accounts are grandfathered and keep login/recovery access.
-- Apply in ONE transaction (normal Supabase migrations do this). The table lock
-- closes the bootstrap/write race; keep this migration short.
lock table auth.users in share row exclusive mode;

create or replace function public.canonical_auth_mailbox(email text)
returns text language sql immutable strict set search_path = ''
as $$
  select case when strpos(btrim(email), '@') > 1 then
    lower(split_part(split_part(btrim(email), '@', 1), '+', 1))
      || '@' || lower(split_part(btrim(email), '@', 2))
    else null end
$$;

create table public.auth_mailbox_claims (
  mailbox text primary key,
  user_ids uuid[] not null,
  constraint auth_mailbox_claims_nonempty check (cardinality(user_ids) > 0)
);
alter table public.auth_mailbox_claims enable row level security;
revoke all on public.auth_mailbox_claims from public, anon, authenticated, service_role;

insert into public.auth_mailbox_claims (mailbox, user_ids)
select public.canonical_auth_mailbox(email), array_agg(id order by id)
from auth.users
where public.canonical_auth_mailbox(email) is not null
-- Includes unconfirmed users and every existing duplicate; no account changes.
group by public.canonical_auth_mailbox(email);

create or replace function public.guard_auth_mailbox_claim()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  old_mailbox text;
  new_mailbox text;
  claimed text;
begin
  if tg_op <> 'INSERT' then
    old_mailbox := public.canonical_auth_mailbox(old.email);
  end if;
  if tg_op <> 'DELETE' then
    new_mailbox := public.canonical_auth_mailbox(new.email);
  end if;
  -- Password/token/profile updates and same-mailbox email edits must never
  -- invalidate grandfathered accounts or interfere with confirmation/recovery.
  if tg_op = 'UPDATE' and new_mailbox is not distinct from old_mailbox then
    return new;
  end if;

  if new_mailbox is not null then
    insert into public.auth_mailbox_claims as claims (mailbox, user_ids)
    values (new_mailbox, array[new.id])
    on conflict (mailbox) do update set user_ids = claims.user_ids
      where new.id = any(claims.user_ids)
    returning mailbox into claimed;
    -- Unique-index conflict arbitration waits for concurrent transactions.
    -- A rolled-back signup releases its claim automatically.
    if claimed is null then
      raise exception 'An account for this mailbox already exists. Sign in or reset your password.'
        using errcode = '23505', constraint = 'auth_mailbox_claims_pkey';
    end if;
  end if;

  if old_mailbox is not null then
    -- Serialize departure against signup and other grandfathered departures.
    perform 1 from public.auth_mailbox_claims where mailbox = old_mailbox for update;
    delete from public.auth_mailbox_claims
      where mailbox = old_mailbox and user_ids = array[old.id];
    update public.auth_mailbox_claims
      set user_ids = array_remove(user_ids, old.id)
      where mailbox = old_mailbox and old.id = any(user_ids);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_auth_mailbox_claim() from public, anon, authenticated, service_role;
revoke all on function public.canonical_auth_mailbox(text) from public, anon, authenticated, service_role;

create trigger auth_mailbox_claim_guard
before insert or update of email or delete on auth.users
for each row execute function public.guard_auth_mailbox_claim();

-- Optional friendly precheck: enable this as the Before User Created Postgres
-- hook in Supabase Auth after migration. The trigger remains the race-safe
-- enforcement point. Hook only reads claims and never changes email delivery.
create or replace function public.before_user_created_mailbox_guard(event jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.auth_mailbox_claims
    where mailbox = public.canonical_auth_mailbox(event->'user'->>'email')
  ) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 422,
      'message', 'An account for this mailbox already exists. Sign in or reset your password.'
    ));
  end if;
  return '{}'::jsonb;
end;
$$;
revoke all on function public.before_user_created_mailbox_guard(jsonb) from public, anon, authenticated, service_role;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.before_user_created_mailbox_guard(jsonb) to supabase_auth_admin;
