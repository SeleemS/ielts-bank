# Continuous Site Audit Log

This ledger records each confirmed issue found during the continuous site audit, the evidence used
to reproduce it, the implemented fix, and the verification completed before the fix was pushed.
False positives are kept in the investigation notes so they are not rediscovered as defects.

## Baseline — 2026-07-19

- Branch and remote: clean `main`, aligned with `origin/main`.
- Unit/component/API tests: 19 files, 153 tests passing.
- Static analysis: ESLint passing with zero warnings.
- Interaction analytics audit: 126 files, 260 interactive elements, 9 forms, 6 dialogs, zero
  uncaptured handlers or parse errors.
- Dependency audit: 588 dependencies, zero known vulnerabilities.
- Production build: 527 pages generated successfully with live Supabase data.
- Payment verification promo discovered in the Stripe provisioning script: `E2EVERIFY100`
  (100% off, E2E-only).

## CA-001 — Auth callback was indexable

- Status: `FIXED`
- Area: Auth / SEO / metadata
- Severity: Medium
- Evidence: the built `/auth/callback` HTML contained only the global
  `robots=max-image-preview:large` directive and no route-level `noindex`. The route is a transient
  credential-processing page and should never appear in search results.
- Fix: added a descriptive title and `robots=noindex, nofollow` metadata to the auth callback.
- Regression coverage: `tests/auth-callback-page.test.jsx` renders the route and asserts both metadata
  contracts.
- Commit: `Fix auth callback indexability`
- Verification: targeted regression test, full Vitest suite, ESLint, production build, generated
  HTML metadata check, and live deployment check.

## CA-002 — Server error page was indexable and unhelpful

- Status: `FIXED`
- Area: Error handling / SEO / metadata
- Severity: Medium
- Evidence: the generated and production `/500` page contained only
  `robots=max-image-preview:large`, no title, and the framework's generic 500 response.
- Fix: added a branded, dependency-light 500 page with a descriptive title,
  `robots=noindex, nofollow`, a recovery link, and a support link.
- Regression coverage: `tests/server-error-page.test.jsx` asserts the metadata, learner-facing
  heading, and both recovery paths.
- Commit: `Fix server error page indexability`
- Verification: targeted regression test, full Vitest suite, ESLint, production build, generated
  HTML metadata check, and live deployment check.

## CA-003 — Mock-test pages had no social share cards

- Status: `FIXED`
- Area: Open Graph / Twitter cards / mock tests
- Severity: Medium
- Evidence: the generated mock-test hub and all five published mock pages had a title, description,
  and canonical URL but no `og:title`, `og:description`, `og:url`, or `og:image`. Shared links
  therefore had no controlled preview card.
- Fix: added a shared mock SEO contract, complete Open Graph and Twitter large-card metadata on the
  hub and detail routes, URL-safe dynamic image parameters, and a mock-specific OG image label.
- Regression coverage: `lib/mockSeo.test.js` verifies complete hub metadata and safe dynamic route
  and image encoding.
- Commit: `Add mock test share metadata`
- Verification: focused metadata tests, full Vitest suite, ESLint, production build, six generated
  HTML metadata checks, OG image response check, and live deployment checks.

## CA-004 — Reading strategy hubs had text-only social shares

- Status: `FIXED`
- Area: Open Graph / Twitter cards / Reading hubs
- Severity: Medium
- Evidence: all 13 generated `/reading/[type]` strategy pages had OG title, description, and URL
  fields but no OG image or Twitter image metadata.
- Fix: added a shared Reading-hub SEO contract and complete OG/Twitter image metadata to the
  dynamic hub template, with a distinct card title and question-type subtitle per route.
- Regression coverage: `lib/readingQuestionTypes.test.js` verifies complete, unique, URL-safe
  metadata for every one of the 13 configured hubs and rejects unknown route keys.
- Commit: `Add Reading hub share images`
- Verification: focused metadata tests, full Vitest suite, ESLint, production build, all 13
  generated HTML metadata checks, OG image response check, and live deployment checks.

## CA-005 — Pricing and billing routes loaded AdSense

- Status: `FIXED`
- Area: Pricing / payments / runtime quality
- Severity: High
- Evidence: live browser QA on `/pricing` loaded the AdSense runtime and recorded the third-party
  warning `AdSense head tag doesn't support data-nscript attribute` plus an uncaught promise error.
  Ads also added avoidable latency and distraction to checkout and post-checkout surfaces.
- Fix: extracted the site ad-route policy and excluded `/pricing`, pricing success/cancel query
  states, and all `/billing/*` routes from AdSense loading.
- Regression coverage: `src/lib/adPolicy.test.js` checks every ad-free acquisition/account/payment
  route and confirms editorial/list pages remain eligible.
- Commit: `Keep payment routes ad free`
- Verification: focused policy tests, full Vitest suite, ESLint, analytics audit, production build,
  generated bundle inspection, and clean live pricing/billing console checks.

## CA-006 — E2E payment promotion could not be reused

- Status: `FIXED`
- Area: Payments / Stripe / E2E operations
- Severity: High
- Evidence: the production Stripe Checkout rejected the configured `E2EVERIFY100` code as invalid.
  Stripe API inspection confirmed that its 100%-off coupon was still valid and the promotion had
  redemptions remaining, but the promotion itself was inactive. The catalog setup script reported
  this state without repairing it.
- Fix: make the explicit E2E setup mode reactivate a valid, redeemable test promotion, create a
  replacement only when necessary, and add a separate explicit teardown mode that deactivates every
  active matching promotion. Ordinary catalog setup still never changes the E2E promotion.
- Regression coverage: `scripts/stripe-e2e-promo-policy.test.js` covers reusable inactive,
  already-active, exhausted, expired, invalid-coupon, and teardown states.
- Commit: `Make Stripe E2E promo reusable`
- Verification: focused policy tests, full Vitest suite, ESLint, analytics audit, production build,
  and an authenticated production Checkout using `E2EVERIFY100`. Checkout produced a paid $0 invoice,
  activated the monthly Premium entitlement in Stripe and Supabase, exposed the Premium onboarding
  state, and opened the authenticated Stripe Customer Portal. Teardown immediately canceled the
  subscription, confirmed the webhook downgrade, deactivated every matching E2E promotion, deleted
  the Stripe customer and disposable Supabase auth user, and confirmed no public user row remained.

## CA-007 — Portal cancellation is not mapped as a non-renewing plan

- Status: `FIXED`
- Area: Billing / Stripe webhooks / entitlement messaging
- Severity: High
- Evidence: the production Stripe Customer Portal successfully scheduled cancellation and displayed
  “Cancels Aug 19,” but the authoritative Subscription object used `cancel_at` with
  `cancel_at_period_end=false`. The current subscription mapper checks only
  `cancel_at_period_end`, so Supabase remained `premium/active` and retained renewal messaging even
  though Stripe had a definite cancellation timestamp.
- Fix: treat either cancellation representation as scheduled cancellation, persist the exact
  access-end date, show explicit “will not renew” billing copy, and suppress the pause offer once
  cancellation is scheduled.
- Regression coverage: subscription mapper and webhook tests cover both cancellation shapes and
  preserve entitlement without resetting quota; billing display tests cover non-renewal wording and
  ensure canceled plans cannot be paused.
- Commit: `Handle Stripe scheduled cancellations`
- Verification: focused billing/webhook/API/display tests, full 26-file/172-test Vitest suite,
  ESLint, analytics audit, and the 527-page production build. A second authenticated production
  Checkout and Customer Portal cancellation reproduced Stripe's explicit `cancel_at` shape; Supabase
  then stored `premium/canceled` with the matching access-end instant. Live pricing and billing pages
  showed non-renewal copy, the pause offer was absent, and a direct authenticated pause request
  returned HTTP 409. Teardown immediately canceled the subscription, confirmed the webhook downgrade,
  deactivated the E2E promotion, deleted the Stripe customer and disposable auth user, and confirmed
  no public user row remained.
- Investigation safety: the disposable E2E subscription was canceled immediately after capturing
  the evidence, which correctly downgraded the test user before account cleanup.

## CA-008 — Pricing links had no controlled social share card

- Status: `IN VERIFICATION`
- Area: Pricing / Open Graph / Twitter cards
- Severity: Medium
- Evidence: production `/pricing` supplied a title, description, and canonical URL but no Open Graph
  or Twitter metadata. Links to the core acquisition page therefore had no controlled image, title,
  or description when shared.
- Fix: add a shared pricing SEO contract, a pricing-specific dynamic card label, full 1200×630
  Open Graph image metadata, and matching Twitter large-card fields.
- Regression coverage: `lib/pricingSeo.test.js` verifies the canonical contract, exact card URL, and
  URL-safe dynamic image parameters.
- Commit: `Add pricing social share metadata`
- Verification: pending production deployment and live metadata/image response checks.

## Investigation notes

- Footer trademark quotation marks initially appeared escaped in serialized browser output.
  Direct DOM text verification confirmed that the live page renders normal quotation marks; no
  defect or code change was recorded.
