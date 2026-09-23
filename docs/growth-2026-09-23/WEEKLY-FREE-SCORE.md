# Weekly free AI score (monetization action #5)

Status: **built and tested, not applied.** No production database, Vercel env or Stripe setting has been changed. The founder applies it with the steps below.

## What changes

Today a signed-in free account gets **one lifetime** reduced AI Writing report and **one lifetime** reduced AI Speaking report. After this change it gets **one of each per rolling 7 days**. The free report stays the reduced one (Writing: band + four criteria + one correction; Speaking: band + Fluency & Coherence). Premium limits, referral credits, Stripe and checkout do not change.

| Layer | Change | File |
|---|---|---|
| DB | `consume_ai_score` v9 → **v10**. A free sample is granted when `free_<skill>_score_used_at` is NULL **or at least 7 days old** (it used to require NULL). Consuming a sample still sets the column to `now()`, so the existing column is the period marker: no new column, no backfill, no table rewrite. Responses gain optional `freePeriod: 'week'` and `nextFreeAt`. A free-tier `premium_required` denial now sets `resetsAt` to the refill time; before, it was always null. | `supabase/migrations/20260923120000_weekly_free_ai_score.sql` |
| DB rollback | Restores v9 exactly as written, copied from the referral migration. It re-creates only this one function. | `supabase/rollbacks/20260923120000_weekly_free_ai_score.down.sql` |
| DB checks | 10 behavioural scenarios run against the real database inside the apply transaction, then get rolled back (details below) | `supabase/tests/weekly_free_ai_score.sql` |
| Apply script | `--dry-run`, apply, and `--rollback` modes; Node 22, run from the repo root | `scripts/apply-weekly-free-score.mjs` |
| API | Free Writing and Speaking results now include `nextFreeAt` when the RPC returns it (v10 only; nothing is sent under v9). Speaking cost rows now carry `metadata.free_sample`, like Writing. | `pages/api/score/writing.js`, `pages/api/score/speaking.js` |
| Flag | `NEXT_PUBLIC_FREE_SCORE_PERIOD=weekly` switches every allowance string and turns on the "Your next free score unlocks on <date>" hints. **Unset = today's lifetime copy and behaviour, unchanged.** | `lib/freeScorePeriod.js` |
| Client state | `useFreeSample` reports "used" only when the sample was taken in the last 7 days (weekly mode), and returns `nextFreeAt` | `src/lib/useFreeWritingSample.js` |

### Copy driven by the flag

| Surface | Lifetime (default) | Weekly |
|---|---|---|
| Pricing: free bullet + comparison row | One lifetime Writing sample + one Speaking sample score | 1 free AI Writing + 1 free AI Speaking score every week |
| Pricing: "What is free" FAQ (also FAQPage JSON-LD) | …one lifetime Writing sample score plus one Speaking sample score. | …one AI Writing score and one AI Speaking score each week (a shorter free report). Each refills 7 days after you use it. |
| Pricing: line under the plans | Start with a free Writing and a free Speaking sample score. | Start with a free Writing and a free Speaking score every week. |
| Pricing paywall banner (`?upgrade=writing\|speaking`, sample used) | (none) | Not ready to upgrade? Your next free Writing score unlocks on Tue 30 Sept. |
| Writing checker intro | Create an account for one free Writing sample: | Create an account for a free Writing score every week: |
| Writing submit chip (checker + question pages) | Includes one free AI score… / Your free sample is used… / Your free AI score is available… | Includes a free AI score every week… / This week's free score is used — Pro scores this essay in full now. Your next free Writing score unlocks on <date>. / This week's free AI score is available… |
| AI quota modal (non-premium) | You've used your lifetime free Writing/Speaking sample. | You've used this week's free Writing/Speaking score. Your next free … unlocks on <date>. |
| Free result offer (Writing report + Speaking result) | (unchanged) | + Your next free Writing/Speaking score unlocks on <date>. (the date comes from the server, so it only appears once v10 is live) |
| Reading/Listening → Writing prompt card (upgrade variant) | (unchanged) | + Your next free Writing score unlocks on <date>. |
| /speakingquestion intro | …each account includes one lifetime Speaking sample score. | …each account gets one free Speaking score every week. |
| Practice/blog feedback entry block | One free sample per skill, per account… | One free score per skill every week. Used this week's?… |
| Homepage hero footnote | Free means one AI Writing report per account — a single lifetime sample. | Free means one AI Writing report every week — it refills 7 days after you use it. |
| Homepage "Free forever" tier | …plus one free AI Writing and one Speaking sample score. | …plus one free AI Writing and one AI Speaking score every week. |
| Welcome email intro | Your account includes one lifetime AI Writing sample score. | Your account includes a free AI Writing score every week. |

The server (`consume_ai_score`) always makes the entitlement decision. The flag only changes copy and the client-side "used this week?" hint.

## Deploy order doesn't matter

| | Migration NOT applied (v9) | Migration applied (v10) |
|---|---|---|
| **Flag unset** (merge this branch as-is) | Identical to today. | Server grants a sample again once 7 days have passed. Copy still says "lifetime", so users just get a pleasant surprise. The old speaking page gate may send a user whose lifetime sample is spent to /pricing before asking the server; that is today's behaviour, and nothing breaks. |
| **Flag = weekly** | Only if the order is wrong. The chip may say "available" after 7 days, then the server returns `premium_required` and the user lands on /pricing, the same as today. The server-sourced result hints never show because v9 sends no `nextFreeAt`. Safe, but the copy over-promises, so don't leave it like this. | Target state. |

The migration only replaces one function body. Its signature, `SECURITY DEFINER`, empty `search_path` and service_role-only `EXECUTE` are unchanged. Every v9 response key is still present, and the new keys are additive. Old API code already passes `resetsAt` through on a 402 and reads it only on the Premium fair-use branch. `refund_ai_score` v4 is untouched: refunding a free score sets the column back to NULL (only if it still equals the consumed timestamp). That is still correct under the weekly rule, because the account was eligible when it consumed.

## Founder rollout (Node 22, from the repo root, with `.env.local` holding `SUPABASE_DB_SESSION_URL`)

```bash
export PATH=~/.nvm/versions/node/v22.22.0/bin:$PATH

# 0. (optional) how many accounts become eligible again the moment v10 lands
#    (run in the Supabase SQL editor, read-only):
#    select count(*) filter (where free_writing_score_used_at  < now() - interval '7 days') as writing_refill_now,
#           count(*) filter (where free_speaking_score_used_at < now() - interval '7 days') as speaking_refill_now
#    from public.user_quotas;

# 1. Rehearse: applies v10, runs the behavioural checks, then ROLLS BACK everything.
node scripts/apply-weekly-free-score.mjs --dry-run
#    expect: "behavioural checks passed" + "DRY RUN OK: would install consume_ai_score v10"

# 2. Apply for real (one transaction; the checks run in a savepoint before COMMIT).
node scripts/apply-weekly-free-score.mjs
#    expect: "applied + verified: consume_ai_score v10 (weekly free samples), refund v4 unchanged"
```

3. **Vercel → Project → Settings → Environment Variables:** add `NEXT_PUBLIC_FREE_SCORE_PERIOD` = `weekly` for Production (and Preview if you want previews to match).
4. **Redeploy production.** `NEXT_PUBLIC_*` values are baked in at build time, so an env change does nothing until a new build runs (Deployments → latest → Redeploy).
5. Verify:
   - /pricing shows "1 free AI Writing + 1 free AI Speaking score every week" in the free column and FAQ.
   - With a free test account whose sample is used: the writing checker chip says "This week's free score is used … unlocks on <date>".
   - `select obj_description('public.consume_ai_score(uuid,text)'::regprocedure);` starts with `consume_ai_score v10`.
6. Update the external daily-blog cloud routine's note (see "Copy not flipped by the flag" below).

What the script guards against:
- It refuses to run unless prod is at v9 (or already at v10 on a re-run). If someone has changed the function since this was written, it stops so the change can be re-diffed first.
- `lock_timeout 5s` and `statement_timeout 60s`: it fails fast rather than queueing behind a long lock on `user_quotas`.
- The behavioural checks use three synthetic `weekly-free-qa-<uuid>@example.invalid` accounts, exist only inside a savepoint, and are always rolled back. A failed check aborts the whole apply, so nothing is committed.
- Before commit it verifies: v10 comment, `SECURITY DEFINER`, `search_path=""`, service_role-only EXECUTE, and a single `refund_ai_score` v4 overload.

## Rollback

1. Remove `NEXT_PUBLIC_FREE_SCORE_PERIOD` in Vercel (or set it to anything else), then redeploy. Copy returns to "lifetime". Do this first so the site never promises a weekly refill that the database no longer grants.
2. `node scripts/apply-weekly-free-score.mjs --rollback`: restores v9 in one transaction and verifies the v9 comment and grants. Expect: `rolled back + verified: consume_ai_score v9`.

No data is changed in either direction. After rollback, every account that has taken any sample (weekly or lifetime) is locked out of that skill's free sample again, and accounts that never used one keep it. The code on this branch can stay deployed with the flag unset: it behaves exactly like today.

## Anti-abuse and cost

**Account requirements. Unchanged and still enforced:**
- Both scoring routes reject missing tokens, Supabase anonymous-auth tokens, and users without an email *before* calling the RPC (`resolveUserId`). The RPC also refuses `is_anonymous` accounts (`account_required`). Behavioural check 8 covers this.
- Signup is email + password with an emailed 6-digit OTP (`verifyOtp`). Keep **Supabase → Auth → "Confirm email" ON**, so an unverified address never gets a session and never gets a score.
- `20260911010000_auth_mailbox_claims.sql` (one account per canonical `name+tag@domain` mailbox) closes the plus-alias farming route **if it has been applied**. Its doc says it had not been applied as of Sep 10, so check before relying on it.
- There is no per-device or per-IP *free-sample* check today, and this change doesn't add one. The request-level limits still apply to every score, free or paid: Writing allows 8 scorings/hour per IP and 500/day globally; Speaking allows 10/day per user and 300/day globally. A weekly refill makes one account *more* valuable relative to farming new ones, so it doesn't raise the farming incentive. The per-account cost of farming is unchanged: one Writing + one Speaking sample per new account.

**Cost per free score.** Rates in `lib/aiCost.js`; token shapes in `docs/AI-COST-CONTROLS.md`.
- Free Writing runs on `SCORING_MODEL_FREE`, default gpt-4.1-mini ($0.40/M in, $1.60/M out): **~$0.003 typical, ~$0.006 conservative.** If prod sets `SCORING_MODEL_FREE` to gpt-5.1, use ~$0.017–0.028 instead.
- Free Speaking runs on the paid model, gpt-5.1 ($1.25/M in, $10/M out), plus Whisper at $0.006/min: **~$0.023 typical, ~$0.037 conservative** for a 2-minute answer.
- Both per week: **~$0.026 typical, ~$0.043 conservative per free user.** That is at most ~$0.19/month per free user who uses both every week.

**At 500 weekly active free users:**

| Uptake | Monthly cost (×4.33 weeks) |
|---|---:|
| Everyone uses both every week (worst case, conservative) | 500 × $0.043 × 4.33 ≈ **$93/month** |
| Everyone uses both (typical token counts) | ≈ **$56/month** |
| Realistic: 40% use Writing, 15% use Speaking (conservative rates) | 500 × (0.40×0.006 + 0.15×0.037) × 4.33 ≈ **$17/month** |

The hard ceiling is the global circuit breakers (500 Writing + 300 Speaking scores per day, shared with paying users). All-free usage at that ceiling would be ~$3/day for Writing and ~$11/day for Speaking. Watch for this: those breakers are **shared**, so a free-user burst could 429 paying customers. At today's ~80 sessions/day that is far away. If free scores ever pass ~50% of either daily breaker, give free samples their own `*-free-global` bucket.

**One-off reactivation.** Every account whose lifetime sample is more than 7 days old becomes eligible again when v10 lands. This is intentional: it gives a win-back email a reason to exist. Step 0's query sizes it. Worst case is roughly that count × $0.043, spread over however many of those users actually return.

**Measure it:** `select date_trunc('week', created_at) wk, skill, count(*), sum(cost_usd) from public.ai_usage_costs where feature in ('writing_score','speaking_score') and (metadata->>'free_sample')::boolean group by 1,2 order by 1 desc;` Speaking rows carry `free_sample` only from this deploy onward. Pair this with Pro purchases per week to judge the change: the aim is repeat visits that meet the paywall.

## Copy not flipped by the flag (update after rollout)

These are content, not code. They were deliberately left alone rather than rewriting ~100 posts. After step 4, edit them (or ask the blog routine to):

- `content/posts/ielts-writing-task-2-body-paragraphs.md`: "the free tier gives you one lifetime sample report, so make your test essay count"
- `content/posts/ielts-vocabulary-work-and-jobs.md`: "its free tier gives one lifetime sample report"
- `content/posts/ielts-writing-complex-sentences.md`: "the free tier is a single lifetime sample report"
- `content/posts/ielts-writing-time-management.md`: "(the free tier includes one lifetime sample report)"
- `content/posts/ielts-writing-task-2-avoid-going-off-topic.md`: "(the free tier gives you one lifetime sample report)"
- `content/posts/best-free-ielts-writing-checkers-2026.md`: comparison table row "one AI Writing sample score and one Speaking sample after signup", and line ~120 "gives you one AI sample score after signup … Speaking gives you one sample score the same way". This is a date-stamped competitor comparison, so update the date too.
- `content/posts/best-free-ielts-practice-resources.md`: "our Writing Checker gives one free sample score after signup"
- `content/posts/estimate-your-ielts-band-before-booking.md`: "Your first sample score is free". Neutral, and still true.
- **External daily-blog cloud routine prompt** (not in this repo): its note that the free tier is ONE lifetime sample must become neutral. The in-repo generator prompt (`scripts/content/generate-blog-post.mjs`) was already changed to "a free, shorter AI sample report … never state how many free scores there are or how often they refill; point to /pricing", so it is correct in both modes.
- Neutral, no change needed: `src/pages/AboutUs.js` ("try one Writing score free"), `public/llms.txt` ("AI scoring includes a free tier"), `pages/band-estimator.js`, `pages/ielts-writing-task-2-topics/[month].js`, lifecycle study-plan email ("your free AI Writing sample").
- Internal docs describing the lifetime rule (`docs/MONETIZATION.md` §free tier, `docs/AI-COST-CONTROLS.md`): update once v10 is live.
- Unrelated stale line spotted: `pages/dashboard.js` "Premium adds a Speaking baseline". Free accounts have had a Speaking sample since Aug 2.

## Tests

- `tests/weekly-free-score-migration.test.js` checks the SQL files statically:
  - v10 replaces only this one function.
  - Signature, definer and grants are kept.
  - The caller check, anonymous refusal, premium resolution and `FOR UPDATE` lock are identical to v9.
  - The Premium cap block is byte-identical to v9.
  - The 7-day rule is in place.
  - The order is free sample → referral credit → deny with `resetsAt`.
  - The rollback file equals v9 exactly.
  - The apply script uses a savepoint, rolls it back, and only then commits.
- `supabase/tests/weekly_free_ai_score.sql` runs the behaviour against the real database (there is no local Postgres) inside the apply script:
  - fresh grant
  - same-week denial with the refill time
  - Speaking tracked separately from Writing
  - free refund is applied once and not twice
  - 6-day vs 7-day boundary
  - legacy lifetime users refill
  - referral order, credit refund, then denial
  - anonymous refusal
  - Premium path unchanged and never stamps the free column
  - privileges
- `lib/freeScorePeriod.test.js`:
  - flag parsing, and flag read at build time
  - the window matches the SQL
  - used/refill logic
  - date hint, including time-zone rollover
  - both copy sets have the same keys, and weekly copy never says "lifetime"
  - a guard that the eight flagged surfaces contain no hard-coded "lifetime" copy
- Route tests check `nextFreeAt` pass-through under v10, its absence under v9, and the v10 `premium_required` pass-through. `FreeSampleChip` tests cover both modes.
