# ielts-bank.com — Monetization Plan

**Status:** Implementation-ready blueprint
**Last updated:** 2026-07-09
**Owner:** Founder / eng
**Scope:** How ielts-bank.com goes from free + AdSense to a paid, AI-scoring subscription business without breaking its SEO engine.

> This document is the source of truth for pricing, gating, payments, and rollout. It maps every gate to the **real** Supabase schema already provisioned (`users`, `user_quotas`, `attempts`, `scores`, plus `passages/question_groups/questions/answer_keys`). It does not re-litigate the strategy established in the prior research pass (Paddle as merchant-of-record; keep content free as the SEO moat; differentiator = trustworthy rubric-anchored scoring). It builds on it with concrete numbers.

---

## 0. TL;DR

- **Free forever:** all practice content (Reading/Listening passages, questions, auto-scoring, band conversion). This is the SEO engine and must never be paywalled.
- **Gated (the product we sell):** AI scoring of Writing & Speaking (rubric-anchored, per-criterion feedback), unlimited scores, progress analytics, an ad-free experience, and mock-test / export features.
- **Free metering:** anonymous = **1** free AI score (lifetime, to sample), signed-in free = **3** AI scores per rolling 30 days — enforced server-side by a transactional decrement of `user_quotas.ai_scores_remaining`, never trusted from the client.
- **Prices (USD, global list):** **$9.99/mo**, **hero SKU $29.99 / 6 months (~$5/mo)**, **$44.99/year (~$3.75/mo)**. PPP tiers ~55% off for India/MENA/SEA (e.g. $3.99/mo, $14.99/6-mo).
- **Payments:** **Paddle** (merchant-of-record). It remits VAT/GST/sales tax in 200+ countries, owns chargeback liability, and supports UPI/PayPal/Apple-Google Pay and localized/PPP pricing — the three things a solo, globally-distributed exam-prep site cannot build itself.
- **MVP paid launch:** Supabase Auth (anon → Google/email) → server-side metering → Writing scoring API → Paddle checkout + webhook → `users.plan` gate. Everything else (analytics dashboards, speaking, exports) ships after money is flowing.

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

- **Trigger to advance:** Paddle account approved; webhook endpoint deployed; `users.plan` column live.
- **Free:** content + auto-scoring + the metered free AI scores + basic own-history view + ads.
- **Gated (Premium):** unlimited AI scores; progress analytics; ad-free; export; full mock mode; stronger scoring model.
- **Schema mapping (exact):**
  - `users.plan` in (`free`,`premium`) — the gate the scoring route checks.
  - `users.plan_status` (`active`,`past_due`,`canceled`,`refunded`).
  - `users.plan_renews_at` (timestamptz).
  - `users.paddle_customer_id`, `users.paddle_subscription_id` — reconcile webhooks → user.
  - Scoring route logic: if `plan='premium'` and `plan_status='active'` → skip the `user_quotas` decrement (unlimited); else run the metered path.
- **Prereqs:** Stage 2; Paddle products/prices created; webhook handler (§4); billing UI.
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

The majority of IELTS demand — and of this site's traffic — is India, Pakistan, Bangladesh, Nigeria, Egypt, Gulf, Philippines, Vietnam. Paddle supports per-country localized pricing in 30+ currencies; use it to set **~55% off** in these markets:

| SKU | Global | PPP (India/MENA/SEA) |
|---|---|---|
| Monthly | $9.99 | **$3.99** |
| 6-month (hero) | $29.99 | **$14.99** |
| Annual | $44.99 | **$19.99** |

PPP is not optional here: a $9.99 global price is a hard wall in ₹/₨ markets, and unauthorized-region full-price sales drive chargebacks. Setting PPP prices in Paddle both lifts conversion and cuts fraud/refund rates. (Paddle also enables local rails like **UPI** at checkout, which is the single biggest conversion lever for Indian traffic.)

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

## 4. Payments implementation (Paddle on Next.js + Supabase)

### 4.1 Why Paddle (rationale)

- **Merchant of Record:** Paddle is the legal seller; it registers/remits **VAT, Indian GST, and sales tax in 200+ countries**. A solo operator cannot legally handle India GST + EU VAT + Gulf VAT alone — this is the deciding factor.
- **Chargeback liability sits with Paddle**, not us (critical for exam-prep, which sees high dispute rates — §7).
- **Localized + PPP pricing** in 30+ currencies and **local payment methods** (UPI, PayPal, Apple/Google Pay) out of the box.
- **Cost:** headline **5% + $0.50** per transaction (effective ~6–7% with FX). On a $29.99 hero sale that's ~$2.00; entirely acceptable given it removes all tax/compliance/dispute overhead. Stripe would be ~2.9% but leaves us as merchant-of-record for global tax — a non-starter here.

### 4.2 Schema additions (columns to add to existing tables)

```
-- public.users  (add):
  plan                  text    not null default 'free',   -- 'free' | 'premium'
  plan_status           text    not null default 'inactive',-- 'active'|'past_due'|'canceled'|'refunded'|'inactive'
  plan_renews_at        timestamptz,
  plan_started_at       timestamptz,
  paddle_customer_id    text,     -- unique, indexed
  paddle_subscription_id text,    -- unique, indexed

-- public.user_quotas  (already sufficient; used only for FREE tier metering):
  ai_scores_remaining   int         -- exists
  period_resets_at      timestamptz -- exists
```

Add a unique index on `users.paddle_subscription_id` for idempotent webhook upserts. Keep all plan writes **service-role only** (RLS: client may read own `users` row but not update `plan*` — extend the `0005` policy so `plan*` columns are not client-updatable; simplest is to gate updates through a `SECURITY DEFINER` function or restrict the update policy to non-plan columns).

### 4.3 Environment variables (exact names)

```
# Supabase (server-side privileged writes)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...        # server only — webhook + scoring route

# Paddle
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=...  # Paddle.js checkout (public, safe)
NEXT_PUBLIC_PADDLE_ENV=production    # 'sandbox' | 'production'
PADDLE_API_KEY=...                   # server only — verify/read subscriptions
PADDLE_WEBHOOK_SECRET=...            # server only — verify webhook signatures
PADDLE_PRICE_ID_MONTHLY=pri_...
PADDLE_PRICE_ID_6MONTH=pri_...
PADDLE_PRICE_ID_ANNUAL=pri_...

# Scoring
SCORING_MODEL_FREE=...               # cheaper model id for the free meter
SCORING_MODEL_PAID=...               # stronger model id for subscribers
LLM_API_KEY=...
```

### 4.4 Integration outline (this stack)

**Checkout (client):** load Paddle.js with `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, open an overlay checkout for the chosen `PADDLE_PRICE_ID_*`, passing the Supabase `users.id` as `customData.user_id` so the webhook can map back. Paddle auto-applies the localized/PPP price for the buyer's country.

**Webhook (server — `pages/api/webhooks/paddle.js`):**
1. Read raw body, verify the `Paddle-Signature` header against `PADDLE_WEBHOOK_SECRET`. Reject on mismatch.
2. Use the Supabase **service role** client (never the anon key) to write.
3. Handle events idempotently, keyed on `paddle_subscription_id`:
   - `subscription.created` / `subscription.activated` → set `users.plan='premium'`, `plan_status='active'`, `plan_started_at=now()`, `plan_renews_at`, `paddle_customer_id`, `paddle_subscription_id` for the `user_id` in `customData`.
   - `subscription.updated` → refresh `plan_renews_at` / status.
   - `subscription.past_due` → `plan_status='past_due'` (keep access through a grace window, then downgrade).
   - `subscription.canceled` → `plan_status='canceled'`; **retain premium until `plan_renews_at`** (cancel = don't renew, not instant revoke).
   - `transaction.completed` (one-time, if any) → same activation path.
   - `adjustment.created` (refund/chargeback) → `plan_status='refunded'`, `plan='free'` immediately.
4. Return 200 fast; do the DB write before responding but keep it lean (webhook has a timeout).

**Gating check (server — inside the scoring API route):** before calling the LLM, load the user's `users.plan`/`plan_status`. If `premium` + `active`/`canceled-not-yet-expired` → allow, no decrement. Else run the free-meter transaction (§5). Never trust a client-sent "isPremium" flag.

**Upgrades / cancellations / refunds:**
- Upgrade/downgrade between SKUs → Paddle proration; we just consume the resulting `subscription.updated` webhook.
- Cancellation → user cancels via Paddle customer portal (link them there); we react to `subscription.canceled`, access persists to period end.
- Refund/chargeback → `adjustment.created` webhook flips them to free instantly; Paddle absorbs the chargeback fee/liability.

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
| **Refunds / chargebacks** (exam-prep is high-dispute: buyers dispute after their test date or after "not enough time") | Chargebacks can carry fees and threaten processor standing. | **Paddle (MoR) absorbs chargeback liability.** Favor the 6-month **prepaid** hero SKU over rolling monthly (fewer renewal disputes). Clear refund policy (e.g. pro-rated / 7-day). PPP pricing reduces the fraud-heavy "full price in a low-income region" cohort. Deliver value fast (instant first score) so disputes are rarer. |
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
6. **Add billing columns** to `users` (§4.2) + service-role-only write policy.
7. **Paddle setup**: create the 3 SKUs + PPP price overrides for India/MENA/SEA; sandbox test.
8. **Checkout**: Paddle.js overlay with `user_id` in `customData`.
9. **Webhook route** (`pages/api/webhooks/paddle.js`): signature verify + idempotent upsert of `plan`/`plan_status`/`plan_renews_at`/`paddle_*` (§4.4).
10. **Gate in the scoring route**: premium bypasses the meter; free uses it.
11. **AdSense gate**: hide ads when `plan='premium'`.
12. **Basic billing/account page** + link to Paddle customer portal for cancel/update.

> **MVP-paid-launch = steps 1–12.** That is: auth, one scored skill (Writing), server-side free meter, Paddle checkout + webhook, `users.plan` gate, ad-free perk. Nothing else is required to take the first dollar. Target this before any dashboard work.

### Phase D — Retention & expansion (after money flows)
13. **Progress analytics** dashboard from `attempts` + `scores` time series (premium perk).
14. **Speaking scoring** (audio → transcript → `scores` with `skill='speaking'`).
15. **PDF export** of band report (premium).
16. **Full timed mock mode** (bundle 4 skills, combined band).
17. **Annual-plan push + win-back** emails to reduce churn / lift ARPU.

---

## Appendix — Unit economics & sources

**Per-score COGS (2026 model prices):** a Writing Task 2 evaluation is ~1.5–3k input tokens (essay + rubric + instructions) and ~0.8–1.5k output tokens. At GPT-4o mini ($0.15/$0.60 per 1M in/out) or Gemini 2.0/3.x Flash ($0.10/$0.40) that is **~0.1–0.3¢** single-pass; a two-pass or stronger-model paid score, or Speaking with transcription, pushes it to **~0.4–1.3¢**. Even a power subscriber scoring 100 items/month costs **<$1.30** in LLM spend against ~$4–10 revenue.

**Infra fixed cost (2026):** Supabase Pro **$25/mo**, Vercel Pro **$20/mo** (+usage, realistically ~$40–70 at moderate traffic). Total platform floor **~$50–100/mo** — covered by the AdSense floor alone; every subscriber is near-pure margin after Paddle's ~6–7%.

**Sources (2026):**
- Paddle fees & MoR: [paddle.com/pricing](https://www.paddle.com/pricing), [Paddle VAT/GST handling](https://www.paddle.com/help/sell/tax/how-paddle-handles-vat-on-your-behalf), [Paddle taxable countries](https://www.paddle.com/help/sell/tax/which-countries-does-paddle-charge-sales-tax-or-vat-for)
- Competitor pricing: [OpenIELTS](https://www.openielts.org/pricing), [IELTS Mocks](https://www.ieltsmocks.com/), [Sprechify comparison](https://sprechify.com/blog/top-ielts-practice-platforms-comparison), [ielts.international](https://www.ielts.international/pricing), [Magoosh IELTS plans](https://ielts.magoosh.com/plans)
- LLM pricing: [Gemini vs GPT-4o mini (langcopilot)](https://langcopilot.com/gemini-2.0-flash-vs-gpt-4o-mini-pricing), [LLM pricing July 2026 (BenchLM)](https://benchlm.ai/llm-pricing)
- Infra: [Supabase pricing](https://supabase.com/pricing), [Vercel pricing](https://vercel.com/pricing)
- PPP for SaaS: [Dodo Payments — PPP pricing](https://dodopayments.com/blogs/purchasing-power-parity-pricing-saas)
