# ielts-bank.com — Monetization Plan

**Status:** Implementation-ready blueprint — **payments live on Stripe**
**Last updated:** 2026-07-17
**Owner:** Founder / eng
**Scope:** How ielts-bank.com goes from free + AdSense to a paid, AI-scoring subscription business without breaking its SEO engine.

> This document is the source of truth for pricing, gating, payments, and rollout. It maps every gate to the **real** Supabase schema already provisioned (`users`, `user_quotas`, `attempts`, `scores`, plus `passages/question_groups/questions/answer_keys`). Strategy unchanged: keep content free as the SEO moat; differentiator = trustworthy rubric-anchored scoring.
>
> **2026-07-17 decision — Stripe replaces Paddle.** Founder created a Stripe account and chose to launch on it. Consequence: **we are now merchant of record** — global VAT/GST registration thresholds and chargeback liability sit with us, not the processor (the §4.1 Paddle rationale still describes the trade-off accurately; it is now an accepted risk, mitigated by enabling **Stripe Tax** and monitoring registration thresholds). Revisit Paddle/MoR if international tax exposure grows.

---

## 0. TL;DR

- **Free forever:** all practice content (Reading/Listening passages, questions, auto-scoring, band conversion). This is the SEO engine and must never be paywalled.
- **Gated (the product we sell):** AI scoring of Writing & Speaking (rubric-anchored, per-criterion feedback), "unlimited" scores under fair-use daily caps (§5.3), the Realtime AI speaking examiner (metered in minutes, §9), progress analytics, an ad-free experience, and mock-test / export features.
- **Free metering:** anonymous = **1** free AI score (lifetime, to sample), signed-in free = **3** AI scores per rolling 30 days — enforced server-side by a transactional decrement of `user_quotas.ai_scores_remaining`, never trusted from the client.
- **Premium limits (§5.3):** Writing 2 AI scores/day, async Speaking 1/day (marketed as unlimited; these are abuse caps), Realtime examiner **60 min/month** (30 on PPP plans). Worst-case COGS hard-capped ≈ $4.50/user/mo; typical ≈ $0.90 → ~80% blended gross margin at $4.20 ARPU.
- **Prices (USD, global list):** **$9.99/mo**, **hero SKU $29.99 / 6 months (~$5/mo)**, **$44.99/year (~$3.75/mo)**. PPP tiers ~55% off for India/MENA/SEA (e.g. $3.99/mo, $14.99/6-mo).
- **Payments:** **Stripe** (see decision note above) — Checkout + Billing subscriptions, webhook → `users.plan`; PPP implemented as separate Stripe Prices selected server-side by request geo (`x-vercel-ip-country`). Stripe Tax enabled for calculation/collection; tax registrations are our responsibility as MoR.
- **MVP paid launch:** Supabase Auth (anon → Google/email) → server-side metering → Writing scoring API → Stripe Checkout + webhook → `users.plan` gate. Everything else (analytics dashboards, speaking, exports) ships after money is flowing.

---

## 1. Guiding principles

### 1.1 What stays free forever — and why

| Free forever | Why |
|---|---|
| All Reading & Listening passages, questions, options, answer keys | These are the indexed, crawlable pages that rank. Content **is** the acquisition channel. Gating it kills the funnel. |
| Auto-scoring for Reading/Listening (`answer_keys` compare, `band_tables` conversion) | Zero marginal cost (pure compute, no LLM). Auto-scoring is the hook that gets users to sign in and creates the "now try Writing" upgrade moment. |
| Writing/Speaking **prompts** and cue cards | Same SEO logic — the prompt pages rank for "IELTS Task 2 sample question X". The scoring of a user's answer is the paid part, not the prompt. |
| First AI scores (the free meter) | A prospect must feel the quality of the rubric-anchored feedback before paying. The free score is the demo. |

**Principle:** *We never charge for content or for auto-scored skills. We charge for the marginal-cost, high-value thing: AI evaluation of a user's own Writing/Speaking, plus the retention layer (analytics, unlimited use, no ads).*

### 1.2 What is gate-able

1. **AI Writing/Speaking scores beyond the free meter** — the core paid unit (real LLM cost, real value).
2. **Progress analytics** — trend of `scores.overall_band` and per-criterion `scores.criteria` over time, built from `attempts` + `scores`. Cheap to build, sticky, only meaningful once a user has history → natural subscriber perk.
3. **Ad-free experience** — remove AdSense for subscribers (both a perk and an AdSense-policy hygiene win, §6).
4. **Full mock tests / timed exam mode** — bundle 4 skills into one timed sitting with a combined band; a premium framing of existing content.
5. **Model quality / turnaround** — free meter can use the cheaper model; paid can use the stronger scoring pass and priority queue.
6. **Exports** — PDF band report / feedback download (trivial to build, high perceived value for a study record).

**Non-goals:** no gating of raw passage HTML, no login-wall on content pages (kills SEO + AdSense), no dark-pattern cancellation.

---

## 2. The staged ladder

Each stage lists the **trigger to advance**, **free vs gated**, **schema mapping**, **prerequisites**, and **revenue math**.

Traffic assumptions used throughout (two scenarios, held constant across stages):

- **Conservative:** 50,000 organic sessions/month, ~55→150 passages.
- **Moderate:** 200,000 organic sessions/month, content expanded to 300+ passages.

Funnel assumptions (industry-typical for free-content edtech): ~8% of sessions create an account when a value gate appears; of engaged signed-in users, **1.5% (conservative) → 3% (moderate)** convert to paid once metering + paywall exist. Writing/Speaking is a smaller slice of total traffic than Reading, so paid conversion is computed off signed-in *active* users, not raw sessions.

---

### Stage 0 — Today (baseline, live)

- **Free:** everything. **Gated:** nothing.
- **Revenue:** AdSense only. At $50k sessions/mo and a realistic edtech RPM of ~$3–6 (international traffic, mostly India/MENA/SEA which pays low CPMs), that is **~$150–300/mo**; at 200k sessions, **~$600–1,200/mo**. This is the floor we protect, not grow.
- **Prereqs:** none. **Trigger to advance:** decision to wire auth (below).

---

### Stage 1 — Auth + Accounts (no money yet, unlocks everything)

- **Trigger to advance:** Supabase Auth wired; `attempts`/`scores` reliably attach to a stable `users.id` across the anon→Google/email upgrade.
- **Free:** all content **plus** the ability to save attempts and see your own history.
- **Gated:** nothing yet — this stage exists to create identity so metering and payments are possible.
- **Schema mapping:**
  - Anonymous sign-in on first visit → `auth.users` row (`is_anonymous=true`) → trigger `handle_new_user()` mirrors into `public.users` and seeds `public.user_quotas` (default `ai_scores_remaining=3`). Already built in `0006_auth_trigger.sql`.
  - Upgrade (link Google / magic-link) preserves `auth.users.id`, so all `attempts`/`scores` stay attached. Already handled by `handle_user_update()`.
- **Prereqs:** Supabase Auth config (anonymous + Google OAuth + email OTP); front-end sign-in flow; RLS already defined in `0005`.
- **Revenue math:** $0 direct. Value = it converts anonymous traffic into addressable users and makes the free meter enforceable per-identity.

---

### Stage 2 — Free AI-scoring meter (the demo)

- **Trigger to advance:** Writing scoring API route live; `user_quotas` decrement path proven transactional.
- **Free:** anonymous users get **1** AI Writing score (lifetime sample). Signed-in free users get **3** AI scores per rolling **30 days**.
- **Gated:** the 2nd/4th score and beyond → upgrade prompt.
- **Schema mapping (exact):**
  - `user_quotas.ai_scores_remaining` (int, default 3) = the meter.
  - `user_quotas.period_resets_at` (timestamptz) = when the free allowance refills.
  - Each score writes a `scores` row (`overall_band`, `criteria` JSON, `model`, `rubric_id`, `feedback_html`) tied to an `attempts` row (`skill='writing'`, `responses` = the essay). **The decrement and the insert happen in one server transaction** (§5).
- **Prereqs:** Stage 1; the scoring API route; a chosen scoring model; `rubrics` seeded for Writing.
- **Revenue math:** still ad-only, but this is the conversion instrument. Every user who hits "0 remaining" is a warm paywall impression. Expect **8–15%** of users who complete their free scores to see the upgrade modal within their first session.

---

### Stage 3 — Paywall + Subscriptions (money on)

- **Trigger to advance:** Stripe account live; webhook endpoint deployed; `users.plan` column live.
- **Free:** content + auto-scoring + the metered free AI scores + basic own-history view + ads.
- **Gated (Premium):** unlimited AI scores; progress analytics; ad-free; export; full mock mode; stronger scoring model.
- **Schema mapping (exact):**
  - `users.plan` in (`free`,`premium`) — the gate the scoring route checks.
  - `users.plan_status` (`active`,`past_due`,`canceled`,`refunded`).
  - `users.plan_renews_at` (timestamptz).
  - `users.stripe_customer_id`, `users.stripe_subscription_id` — reconcile webhooks → user.
  - Scoring route logic: if `plan='premium'` and `plan_status='active'` → skip the `user_quotas` decrement (unlimited); else run the metered path.
- **Prereqs:** Stage 2; Stripe products/prices created; webhook handler (§4); billing UI.
- **Revenue math:**

  | | Conservative (50k sess) | Moderate (200k sess) |
  |---|---|---|
  | Signed-in active users/mo | ~4,000 | ~20,000 |
  | Paid conversion | 1.5% | 3.0% |
  | Paying subscribers | ~60 | ~600 |
  | Blended ARPU (mix of mo/6-mo/annual + PPP) | ~$4.20/mo | ~$4.20/mo |
  | **Subscription MRR** | **~$250/mo** | **~$2,500/mo** |
  | AdSense (free users, ads-on) | ~$150–300 | ~$600–1,200 |
  | **Total/mo** | **~$400–550** | **~$3,100–3,700** |

  Note: blended ARPU is deliberately low because the hero SKU is the 6-month prepay and a large share of buyers take PPP pricing. LLM COGS at 0.3–1.3¢/score is a rounding error against this (a heavy subscriber scoring 100 essays/mo costs ~$0.30–1.30).

---

### Stage 4 — Retention & expansion (grow LTV)

- **Trigger to advance:** ≥100 paying subs; churn measured.
- **Free:** unchanged. **Gated:** deepen premium — Speaking scoring (audio → transcript → score), examiner-style model answers, weakness-targeted passage recommendations, streaks.
- **Schema mapping:** `scores` already supports `skill='speaking'` and per-criterion `criteria`; Speaking adds a transcription step (audio in Storage `listening-audio`-style bucket) before scoring. Analytics reads `attempts`+`scores` time series.
- **Prereqs:** Stage 3 revenue; speaking capture UI; transcription model.
- **Revenue math:** primarily lifts ARPU/retention rather than adding a new line — annual-plan attach and lower churn push blended ARPU toward $5–6 and LTV up materially.

---

## 3. Pricing recommendation

### 3.1 Global list prices (USD)

| SKU | Price | Effective /mo | Role |
|---|---|---|---|
| Monthly | **$9.99** | $9.99 | Anchor / impulse; most users see this first |
| **6-month (HERO)** | **$29.99** | **~$5.00** | Default recommended plan — matches a real IELTS study cycle |
| Annual | **$44.99** | ~$3.75 | Best value; maximizes cash upfront + retention |

Rationale for the 6-month hero: IELTS prep is a **fixed-duration project**, not an indefinite service. Buyers think "I test in ~3–5 months," so a 6-month prepay converts better than monthly and dramatically reduces churn/refund exposure vs a rolling monthly plan. Price it as the visually-highlighted middle option.

### 3.2 PPP-discounted tiers (India / MENA / SEA)

The majority of IELTS demand — and of this site's traffic — is India, Pakistan, Bangladesh, Nigeria, Egypt, Gulf, Philippines, Vietnam. PPP is implemented as separate Stripe Prices selected **server-side** from request geo (`x-vercel-ip-country`), set at **~55% off** in these markets:

| SKU | Global | PPP (India/MENA/SEA) |
|---|---|---|
| Monthly | $9.99 | **$3.99** |
| 6-month (hero) | $29.99 | **$14.99** |
| Annual | $44.99 | **$19.99** |

PPP is not optional here: a $9.99 global price is a hard wall in ₹/₨ markets, and unauthorized-region full-price sales drive chargebacks. Server-side PPP price selection both lifts conversion and cuts fraud/refund rates. (Note: Stripe's UPI support is limited vs Paddle's — a known conversion loss for Indian traffic; monitor and revisit.)

### 3.3 Justification vs named competitors (current 2026 prices)

| Competitor | Current price | Positioning vs us |
|---|---|---|
| **OpenIELTS** | ~$19/mo | We undercut at $9.99/mo and ~$5/mo on the hero SKU. |
| **IELTS Mocks** | ~$20 / 30 days | We are ~half, with free content on top. |
| **IELTS Writing AI Checker (app)** | $14.99/mo | Single-skill; we're cheaper and multi-skill. |
| **Sprechify** | $11–$23/mo | Voice-first; we're broader + cheaper. |
| **ielts.international** | from $4.99/mo | Lowest advertised; our differentiator is *trustworthy rubric-anchored* scoring + a huge free content library, not a race to the bottom. |
| **Magoosh IELTS** | ~$109–180 / 6 mo | Course, not scoring. Our 6-mo hero at $29.99 is an order of magnitude cheaper and complements rather than competes. |
| **E2Language** | ~$79/mo & up | Live/tutoring premium tier; we're self-serve AI at a fraction. |
| **IELTS Liz** | Free | The proof that free content wins traffic — we out-monetize it by adding paid AI scoring on top of a similarly-free library. |

**Net:** priced at the value floor of the AI-scoring cohort ($9.99 anchor, ~$5 hero), well under course/tutoring incumbents, with PPP to win the volume markets, and differentiated on *scoring trust + free SEO library* rather than price alone.

---

## 4. Payments implementation (Stripe on Next.js + Supabase)

### 4.1 The Paddle rationale (historical) and what switching to Stripe accepts

The original plan chose Paddle as merchant-of-record because it remits VAT/GST in 200+ countries, owns chargeback liability, and ships localized/PPP pricing + local rails (UPI etc.) out of the box, at ~5% + $0.50/txn. **On 2026-07-17 the founder chose Stripe instead** (~2.9% + 30¢). What we accept by doing so:

- **We are merchant of record.** Tax calculation/collection is handled by enabling **Stripe Tax**, but *registration and remittance* in each jurisdiction (EU VAT OSS, India GST, UK VAT, etc.) is our obligation once thresholds are crossed. Action: monitor Stripe Tax's registration-threshold dashboard monthly.
- **Chargeback liability is ours** (exam-prep is dispute-heavy — §7). Mitigations: favor the prepaid 6-month hero SKU, instant first-value delivery, clear refund policy, Stripe Radar on.
- **PPP is DIY:** implemented as separate Stripe Prices chosen server-side from request geo (never client-chosen — a client-picked PPP price is a coupon anyone can abuse).
- Upside: lower fees, first-party Checkout/Portal/Radar, and no Paddle approval gate.

### 4.2 Schema additions (columns to add to existing tables)

```
-- public.users  (add):
  plan                   text    not null default 'free',    -- 'free' | 'premium'
  plan_status            text    not null default 'inactive',-- 'active'|'trialing'|'past_due'|'canceled'|'refunded'|'inactive'
  plan_renews_at         timestamptz,
  plan_started_at        timestamptz,
  stripe_customer_id     text,     -- unique, indexed
  stripe_subscription_id text,     -- unique, indexed

-- public.user_quotas  (free meter — exists; premium fair-use + realtime meters — added 2026-07-17):
  ai_scores_remaining        int          -- free 30-day meter (exists)
  period_resets_at           timestamptz  -- (exists)
  writing_scores_today       int          -- premium daily counter
  speaking_scores_today      int          -- premium daily counter
  daily_counters_date        date         -- rollover marker
  realtime_seconds_remaining int          -- Realtime examiner meter (§9)
  realtime_period_resets_at  timestamptz
```

Unique indexes on `users.stripe_customer_id` and `users.stripe_subscription_id` for idempotent webhook upserts. All plan writes are **service-role only**: a `BEFORE UPDATE` trigger rejects changes to `plan*`/`stripe_*` columns unless the role is `service_role` (client keeps its `0005` update policy for profile fields only).

### 4.3 Environment variables (exact names)

```
# Supabase (server-side privileged writes)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...        # server only — webhook + scoring route

# Stripe
STRIPE_SECRET_KEY=sk_live_...        # server only
STRIPE_WEBHOOK_SECRET=whsec_...      # server only — verify webhook signatures
# Price IDs are resolved at runtime by lookup_key (premium_monthly, premium_6month,
# premium_annual, premium_monthly_ppp, premium_6month_ppp, premium_annual_ppp),
# so no per-price env vars are needed.

# Scoring
SCORING_MODEL_FREE=...               # cheaper model id for the free meter
SCORING_MODEL_PAID=...               # stronger model id for subscribers
OPENAI_API_KEY=...
```

### 4.4 Integration outline (this stack)

**Checkout (server-created):** `POST /api/billing/checkout` — requires a signed-in, **non-anonymous** Supabase session. Creates/reuses the Stripe Customer (stored on `users.stripe_customer_id`), resolves the price by `lookup_key` (PPP variant if `x-vercel-ip-country` ∈ PPP list), and creates a subscription-mode Checkout Session with `client_reference_id = users.id` and `subscription_data.metadata.user_id`, `allow_promotion_codes: true`, `payment_method_collection: 'if_required'`, `automatic_tax: enabled`. Client redirects to the returned URL.

**Webhook (server — `pages/api/webhooks/stripe.js`, bodyParser off for raw body):**
1. Verify the `stripe-signature` header via `stripe.webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET`. Reject on mismatch.
2. Use the Supabase **service role** client (never the anon key) to write.
3. Handle events idempotently, keyed on `stripe_subscription_id` (state upserts, not increments):
   - `checkout.session.completed` → map `client_reference_id`/metadata → user; set `plan='premium'`, `plan_status='active'`, `plan_started_at`, `stripe_customer_id`, `stripe_subscription_id`, seed realtime minutes (§9).
   - `customer.subscription.created`/`updated` → sync `plan_status` from Stripe status (`active`/`trialing` → premium-active; `past_due` → grace; `canceled`/`unpaid`/`incomplete_expired` → downgrade at period end), refresh `plan_renews_at` from `current_period_end`; `cancel_at_period_end=true` → `plan_status='canceled'` but **retain premium until `plan_renews_at`**.
   - `customer.subscription.deleted` → `plan='free'`, `plan_status='canceled'`.
   - `invoice.payment_failed` → `plan_status='past_due'` (grace window; Stripe Smart Retries handle dunning).
   - `charge.refunded` / `charge.dispute.created` → `plan='free'`, `plan_status='refunded'` immediately.
4. Return 200 fast; unrecognized events are acknowledged and ignored.

**Gating check (server — inside the scoring API route):** unchanged in spirit: the `consume_ai_score` RPC reads `users.plan`/`plan_status`; premium-active (incl. canceled-not-yet-expired) bypasses the free meter but hits the fair-use daily caps (§5.3). Never trust a client-sent "isPremium" flag.

**Upgrades / cancellations / refunds:**
- SKU changes + cancellation → **Stripe Customer Portal** (`/api/billing/portal` creates a portal session); we consume the resulting `customer.subscription.updated`/`deleted` webhooks. Access persists to period end on cancel.
- Refund/chargeback → `charge.refunded`/`charge.dispute.created` flips them to free instantly; disputes are our liability (Radar + prepaid-SKU mix keeps the rate down).

---

## 5. Free-tier metering design

### 5.1 Allowances

| User type | Free AI scores | Reset cadence |
|---|---|---|
| Anonymous (`users.is_anonymous=true`) | **1** total (lifetime sample) | none — must sign in for more |
| Signed-in free | **3** per rolling 30 days | `period_resets_at` refill |
| Premium | unlimited | n/a (bypasses meter) |

Rationale: anonymous 1-score is enough to taste the feedback quality (drives sign-in); signed-in 3/30-days matches the seeded `ai_scores_remaining=3` default and is generous enough to build trust, tight enough to convert serious users. Set `period_resets_at = now() + interval '30 days'` on first score if null.

### 5.2 Server-side enforcement (never client-trusted)

The scoring route runs on Vercel with the **service role** key. The decrement and the score insert must be **one atomic operation** so a user cannot fire concurrent requests to get free scores past the limit. Implement as a Postgres RPC (`SECURITY DEFINER`) called from the route:

```
-- pseudo-logic of the RPC, executed transactionally:
-- 1. if user is premium+active -> allow, no decrement, return ok
-- 2. else: SELECT ai_scores_remaining, period_resets_at
--          FROM user_quotas WHERE user_id = :uid FOR UPDATE;   -- row lock
-- 3. if period_resets_at < now(): reset remaining to the tier cap, set new period
-- 4. if ai_scores_remaining <= 0 -> return 'quota_exceeded' (HTTP 402 upstream)
-- 5. UPDATE user_quotas SET ai_scores_remaining = ai_scores_remaining - 1 ...
-- 6. return 'ok'  (the route then calls the LLM and inserts attempts + scores)
```

Key rules:
- `FOR UPDATE` row lock prevents the concurrency race.
- The client never sends the remaining count; it only reads it for display via RLS (`user_quotas` is client-readable, service-write-only per `0004`/`0005`).
- If the LLM call **fails after** decrement, refund the quota in a `catch` (compensating `+1`), or (cleaner) decrement only on successful score insert within the same transaction boundary.
- Return **HTTP 402** on `quota_exceeded` so the front-end shows the paywall modal deterministically.

### 5.3 Premium fair-use limits (decided 2026-07-17)

Premium is marketed as "unlimited AI scoring" but carries **abuse caps** sized so no single account can run away with LLM spend (human essay-writing speed bounds organic use; these caps bound scripted use):

| Feature | Premium limit | Worst-case COGS/mo | Typical COGS/mo |
|---|---|---|---|
| Writing AI scores (`gpt-5.1` pass, ~2¢ each) | **2/day** (~60/mo) | ~$1.20 | ~$0.25 |
| Async Speaking scores (Whisper + `gpt-5.1`, ~3¢ each) | **1/day** (~30/mo) | ~$0.90 | ~$0.15 |
| Realtime AI examiner (§9, mini, ~3–5¢/min) | **60 min/mo** global / **30 min/mo** PPP | ~$2.40 | ~$0.50 |
| **Total** | | **~$4.50 hard ceiling** | **~$0.90** |

At $4.20 blended ARPU this holds **~80% blended gross margin**; the worst case is profitable on global monthly, ~breakeven on hero/PPP-monthly, and a bounded, rare loss (~-$3/mo) on PPP annual. Enforcement: same transactional RPC pattern as the free meter — `consume_ai_score(p_uid, p_skill)` rolls daily counters in `user_quotas`; Realtime minutes decrement via `consume_realtime_seconds` before a session token is minted. Free tier is unchanged (3 scores / 30 days, no Realtime).

---

## 6. AdSense coexistence

### 6.1 Where ads live

- **Ads ON:** all public/free content pages (passage/question pages), for anonymous and signed-in **free** users. This is where the crawlable traffic is and where AdSense revenue comes from.
- **Ads OFF:** for `plan='premium'` users everywhere, and inside the scoring/results/analytics surfaces regardless of plan (paid product surfaces should never show ads; also avoids ads next to a paywall). Gate the AdSense component on `plan !== 'premium'`.

### 6.2 Paywall + structured data

- Any partially-gated page (e.g. a results page showing a teaser of the AI feedback then a paywall) must use **`isAccessibleForFree`** schema.org markup with a `hasPart`/`cssSelector` describing the gated block, so Google understands the paywall and does not treat it as cloaking. Fully-free content pages need no such markup.
- Keep the free content genuinely free to crawlers — do not serve different content to Googlebot vs users.

### 6.3 "Low-value content" policy risk (templated question pages) + mitigation

AdSense/Search can flag large sets of thin, templated pages (55→300 near-identical question layouts) as **low-value / scaled content**. Mitigations:
1. **Substantive unique text per passage** — each passage already has real body copy; ensure Writing/Speaking prompt pages carry unique model-answer notes, examiner tips, and vocabulary, not just a bare prompt.
2. **Add editorial value** the templates lack: band descriptors explained, common mistakes, sample answers — turns a "question page" into a "lesson."
3. **Canonicalize / consolidate** near-duplicate variants; avoid indexing thin auto-generated permutations from `ingest_queue` output until editorially reviewed (the review queue already exists — enforce it before publishing to `status='published'`).
4. **Gate ads, not content:** never add more ad units to thin pages to juice RPM — that's exactly what triggers policy review.
5. As subscription revenue grows, **AdSense dependence should fall**; if policy risk ever bites, the business still stands on subscriptions.

---

## 7. Risks & mitigations

| Risk | Reality | Mitigation |
|---|---|---|
| **"IELTS" trademark** | IELTS is a registered trademark (British Council / IDP / Cambridge). Using it in the brand/domain (`ielts-bank.com`) and marketing carries real risk. | Add a clear **"not affiliated with or endorsed by the IELTS partners"** disclaimer in footer + about + checkout. Use "IELTS" descriptively ("practice for the IELTS exam"), never implying official status. Avoid official logos. Have a fallback brand name ready; keep the trademark-safe descriptive positioning. Consider IP counsel before scaling paid ads on the brand term. |
| **Refunds / chargebacks** (exam-prep is high-dispute: buyers dispute after their test date or after "not enough time") | Chargebacks can carry fees and threaten processor standing. | **Chargeback liability is now ours (Stripe, we are MoR)** — Stripe Radar on, prepaid hero SKU favored. Favor the 6-month **prepaid** hero SKU over rolling monthly (fewer renewal disputes). Clear refund policy (e.g. pro-rated / 7-day). PPP pricing reduces the fraud-heavy "full price in a low-income region" cohort. Deliver value fast (instant first score) so disputes are rarer. |
| **Seasonality** | IELTS demand spikes around intake/admissions cycles; summer/holiday lulls. | The 6-month/annual SKUs smooth cash across troughs. AdSense floor persists year-round. Plan content pushes ahead of known intake peaks. |
| **AdSense policy** (low-value templated pages; invalid traffic) | Account suspension would zero the current revenue line. | §6.3 mitigations; editorial review queue gating; diversify to subscription revenue so AdSense isn't load-bearing. |
| **LLM cost blow-out from abuse** | A scripted attacker could burn LLM spend via the scoring route. | Server-side metering (§5) caps free usage; auth required for scoring; rate-limit per IP/user; premium is bounded by human essay-writing speed. COGS at 0.3–1.3¢/score stays negligible. |
| **Scoring trust** (our differentiator) | If AI bands feel arbitrary, the product dies. | Rubric-anchored scoring using seeded `rubrics`; store `model` + `rubric_id` on every `scores` row for auditability; show per-criterion reasoning; calibrate against known-band sample essays. |

---

## 8. Prioritized build checklist — "what to build first to start earning"

Mapped to the roadmap: **auth → metering → paywall → analytics.** Ship in this order; each step is releasable.

### Phase A — Foundation (no revenue, unblocks everything)
1. **Wire Supabase Auth**: anonymous sign-in on load; Google OAuth + email magic-link upgrade (triggers already built in `0006`). Verify `attempts`/`scores` survive the anon→identified upgrade.
2. **Front-end account state**: read `users` + `user_quotas` via RLS for display.

### Phase B — Metering (no revenue, builds the demo + the wall)
3. **Writing scoring API route** (`pages/api/score/writing.js`, server/service-role): prompt + rubric → LLM → insert `attempts` + `scores` (per-criterion `criteria`, `model`, `rubric_id`, `feedback_html`).
4. **Transactional meter RPC** (§5): `FOR UPDATE` decrement of `user_quotas.ai_scores_remaining` + reset logic; return 402 on exhaustion.
5. **Paywall modal** triggered on HTTP 402.

### Phase C — Minimum Viable Paid Launch  ← **first money**
6. **Add billing columns** to `users` (§4.2) + service-role-only write trigger; premium daily counters + realtime meter on `user_quotas`.
7. **Stripe setup**: one Premium product, 6 prices by `lookup_key` (3 global + 3 PPP); promo-code support for launch discounts and E2E verification.
8. **Checkout**: `POST /api/billing/checkout` → server-resolved price (geo → PPP) → Stripe Checkout redirect.
9. **Webhook route** (`pages/api/webhooks/stripe.js`): signature verify + idempotent upsert of `plan`/`plan_status`/`plan_renews_at`/`stripe_*` (§4.4).
10. **Gate in the scoring route**: premium bypasses the free meter into fair-use daily caps (§5.3); free uses the 3/30-day meter.
11. **AdSense gate**: hide ads when `plan='premium'`.
12. **/pricing page** + **Basic billing/account section** + link to Stripe Customer Portal for cancel/update.

> **MVP-paid-launch = steps 1–12.** That is: auth, one scored skill (Writing), server-side free meter, Stripe Checkout + webhook, `users.plan` gate, ad-free perk. Nothing else is required to take the first dollar. Target this before any dashboard work.

### Phase D — Retention & expansion (after money flows)
13. **Progress analytics** dashboard from `attempts` + `scores` time series (premium perk).
14. **Speaking scoring** (audio → transcript → `scores` with `skill='speaking'`).
15. **PDF export** of band report (premium).
16. **Full timed mock mode** (bundle 4 skills, combined band).
17. **Annual-plan push + win-back** emails to reduce churn / lift ARPU.

---

## 9. Realtime AI Speaking Examiner (premium flagship feature)

> **Status: SHIPPED 2026-07-17** — `/speaking-examiner` (WebRTC client), `/api/realtime/session` (metered mint, refund-on-failure), `/api/score/speaking-realtime` (post-interview `gpt-5.1` rubric pass). Verified live: mint + metering + scoring + persistence; the voice conversation itself was validated by component (automated E2E cannot capture microphone audio).

**Decision (2026-07-17):** build Speaking's premium tier on the OpenAI Realtime voice API — a live AI examiner that conducts the full 3-part IELTS interview (adaptive Part 1 questions, timed Part 2 cue card with 1-min prep, probing Part 3 follow-ups), instead of only the current record → Whisper → transcript-score pipeline.

### 9.1 Why

1. **Real exam simulation** — the actual test is an 11–14 min live interview; a static cue card can't simulate adaptive follow-ups, interruptions, or timing. This is the largest gap between our product and the exam.
2. **Unlocks the 4th criterion** — the model hears audio natively, enabling pronunciation/intonation *feedback* (qualitative only; do not issue a pronunciation *band* until calibrated — AI pronunciation banding reliability is unproven).
3. **Competitive parity** with the voice-first cohort (Sprechify $11–23/mo, SmallTalk2Me, Langogh, ielts.international) while keeping our price undercut.

### 9.2 Architecture (hybrid)

- **Conduct** the interview on **`gpt-realtime-2.1-mini`** ($10/$20 per 1M audio tokens; ~$0.02–0.05/min with prompt caching — caching is mandatory: the API re-bills full conversation history each turn, ~98.75% discount cached). Client connects to OpenAI directly via WebRTC; our API route only mints short-lived ephemeral session tokens **after** the minutes-quota check, with hard session-duration caps.
- **Score** afterwards with the existing `gpt-5.1` rubric-anchored pass over the captured transcript/audio (scoring trust stays in the strong text model — the voice model is the examiner, not the grader).
- Flagship `gpt-realtime-2.1` ($32/$64) only if mini's examiner persona proves inadequate in testing — it consumes an entire PPP month's revenue in 3–4 mocks, so it is not the default.

### 9.3 Cost & metering

| | Per full 14-min mock | Per 5-min drill |
|---|---|---|
| Realtime mini (cached) | ~$0.30–0.70 | ~$0.10–0.25 |
| Realtime flagship | ~$1.00–1.60 | ~$0.35–0.55 |
| (Current async pipeline) | ~$0.02–0.03/score | — |

- **Metered in minutes, not scores**: premium includes **60 min/mo** (global) / **30 min/mo** (PPP) — ≈4 full mocks. Schema: `user_quotas.realtime_seconds_remaining` + `realtime_period_resets_at`, seeded on subscription activation and refilled on renewal (webhook).
- **Free tier:** no Realtime access; optional one-time **3-min taster** (~10–15¢ COGS) as a paywall demo.
- **Never unlimited** — unbounded Realtime would require ~$15–20/mo pricing and surrenders our price positioning.
- **Abuse surface:** a live session burns money per-minute; quota check happens **before** token mint, sessions carry server-set max duration, and per-IP rate limits apply to the mint route.

### 9.4 Expected P&L impact

At the moderate scenario (600 subs, ~40% speaking adoption, ~4 mocks/mo avg on mini): **~$300–650/mo COGS vs ~$2,500 MRR** — material but fine, and it should lift conversion/retention in the voice-first competitor cohort we currently concede.

---

## Appendix — Unit economics & sources

**Per-score COGS (2026 model prices):** a Writing Task 2 evaluation is ~1.5–3k input tokens (essay + rubric + instructions) and ~0.8–1.5k output tokens. At GPT-4o mini ($0.15/$0.60 per 1M in/out) or Gemini 2.0/3.x Flash ($0.10/$0.40) that is **~0.1–0.3¢** single-pass; a two-pass or stronger-model paid score, or Speaking with transcription, pushes it to **~0.4–1.3¢**. Even a power subscriber scoring 100 items/month costs **<$1.30** in LLM spend against ~$4–10 revenue.

**Infra fixed cost (2026):** Supabase Pro **$25/mo**, Vercel Pro **$20/mo** (+usage, realistically ~$40–70 at moderate traffic). Total platform floor **~$50–100/mo** — covered by the AdSense floor alone; every subscriber is near-pure margin after Stripe's ~3–4% (fees + Stripe Tax/Billing overhead).

**Sources (2026):**
- Paddle fees & MoR: [paddle.com/pricing](https://www.paddle.com/pricing), [Paddle VAT/GST handling](https://www.paddle.com/help/sell/tax/how-paddle-handles-vat-on-your-behalf), [Paddle taxable countries](https://www.paddle.com/help/sell/tax/which-countries-does-paddle-charge-sales-tax-or-vat-for)
- Competitor pricing: [OpenIELTS](https://www.openielts.org/pricing), [IELTS Mocks](https://www.ieltsmocks.com/), [Sprechify comparison](https://sprechify.com/blog/top-ielts-practice-platforms-comparison), [ielts.international](https://www.ielts.international/pricing), [Magoosh IELTS plans](https://ielts.magoosh.com/plans)
- LLM pricing: [Gemini vs GPT-4o mini (langcopilot)](https://langcopilot.com/gemini-2.0-flash-vs-gpt-4o-mini-pricing), [LLM pricing July 2026 (BenchLM)](https://benchlm.ai/llm-pricing)
- Infra: [Supabase pricing](https://supabase.com/pricing), [Vercel pricing](https://vercel.com/pricing)
- PPP for SaaS: [Dodo Payments — PPP pricing](https://dodopayments.com/blogs/purchasing-power-parity-pricing-saas)
