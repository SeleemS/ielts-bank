-- Per-passage average band trust signal for Reading, Listening, and Writing.
--
-- Before a passage has a scored submission, average_user_band exposes a
-- deterministic, difficulty-correlated estimate. As soon as the first valid
-- attempt is stored, the generated value switches to the real aggregate.
-- band_score_sum + band_submission_count avoid cumulative rounding drift.

alter table public.passages
  add column if not exists seed_average_band numeric(2,1),
  add column if not exists band_score_sum numeric(12,1) not null default 0,
  add column if not exists band_submission_count bigint not null default 0;

-- Give every in-scope passage one of three half-band estimates inside the
-- range for its editorial difficulty. md5(id) makes the distribution stable
-- across deploys while still varying from passage to passage.
update public.passages
set seed_average_band =
  case difficulty
    when 'easy' then 6.5
    when 'hard' then 4.5
    else 5.5
  end
  + ((get_byte(decode(md5(id::text), 'hex'), 0) % 3)::numeric * 0.5)
where skill in ('reading', 'listening', 'writing')
  and seed_average_band is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'passages_seed_average_band_range'
      and conrelid = 'public.passages'::regclass
  ) then
    alter table public.passages
      add constraint passages_seed_average_band_range
      check (seed_average_band is null or seed_average_band between 0 and 9);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'passages_band_score_sum_nonnegative'
      and conrelid = 'public.passages'::regclass
  ) then
    alter table public.passages
      add constraint passages_band_score_sum_nonnegative
      check (band_score_sum >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'passages_band_submission_count_nonnegative'
      and conrelid = 'public.passages'::regclass
  ) then
    alter table public.passages
      add constraint passages_band_submission_count_nonnegative
      check (band_submission_count >= 0);
  end if;
end
$$;

-- Generated and STORED: the Data API reads one value, but its provenance is
-- explicit through band_submission_count (zero means estimated).
alter table public.passages
  add column if not exists average_user_band numeric(4,2)
  generated always as (
    case
      when band_submission_count > 0
        then round(band_score_sum / band_submission_count::numeric, 2)
      else seed_average_band
    end
  ) stored;

-- Preserve any scored submissions that predate this migration. A passage with
-- existing data should never fall back to an estimate.
with existing_band_stats as (
  select
    attempt.passage_id,
    sum(attempt.band)::numeric(12,1) as band_score_sum,
    count(*)::bigint as band_submission_count
  from public.attempts attempt
  inner join public.passages passage on passage.id = attempt.passage_id
  where attempt.passage_id is not null
    and attempt.band between 0 and 9
    and attempt.skill in ('reading', 'listening', 'writing')
    and passage.skill = attempt.skill
  group by attempt.passage_id
)
update public.passages passage
set
  band_score_sum = stats.band_score_sum,
  band_submission_count = stats.band_submission_count
from existing_band_stats stats
where passage.id = stats.passage_id;

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.set_passage_seed_average_band()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.skill in ('reading', 'listening', 'writing')
    and (
      new.seed_average_band is null
      or (
        tg_op = 'UPDATE'
        and new.band_submission_count = 0
        and (
          new.difficulty is distinct from old.difficulty
          or new.skill is distinct from old.skill
        )
      )
    ) then
    new.seed_average_band :=
      case new.difficulty
        when 'easy' then 6.5
        when 'hard' then 4.5
        else 5.5
      end
      + (
        (
          pg_catalog.get_byte(
            pg_catalog.decode(pg_catalog.md5(new.id::text), 'hex'),
            0
          ) % 3
        )::numeric * 0.5
      );
  end if;

  return new;
end;
$$;

revoke execute on function private.set_passage_seed_average_band()
  from public, anon, authenticated;
grant execute on function private.set_passage_seed_average_band()
  to service_role;

drop trigger if exists passages_set_seed_average_band on public.passages;
create trigger passages_set_seed_average_band
before insert or update of difficulty, skill on public.passages
for each row execute function private.set_passage_seed_average_band();

create or replace function private.sync_passage_average_band()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_passage_id uuid;
  target_skill public.skill;
  target_band numeric;
begin
  if tg_op = 'DELETE' then
    target_passage_id := old.passage_id;
    target_skill := old.skill;
    target_band := old.band;
  else
    target_passage_id := new.passage_id;
    target_skill := new.skill;
    target_band := new.band;
  end if;

  if target_passage_id is null
    or target_band is null
    or target_band < 0
    or target_band > 9
    or target_skill not in ('reading', 'listening', 'writing') then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    update public.passages passage
    set
      band_score_sum = greatest(0, passage.band_score_sum - target_band),
      band_submission_count = greatest(0, passage.band_submission_count - 1)
    where passage.id = target_passage_id
      and passage.skill = target_skill;
    return old;
  end if;

  update public.passages passage
  set
    band_score_sum = passage.band_score_sum + target_band,
    band_submission_count = passage.band_submission_count + 1
  where passage.id = target_passage_id
    and passage.skill = target_skill;

  return new;
end;
$$;

revoke execute on function private.sync_passage_average_band()
  from public, anon, authenticated;
grant execute on function private.sync_passage_average_band()
  to service_role;

drop trigger if exists attempts_sync_passage_average_band on public.attempts;
create trigger attempts_sync_passage_average_band
after insert or delete on public.attempts
for each row execute function private.sync_passage_average_band();

comment on column public.passages.seed_average_band is
  'Difficulty-correlated estimate displayed only while band_submission_count is zero.';
comment on column public.passages.band_score_sum is
  'Sum of valid submitted bands for exact running-average calculation.';
comment on column public.passages.band_submission_count is
  'Number of valid total submissions included in average_user_band.';
comment on column public.passages.average_user_band is
  'Stored generated band: seeded estimate at zero submissions, real mean thereafter.';
