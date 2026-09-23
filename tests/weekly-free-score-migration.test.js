import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Static guarantees for consume_ai_score v10 (weekly free samples). The
// behavioural checks live in supabase/tests/weekly_free_ai_score.sql and run
// against the real database inside scripts/apply-weekly-free-score.mjs before
// it commits (no local Postgres in CI).

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const v10 = read('supabase/migrations/20260923120000_weekly_free_ai_score.sql');
const referral = read('supabase/migrations/20260802220000_referral_program.sql');
const rollback = read('supabase/rollbacks/20260923120000_weekly_free_ai_score.down.sql');
const behaviour = read('supabase/tests/weekly_free_ai_score.sql');
const applyScript = read('scripts/apply-weekly-free-score.mjs');

const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');
const norm = (sql) => stripComments(sql).replace(/\s+/g, ' ').trim().toLowerCase();

function consumeFunction(sql) {
  const start = sql.indexOf('create or replace function public.consume_ai_score(p_uid uuid, p_skill text)');
  const end = sql.indexOf('$$;', start);
  expect(start).toBeGreaterThanOrEqual(0);
  return sql.slice(start, end + 3);
}

const v9Fn = consumeFunction(referral);
const v10Fn = consumeFunction(v10);

function between(fn, from, to) {
  const a = fn.indexOf(from);
  const b = to ? fn.indexOf(to, a) : fn.length;
  expect(a, from).toBeGreaterThanOrEqual(0);
  expect(b, to).toBeGreaterThan(a);
  return fn.slice(a, b);
}

describe('weekly free AI score migration (consume_ai_score v10)', () => {
  it('only replaces consume_ai_score: no table, column, refund or data change', () => {
    const body = norm(v10);
    expect(body.match(/create or replace function/g)).toHaveLength(1);
    expect(body).not.toMatch(/alter table|create table|drop |insert into public\.user_quotas \(user_id, ai_scores_remaining, period_resets_at, referral_bonus_scores\)/);
    expect(body).not.toContain('refund_ai_score');
    expect(body).not.toMatch(/update public\.user_quotas set free_(writing|speaking)_score_used_at = null/);
  });

  it('keeps the signature, SECURITY DEFINER, empty search_path and service_role-only EXECUTE', () => {
    const body = norm(v10);
    expect(body).toContain('create or replace function public.consume_ai_score(p_uid uuid, p_skill text) returns jsonb language plpgsql security definer set search_path = \'\'');
    expect(body).toContain('revoke all on function public.consume_ai_score(uuid, text) from public, anon, authenticated;');
    expect(body).toContain('grant execute on function public.consume_ai_score(uuid, text) to service_role;');
    expect(body).toMatch(/comment on function public\.consume_ai_score\(uuid, text\) is 'consume_ai_score v10:/);
  });

  it('keeps the caller check, anonymous refusal, premium resolution and row lock of v9 verbatim', () => {
    const prefix = (fn) =>
      norm(between(fn, 'begin\n', 'if not v_premium then'));
    expect(prefix(v10Fn)).toBe(prefix(v9Fn));
    // The eligibility check happens under FOR UPDATE, so concurrent requests
    // serialize on the user_quotas row.
    const locked = v10Fn.indexOf('for update');
    expect(locked).toBeGreaterThan(0);
    expect(locked).toBeLessThan(v10Fn.indexOf('v_free_used_at :='));
  });

  it('leaves the Premium fair-use caps byte-for-byte identical to v9', () => {
    const premium = (fn) => norm(between(fn, 'if v_quota.daily_counters_date is distinct from v_today then'));
    expect(premium(v10Fn)).toBe(premium(v9Fn));
  });

  it('grants the free sample when never used or used at least 7 days ago', () => {
    const free = norm(between(v10Fn, 'if not v_premium then', 'if v_quota.daily_counters_date'));
    expect(norm(v10Fn)).toContain("v_free_window constant interval := interval '7 days';");
    expect(free).toContain("v_free_used_at := case p_skill when 'speaking' then v_quota.free_speaking_score_used_at else v_quota.free_writing_score_used_at end;");
    expect(free).toContain('v_next_free_at := v_free_used_at + v_free_window;');
    expect(free).toContain('if v_free_used_at is null or v_next_free_at <= v_now then');
    expect(free).toContain('set free_speaking_score_used_at = v_now');
    expect(free).toContain('set free_writing_score_used_at = v_now');
    expect(free).toContain("'free', true, 'consumedat', v_now, 'freeperiod', 'week', 'nextfreeat', v_now + v_free_window");
  });

  it('spends a referral credit only after this week’s sample, then denies with the refill time', () => {
    const free = norm(between(v10Fn, 'if not v_premium then', 'if v_quota.daily_counters_date'));
    const sample = free.indexOf('if v_free_used_at is null or v_next_free_at <= v_now then');
    const credit = free.indexOf('if coalesce(v_quota.referral_bonus_scores, 0) > 0 then');
    const deny = free.indexOf("'reason', 'premium_required'");
    expect(sample).toBeGreaterThan(0);
    expect(credit).toBeGreaterThan(sample);
    expect(deny).toBeGreaterThan(credit);
    expect(free).toContain('set referral_bonus_scores = referral_bonus_scores - 1');
    expect(free).toContain("'referral', true, 'consumedat', v_now");
    expect(free).toContain("'allowed', false, 'remaining', 0, 'resetsat', v_next_free_at, 'plan', 'free', 'free', false, 'reason', 'premium_required'");
  });

  it('keeps every v9 response key so old app code reads it unchanged', () => {
    for (const key of ["'allowed'", "'remaining'", "'resetsat'", "'plan'", "'free'", "'consumedat'", "'referral'", "'reason'"]) {
      expect(norm(v10Fn)).toContain(key);
    }
  });
});

describe('weekly free score rollback', () => {
  it('restores consume_ai_score v9 verbatim and nothing else', () => {
    const fn = consumeFunction(rollback);
    expect(fn).toBe(v9Fn);
    const body = norm(rollback);
    expect(body.match(/create or replace function/g)).toHaveLength(1);
    expect(body).toContain("'consume_ai_score v9:");
    expect(body).toContain('grant execute on function public.consume_ai_score(uuid, text) to service_role;');
    expect(body).not.toMatch(/redeem_referral|refund_ai_score|alter table|drop /);
  });
});

describe('weekly free score behavioural SQL + apply script', () => {
  it('covers the scenarios the founder relies on', () => {
    for (const scenario of [
      'Fresh free account',
      'Same week: denied',
      'Speaking is an independent allowance',
      'Refund of the free writing score restores eligibility',
      'Rolling window boundary',
      'Legacy lifetime users',
      'Referral order',
      'Anonymous accounts never get a free sample',
      'Premium path is unchanged',
      'Privileges',
    ]) {
      expect(behaviour).toContain(scenario);
    }
    expect(behaviour).toContain("set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");
    expect(behaviour).toMatch(/@example\.invalid/);
  });

  it('applies in one transaction, runs the checks in a savepoint, and never commits QA rows', () => {
    expect(applyScript).toContain('supabase/migrations/20260923120000_weekly_free_ai_score.sql');
    expect(applyScript).toContain('supabase/rollbacks/20260923120000_weekly_free_ai_score.down.sql');
    expect(applyScript).toContain('supabase/tests/weekly_free_ai_score.sql');
    expect(applyScript).toContain("'savepoint weekly_free_score_qa'");
    expect(applyScript).toContain("'rollback to savepoint weekly_free_score_qa'");
    expect(applyScript).toContain('--dry-run');
    expect(applyScript).toContain('--rollback');
    expect(applyScript.indexOf("'rollback to savepoint weekly_free_score_qa'")).toBeLessThan(
      applyScript.indexOf("await client.query('commit')")
    );
  });
});
