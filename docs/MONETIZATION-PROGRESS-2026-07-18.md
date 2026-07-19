# Monetization Action Plan Progress

Source: `docs/MONETIZATION-ACTION-PLAN-2026-07-18.md`

Last updated: 2026-07-19

## Status legend

- `IMPLEMENTED` — code and/or migration is present; final production verification is still pending
- `VERIFIED` — acceptance behavior has been exercised in the final verification pass
- `OWNER` — external dashboard/account action that cannot be safely completed from repository code alone

## Week 1–2 and free-score conversion engine

- QW1 `IMPLEMENTED` — Stripe activation/cancellation events, idempotent billing event IDs, `premium_since`, `plan_sku`, client `purchase_success`, and authenticated checkout-session reconciliation.
- QW2 `IMPLEMENTED` — SA, AE, QA, KW, BH, OM, SY, IR, and SD removed from PPP eligibility; tests cover the full-price list.
- QW3 `IMPLEMENTED` — Writing/Speaking saved-work banners and `paywall_view` measurement.
- QW4 `IMPLEMENTED` — blog, footer, checker, About, generator prompt, and monetization source-of-truth copy now distinguish free content, the one free Writing sample, and Premium features.
- QW5 `IMPLEMENTED` — 14-day money-back guarantee on Pricing and a complete billing/refund section in Terms.
- QW6 `IMPLEMENTED` — Pricing includes a real sample report, generic-chatbot objection handling, free/Premium comparison, guarantee, and four offer cards.
- QW7 `IMPLEMENTED` — Speaking examiner, quota modal, and mock-gate impression/click instrumentation.
- QW8 `IMPLEMENTED` — onboarding captures an optional exam date in a first-class column with a prefs fallback; Dashboard shows the deadline.
- QW9 `IMPLEMENTED` — Pricing uses the signed-in learner’s real exam date for honest plan framing.
- Free Writing score `IMPLEMENTED` — `consume_ai_score` v6 grants one lifetime linked-account Writing sample, rejects anonymous-auth bypasses, keeps Speaking Premium-only, routes the sample to `SCORING_MODEL_FREE`, returns `free:true`, and uses a shared result component that reveals the band plus first criterion while locking the rest behind a measured Premium CTA. Provider failures restore the consumed unit through an idempotent, service-role-only refund.

## Days 0–30

- Checkout reconciliation `IMPLEMENTED` — `/api/billing/verify-session` validates ownership and reuses the webhook activation path.
- Realtime scoring hardening `IMPLEMENTED` — per-IP and global rate-limit infrastructure now fail closed.
- Stripe webhook configuration `OWNER` — verify the exact live webhook URL and recent deliveries in Stripe after deployment.

## Days 30–60

- Premium day-1 activation `IMPLEMENTED` — successful checkout shows saved-work, examiner, and mock next actions.
- Email v1 `IMPLEMENTED` — confirmed-signup welcome, purchase welcome, segmented weekly digest, and consented win-back delivery run through Resend. The outbox uses provider idempotency, bounded retries, stale-claim recovery, delivery-time unsubscribe suppression, and signed unsubscribe links.
- Dashboard upsell `IMPLEMENTED` — Overview membership pitch and Writing/Speaking trend-specific locked states.
- Calculator/blog CTAs `IMPLEMENTED` — result-level Writing checker CTA and one product CTA above every blog newsletter.
- Regional display `IMPLEMENTED` — trusted server geography controls visible regional prices; the client cannot select PPP eligibility.
- Band Estimator `VERIFIED` — anonymous 20-question Reading/Listening diagnostic, honest Writing/Speaking ranges, local resume/baseline persistence, dashboard hook, analytics, SEO/FAQ schema, launch article, and sitewide links; mobile production-browser flow completed with zero console errors.

## Days 60–90

- Exam Pass `IMPLEMENTED` — fourth one-time 28-day SKU, PPP variant, webhook entitlement, realtime quota, authoritative expiry checks across server/client/email segmentation, refund/dispute revocation, and non-renewal copy.
- Annual framing `IMPLEMENTED` — positioned around a preparation/retake cycle without changing the live price before evidence exists.
- Cancellation `IMPLEMENTED` — in-app keep/pause/Exam Pass choices, 30-day Stripe collection pause, and a managed Stripe portal configuration with cancellation reasons and period-end cancellation.
- Win-back `IMPLEMENTED` — 30-day canceled-user eligibility, idempotent email, and server-validated 40% Monthly checkout path when the Stripe coupon environment value is configured.
- Mock gating `IMPLEMENTED` — static page props contain metadata only; full sections/questions/answers come from an authenticated Premium-only no-store endpoint.

## External owner checklist

1. `OWNER` — create the two missing Exam Pass lookup-key prices. A live read-only check confirmed the other six global/PPP prices and amounts.
2. `OWNER` — add `invoice.paid` to the enabled Stripe events. The exact live URL is correct and enabled; all other required event types are present.
3. `OWNER` — finish Stripe Tax setup (`pending` in the live account), confirm Radar, and add `STRIPE_AUTOMATIC_TAX=1` to Vercel Production.
4. `OWNER` — create a 40%-off Monthly coupon and set `STRIPE_WINBACK_COUPON_ID`.
5. `OWNER` — verify the Resend sending domain and set `EMAIL_FROM`; `RESEND_API_KEY` is present in Vercel Production.
6. `OWNER` — change the apex-to-www redirect from the verified current 307 to permanent 308 in Vercel.
7. `OWNER` — verify Supabase OTP templates render `{{ .Token }}` and rotate the previously exposed service-role/database credentials.

## Review checkpoints

- Checkpoint 1: `git diff --check` passed; ESLint passed with zero warnings; Vitest passed after expanding billing mocks and adding PPP/Exam Pass assertions.
- Checkpoint 2: review fixed required `anon_id` values on billing telemetry and preserved realtime quota through a pause while enforcing entitlement separately.
- Checkpoint 3: integrated and completed the linked Band Estimator plan; its 49 focused tests pass inside the full suite.
- Checkpoint 4: lifecycle delivery review added stale-worker recovery, current-consent enforcement immediately before marketing sends, write-error handling, a dedicated stale-claim index, and five focused tests.
- Checkpoint 5: free-sample review closed the anonymous-auth token bypass and added transactional, retry-safe quota compensation for model errors/timeouts; route tests prove rejection happens before metering and provider failure invokes the exact refund.
- Checkpoint 6: entitlement review fixed indefinite access after Exam Pass expiry, cleared pass access on refunds, resolved Stripe disputes through their Charge object, and aligned weekly email segmentation with the shared entitlement rule.
- Checkpoint 7: activation/lifecycle review keyed purchase onboarding to each Checkout Session; Speaking now refunds its daily unit on every pre-result failure and immediately deletes uploaded voice data on transcription/validation failures.
- Final local verification: `git diff --check`, ESLint, 16 test files / 130 tests, `npm audit` with zero vulnerabilities, and a Next 15.5.20 production build with 527 static pages all pass.
- Browser QA: 375px anonymous estimator flow reached a 6.0 result with skipped measured sections and completed W/S ranges; contextual Writing pricing rendered all four plans, trust content, guarantee, and comparison table; both pages had zero browser console warnings/errors.
- API QA: unsigned Writing, Premium mock payload, and checkout reconciliation all reject with `401`; unauthorized lifecycle cron rejects with `401`; invalid unsubscribe token rejects with `400`; static mock HTML is metadata-only.
- Production database migration: isolated dry-run contains exactly `20260719010159_monetization_funnel_and_free_writing_score.sql`; live schema probes confirm the monetization columns, free-Writing marker, billing event key, and lifecycle outbox are not present yet. Production apply is pending explicit live-schema approval.
- GitHub/Vercel: the verified implementation was pushed directly to `main`; Vercel Production reached Ready and `/band-estimator`, contextual `/pricing`, and `/billing/manage` returned `200` with the new content. Redundant draft PR #7 was closed. Preview remains unable to build because Supabase variables are scoped only to Production.
