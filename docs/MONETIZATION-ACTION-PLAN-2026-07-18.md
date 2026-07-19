# ielts-bank.com — Monetization Action Plan — 2026-07-18

Companion to [MONETIZATION-AUDIT-2026-07-18.md](MONETIZATION-AUDIT-2026-07-18.md). Sequenced for one person. Sizing: **S** = hours, **M** = 1–2 days, **L** = 3–5 days.

---

## If you only do five things

1. **Close the analytics loop (S, half a day).** One `activity_events` insert + `premium_since`/`plan_sku` columns in the Stripe webhook, one client event on `?checkout=success`. Until this ships you cannot know whether anything else on this list works. Files: `lib/billing.js`, `pages/pricing.js`, one migration.
2. **Restore the demo — one free teased writing score (M).** Signed-in users get 1 free AI writing score (cheap model) whose result shows the overall band + ONE criterion in full, with the other three criteria, examiner summary, and corrected examples rendered blurred/locked behind "Unlock full feedback — Premium." The paywall moves *after* the value moment, and the result itself becomes the ad. Revert the zero-free decision in a v6 migration; wire `SCORING_MODEL_FREE` for real.
3. **Make the paywall landing contextual (S).** `pages/pricing.js` must read `?upgrade=writing|speaking` and render "✍️ Your essay is saved and waiting — unlock your score." above the plans. You already saved their work; say so at the moment it matters.
4. **Kill every false "free" claim and publish refund terms (S–M).** Fix `lib/posts.js:38,197`, the footer "FREE TOOLS" grouping, checker hero/meta, About page; add a billing/refund section to ToS and a 14-day money-back guarantee line on /pricing. One founder-day that removes a bait-and-switch and adds the market's table-stakes risk reversal.
5. **Fix the PPP country list (S, 10 minutes).** Remove SA/AE/QA/KW/BH/OM (and SY/IR/SD) from `lib/billing.js:21-32`. Gulf candidates are full-price buyers; today they get 55% off. This is the only item on this list that is pure found money.

---

## Week 1–2 quick wins

Ordered by (impact ÷ effort). Each: what → files → mechanism → proof metric.

### QW1. Subscription-activated event + premium_since (S) — *do first*
- **Change:** In `handleStripeEvent` `checkout.session.completed` branch (`lib/billing.js:170-185`): insert `activity_events` row `{event:'subscription_activated', user_id, props:{sku, ppp, amount}}`; also on `customer.subscription.deleted` insert `subscription_canceled`. Migration: `users.premium_since timestamptz`, `users.plan_sku text` (set both in `mapSubscriptionToPlanFields`, `lib/billing.js:84-111`). Client: in `pages/pricing.js` `?checkout=success` effect (`:69,156`), fire `track('purchase_success')`.
- **Mechanism:** makes checkout→paid, churn, MRR-by-source computable (audit §6.1).
- **Proof:** `subscription_activated` rows appear; weekly funnel query runs end-to-end.

### QW2. PPP list fix (S)
- **Change:** `lib/billing.js:21-32` — remove `SA AE QA KW BH OM SY IR SD`.
- **Mechanism:** Gulf buyers pay list price (audit §4.2).
- **Proof:** `subscription_activated.props.ppp='0'` share rises for AE/SA `country` rows in `activity_events`.

### QW3. Contextual pricing header (S)
- **Change:** `pages/pricing.js` — read `router.query.upgrade`; when `writing|speaking`, render a banner: "Your {essay|recording} is saved to your account. Unlock your score and full examiner feedback below." Fire `track('paywall_view',{source: upgrade})` on mount.
- **Mechanism:** repairs the highest-intent moment (audit §3 Journey 2, gate table F-grades); also closes the `paywall_view` measurement gap.
- **Proof:** `paywall_view{source:writing}` → `checkout_start` CTR vs. the pre-change `paywall_redirect`→`checkout_start` baseline (computable retroactively once QW1 lands).

### QW4. Truth pass on "free" claims (S)
- **Change:** `lib/posts.js:38,197` (reword to "AI writing checker — Premium, with a free sample score" once QW-free-score ships, or just drop "free" now); footer nav group rename (`src/components/Footer.js` "FREE TOOLS" → "Tools"); `pages/ielts-writing-checker.js:432,469` hero/meta ("instant band score" → "instant AI band score for Premium members — try your first score free" post-#2); `src/pages/AboutUs.js:68-70`; add "never call paid features free" rule + /pricing awareness to `scripts/content/generate-blog-post.mjs:25`.
- **Mechanism:** stops manufacturing distrust at the paywall (audit §2.2).
- **Proof:** grep returns no "free.*checker|checker.*free" in content; bounce rate on checker from blog referrals (source param) stops diverging.

### QW5. Refund policy + guarantee (S legal-copy, M if adding portal config)
- **Change:** ToS billing section (`src/pages/TermsOfService.js`): plan terms, renewal, cancellation, 14-day money-back. /pricing footnote + hero-card line: "14-day money-back guarantee." Optionally configure the Stripe portal with cancellation reasons (`pages/api/billing/portal.js:50-53` — pass a `configuration` with `cancellation_reason` collection).
- **Mechanism:** table-stakes risk reversal (5+ competitors have MBG, audit §1.3); chargeback defense; legal hygiene for a live MoR.
- **Proof:** checkout_start→paid rate (measurable after QW1); refund requests stay <5% of subs.

### QW6. Trust block on /pricing (M)
- **Change:** `pages/pricing.js` — add: (a) the existing `SAMPLE_FEEDBACK` report component from `ielts-writing-checker.js:194-221` ("What your feedback looks like"); (b) a short FAQ with the ChatGPT answer ("Generic chatbots over-score IELTS essays by half a band or more and skip Task Response — our scoring is anchored to the official band descriptors, criterion by criterion"); (c) free-vs-premium comparison table; (d) the guarantee (QW5).
- **Mechanism:** answers the objections at the decision point (audit §2.3, §1.1).
- **Proof:** /pricing → checkout_start CTR.

### QW7. Gate instrumentation holes (S)
- **Change:** `pages/speaking-examiner.js:587` fire `premium_gate{source:'speaking_examiner'}` on gate render; `src/components/AiQuotaPanel.jsx:20` fire modal impression; `pages/mock/[slug].js:79-82` add onClick `paywall_upgrade_click{source:'mock'}`.
- **Proof:** per-gate CTR table computable (audit §6.2).

### QW8. Exam date at onboarding (S)
- **Change:** `src/components/auth/SignInDialog.jsx:40-45` onboarding step — add "When is your test?" (date or "not booked yet"); store alongside goal/target_band; show it back on dashboard hero.
- **Mechanism:** unlocks deadline-driven merchandising (QW9, roadmap R3) for the most deadline-driven audience in edtech (audit §2.6, §7.2).
- **Proof:** % of new signups with exam date; later, conversion of exam-date-known vs unknown.

### QW9. Deadline framing on /pricing (S, needs QW8)
- **Change:** if exam date known: "Your test is in {n} weeks — the 6-month plan covers your whole prep (and a retake, just in case)." under the hero card.
- **Mechanism:** honest urgency from real data — no fake timers.
- **Proof:** hero-SKU share of `checkout_start{sku}`.

---

## The free-score restoration (the big Week-2 build)

**#2 of the five things — spec'd separately because it's the conversion engine.**

- **Migration (v6 of `consume_ai_score`):** signed-in non-premium users: 1 free **writing** score lifetime (keep speaking premium-only — audio COGS and the examiner is the flagship anyway). Reuse the inert `ai_scores_remaining` machinery (`supabase/migrations/20260718120000` reverses cleanly; the v2 meter logic at `20260717130000:161-184` is the template). Return `{allowed:true, free:true}` so the route can pick the model.
- **Route:** `pages/api/score/writing.js` — implement the `SCORING_MODEL_FREE` split for real (`:27, 393`); free scores run the mini-class model (~0.1–0.3¢, `docs/MONETIZATION.md:413`).
- **Result UI (the tease):** in the shared `ScoreReport` (`src/pages/WritingQuestion.js:83-156`, checker `:87-155`): when `free:true`, render band hero + first criterion card fully; criteria 2–4, Examiner Summary, How to Improve, and Corrected Examples render with `blur-sm` + lock overlay: "Your Band {n} essay has {k} fixable issues — unlock the full breakdown." CTA → `/pricing?upgrade=writing` (which QW3 made contextual).
- **Anonymous users:** keep the current signup gate (it converts sign-ups well — audit §3 Journey 1b); the free score is the signup reward. Update gate copy: "Create a free account to get your first AI score."
- **Events:** `ai_score_result{outcome:'ok', free:true}`, lock-overlay impression + `paywall_upgrade_click{source:'score_tease'}`.
- **Cost exposure:** 1 × mini-model score per account lifetime; abuse bounded by existing per-IP limits + auth requirement. Worst realistic case: 1,000 signups/mo × 0.3¢ = $3/mo.
- **Proof metric (the experiment that matters):** signup→checkout_start rate before/after; target ≥2× within 30 days.

---

## 30 / 60 / 90-day roadmap (sequenced by dependency)

### Days 0–30 — Measure, then repair the funnel
1. QW1 analytics loop → **everything else becomes measurable** (do on day 1).
2. QW2 PPP fix, QW4 truth pass, QW5 refund/ToS, QW7 instrumentation (day 1–3).
3. QW3 contextual paywall + QW6 pricing trust block (week 1).
4. Free-score restoration build (week 2).
5. QW8/QW9 exam date capture + framing (week 2).
6. Webhook safety net (M): read `session_id` on `/pricing?checkout=success` → new endpoint `POST /api/billing/verify-session` → `stripe.checkout.sessions.retrieve` → run the same `mapSubscriptionToPlanFields` upsert. Kills the paid-but-free stranding (audit §8.4). Verify the webhook URL in Stripe matches `https://www.ielts-bank.com/api/webhooks/stripe` exactly and recent deliveries are green.
7. Harden `speaking-realtime.js` (S): copy the global fail-closed bucket from `speaking.js:405-411`; make the per-IP check fail closed (audit §8.1).

### Days 30–60 — Convert and activate (requires the measurement layer)
8. **Premium day-1 activation (M):** replace the success banner with a real success state: "You're in. Do this first:" → [Score the essay you wrote] (it's saved) / [Meet your examiner — 60 min this month] / [Sit a mock]. Mirror the speaking recovery banner (`SpeakingQuestion.js:1048-1056`) for writing.
9. **Email v1 (M–L):** pick the ESP (Resend is already integrated — use it), then exactly three sends: (a) welcome-on-signup with the free-score CTA, (b) welcome-on-purchase with the day-1 checklist, (c) weekly newsletter digest (the promise already made to subscribers). Wire `newsletter_subscribers` + `users` segmentation free/paid.
10. **Dashboard upsell for free users (S):** empty Writing/Speaking trend charts get "Unlock AI scoring to see your writing band trend →" instead of a generic nudge; move the Settings membership card copy onto the Overview tab for free users.
11. **Band-calculator + blog CTAs (S):** calculator result → "Get your real Writing band checked"; blog template (`pages/blog/[slug].js:124`) adds one product CTA block above the newsletter.
12. **Localized price display (M):** show PPP prices on /pricing via the geo header (SSR or edge) — "Priced for your region: ₹…" (audit §4.2).
12b. **Band Estimator mini-diagnostic (M–L, ~3–4 days):** free anonymous 15-min level test that measures R/L from the question bank and funnels the W/S uncertainty into the checker/examiner — full spec in [BAND-ESTIMATOR-PLAN-2026-07-18.md](BAND-ESTIMATOR-PLAN-2026-07-18.md). Best shipped after QW1 (measurable) and ideally after the free-score restoration (its Writing CTA lands on a working demo).

### Days 60–90 — Pricing experiments (requires 30–60's measurement + trust base)
13. **Exam Pass SKU experiment (M):** one-time, non-renewing, e.g. $14.99 / 4 weeks full Premium (PPP $6.99). New Stripe price (`mode:'payment'` + a `plan_expires_at` column checked by `fetchIsPremium`, or a subscription with `cancel_at`), fourth card on /pricing: "Test soon? One payment, no subscription."
14. **Annual reprice/reframe (S):** either $39.99 or reposition ("covers a retake cycle"); decide with 60 days of `checkout_start{sku}` data.
15. **Cancel flow v1 (M):** Stripe portal configuration with reason collection + a pre-portal interstitial offering pause (for post-test users) and the Exam Pass downgrade.
16. **Win-back (S, needs email):** 30 days after cancel/expiry: "Retaking? Your history is still here — 40% off one month."
17. Mock-test server-side gating (M) — close the `__NEXT_DATA__` leak (audit §8.3) once the above is shipped.

---

## Experiments (hypothesis → change → metric → read)

**Traffic assumption (GA4 not accessible to this audit — UNVERIFIED):** assumed ~10k–50k sessions/mo and single-digit daily `checkout_start`s. At this volume, A/B splits won't reach significance on paid conversion in reasonable time — run these as **sequential before/after reads on 2-week windows**, using upstream micro-conversions (gate CTR, checkout_start) as primary metrics and paid as directional. If GA shows <5k sessions/mo, double all durations.

| # | Hypothesis | Change | Primary metric (event) | Success threshold | Duration / min volume |
|---|---|---|---|---|---|
| E1 | A teased free score converts better than a hard wall | Free-score restoration (above) | `signup_verified` → `checkout_start` rate; guardrail: signups/day don't fall | ≥2× baseline rate | 2–4 wks; ≥200 signups/window |
| E2 | Contextual paywall beats generic | QW3 banner | `paywall_view{source:writing}` → `checkout_start` | ≥1.3× vs. retro-computed baseline | 2 wks; ≥300 paywall views |
| E3 | Risk reversal lifts checkout completion | QW5/QW6 guarantee + trust block | `checkout_start` → `subscription_activated` | ≥1.25×; refunds <5% | 4 wks; ≥100 checkout_starts |
| E4 | One-time Exam Pass captures subscription-averse buyers | Roadmap #13, 4th card | Incremental `subscription_activated{sku:exam_pass}`; guardrail: hero-SKU volume −<20% | Pass ≥15% of all conversions, total conversions +≥10% | 4 wks; ≥150 checkout_starts |
| E5 | Visible PPP pricing lifts PPP-market conversion | Roadmap #12 | pricing `page_view`→`checkout_start` for PPP `country` rows | ≥1.5× for PPP cohort | 2–4 wks; ≥500 PPP pricing views |

---

## Do-NOT-do list

- **Do not gate Reading/Listening content or answers behind login/payment.** The SEO moat is the acquisition engine (`docs/MONETIZATION.md:28-37`). The current anon gate (1 scored submit per skill, content fully crawlable) is the outer limit — do not tighten it.
- **Do not add fake urgency** — no countdown timers on discounts that reset, no "3 spots left." The audience is deadline-driven already; use *their* exam date (QW8/QW9), which is honest urgency.
- **Do not dark-pattern cancellation** (blueprint non-goal, `MONETIZATION.md:48`). Save offers = one interstitial with a real pause/downgrade, then the portal. Exit must stay one click past that.
- **Do not stuff more ad units on templated pages** to juice RPM — that's the AdSense low-value-content trigger (`MONETIZATION.md:317-324`). Ads stay off scoring/results/paywall surfaces.
- **Do not claim examiner accuracy you can't support.** Competitors claim ±0.3 bands; do not copy the number without a calibration run. The honest version ("anchored to the official band descriptors, criterion by criterion — and we show you the reasoning") is strong enough until you calibrate against known-band essays (`MONETIZATION.md:337` already plans this).
- **Do not client-pick PPP prices** — keep selection server-side (`checkout.js:72-83`); a client-chosen PPP price is a coupon anyone can abuse (`MONETIZATION.md:187`).
- **Do not build a product-analytics stack** (PostHog etc.) before QW1's single event proves insufficient. The Supabase pipeline is good.
- **Do not launch paid ads on "IELTS" brand terms** before the trademark posture is reviewed (`MONETIZATION.md:332`) — the disclaimer footprint is currently one line on /pricing.

---

## Owner checklist (things only the founder can do)

1. **Stripe dashboard:** verify the 6 lookup-key prices exist (incl. `_ppp` variants); check webhook endpoint URL (`https://www.ielts-bank.com/api/webhooks/stripe`) and recent delivery success; confirm Radar is on. **UNVERIFIED in this audit.**
2. **Vercel env:** confirm `STRIPE_AUTOMATIC_TAX=1` in production (else Stripe Tax is silently off — MoR compliance risk, audit §4.2).
3. **Vercel domains:** flip the apex→www redirect from 307 to permanent (308).
4. **Supabase auth email templates:** confirm OTP templates render `{{ .Token }}` and carry brand voice. **UNAUDITED** (dashboard-only).
5. Rotate the exposed service-role key (still outstanding from the July 16 audit, `AUDIT-ACTION-PLAN-2026-07.md` 1.5).
6. Update or archive `docs/PROGRESS.md` (says billing is gated on Paddle) and `docs/MONETIZATION.md` §5 (free meter) once the free-score decision above is made — the source-of-truth doc currently describes a product that no longer exists.
