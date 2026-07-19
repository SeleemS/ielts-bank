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

- Status: `FIXED`
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
- Verification: focused SEO contract tests, full 27-file/174-test Vitest suite, ESLint, analytics
  audit, and the 527-page production build. The live production HTML returned every expected
  OG/Twitter field, the OG and Twitter image URLs matched, and the card endpoint returned HTTP 200
  with a non-empty `image/png` response.

## CA-009 — Live Speaking Examiner links had no social share metadata

- Status: `FIXED`
- Area: Speaking examiner / Open Graph / Twitter cards
- Severity: Medium
- Evidence: the generated and production `/speaking-examiner` page had a title, description, and
  canonical URL but supplied no Open Graph or Twitter metadata for the site's flagship Premium
  feature.
- Fix: add a shared examiner SEO contract, a dedicated Speaking Examiner card label, complete
  1200×630 Open Graph metadata, and matching Twitter large-card fields.
- Regression coverage: `lib/speakingExaminerSeo.test.js` verifies the canonical route, content
  contract, and every decoded dynamic image parameter.
- Commit: `Add examiner social share metadata`
- Verification: focused SEO contract tests, full 28-file/176-test Vitest suite, ESLint, analytics
  audit, generated HTML inspection, and the 527-page production build. Live production returned
  every expected OG/Twitter field, matching OG/Twitter image URLs, and an HTTP 200 non-empty
  `image/png` social card.

## CA-010 — Writing Checker shares had no preview image

- Status: `FIXED`
- Area: Writing checker / Open Graph / Twitter cards
- Severity: Medium
- Evidence: `/ielts-writing-checker` supplied OG title, description, URL, and a Twitter large-card
  declaration but omitted both OG and Twitter image fields, so the large-card contract was
  incomplete and shares remained text-only.
- Fix: centralize the Writing Checker SEO contract and add a dedicated 1200×630 Writing card with
  complete OG image attributes plus matching Twitter title, description, and image fields.
- Regression coverage: `lib/writingCheckerSeo.test.js` verifies canonical content and every decoded
  dynamic image parameter.
- Commit: `Add Writing Checker share image`
- Verification: focused SEO contract tests, full 29-file/178-test Vitest suite, ESLint, analytics
  audit, generated HTML inspection, and the 527-page production build. Live production returned
  every OG/Twitter field, matching OG/Twitter images, and an HTTP 200 non-empty `image/png` card.

## CA-011 — Band Calculator shares had no preview image

- Status: `FIXED`
- Area: Band calculator / Open Graph / Twitter cards
- Severity: Medium
- Evidence: `/band-calculator` declared a Twitter large card and supplied OG text fields, but omitted
  OG/Twitter images and Twitter title/description fields. The free acquisition tool therefore
  produced an incomplete, text-only share preview.
- Fix: centralize the calculator SEO contract and add a dedicated 1200×630 calculator card with
  complete OG image fields and matching Twitter title, description, and image metadata.
- Regression coverage: `lib/bandCalculatorSeo.test.js` verifies canonical content and every decoded
  dynamic image parameter.
- Commit: `Add Band Calculator share image`
- Verification: focused SEO contract tests, full 30-file/180-test Vitest suite, ESLint, analytics
  audit, generated HTML inspection, and the 527-page production build. Live production returned
  every OG/Twitter field, matching OG/Twitter images, and an HTTP 200 non-empty `image/png` card.

## CA-012 — About-page links had no controlled share preview

- Status: `FIXED`
- Area: About / trust content / Open Graph / Twitter cards
- Severity: Medium
- Evidence: `/about` had canonical title and description metadata but no Open Graph or Twitter
  fields, leaving shared trust/mission links without a controlled preview.
- Fix: add a shared About SEO contract, a mission-specific 1200×630 card, complete Open Graph
  metadata, and matching Twitter large-card fields.
- Regression coverage: `lib/aboutSeo.test.js` verifies canonical content and every decoded dynamic
  image parameter.
- Commit: `Add About page share metadata`
- Verification: focused SEO contract tests, full 31-file/182-test Vitest suite, ESLint, analytics
  audit, generated HTML inspection, and the 527-page production build. Live production returned
  every OG/Twitter field, matching OG/Twitter images, and an HTTP 200 non-empty `image/png` card.

## CA-013 — Contact-page links had no controlled share preview

- Status: `FIXED`
- Area: Contact / trust content / Open Graph / Twitter cards
- Severity: Medium
- Evidence: `/contactus` had canonical title and description metadata but no Open Graph or Twitter
  fields, so shared support links could not display a controlled preview.
- Fix: add a shared Contact SEO contract, a contact-specific 1200×630 card, complete Open Graph
  metadata, and matching Twitter large-card fields.
- Regression coverage: `lib/contactSeo.test.js` verifies canonical content and every decoded dynamic
  image parameter.
- Commit: `Add Contact page share metadata`
- Verification: focused SEO contract tests, full 32-file/184-test Vitest suite, ESLint, analytics
  audit, generated HTML inspection, and the 527-page production build. Live production returned
  every OG/Twitter field, matching OG/Twitter images, and an HTTP 200 non-empty `image/png` card.

## CA-014 — Privacy Policy links had no controlled share preview

- Status: `FIXED`
- Area: Privacy / legal trust / Open Graph / Twitter cards
- Severity: Low
- Evidence: `/privacypolicy` exposed canonical title and description metadata but no Open Graph or
  Twitter fields, leaving shared privacy/compliance links without a controlled preview.
- Fix: add a shared Privacy SEO contract, a privacy-specific 1200×630 card, complete Open Graph
  metadata, and matching Twitter large-card fields.
- Regression coverage: `lib/privacySeo.test.js` verifies canonical content and every decoded dynamic
  image parameter.
- Commit: `Add Privacy Policy share metadata`
- Verification: focused SEO contract tests, full 33-file/186-test Vitest suite, ESLint, analytics
  audit, generated HTML inspection, and the 527-page production build. Live production returned
  every OG/Twitter field, matching OG/Twitter images, and an HTTP 200 non-empty `image/png` card.

## CA-015 — Terms links had no controlled share preview

- Status: `FIXED`
- Area: Terms / billing trust / Open Graph / Twitter cards
- Severity: Low
- Evidence: `/termsofservice` had canonical title and description metadata but no Open Graph or
  Twitter fields, leaving shared billing, cancellation, and refund-policy links without a controlled
  preview.
- Fix: add a shared Terms SEO contract, a terms-specific 1200×630 card, complete Open Graph
  metadata, and matching Twitter large-card fields.
- Regression coverage: `lib/termsSeo.test.js` verifies canonical content and every decoded dynamic
  image parameter.
- Commit: `Add Terms page share metadata`
- Verification: focused SEO contract tests, the complete current-worktree 35-file/196-test Vitest
  suite, ESLint, analytics audit, generated HTML inspection, the 527-page production build, and the
  clean Vercel build from the committed fix. Live production returned every OG/Twitter field,
  matching OG/Twitter images, and an HTTP 200 non-empty `image/png` card.

## CA-016 — Band Estimator declared a large Twitter card without its fields

- Status: `FIXED`
- Area: Band estimator / acquisition / Open Graph / Twitter cards
- Severity: Medium
- Evidence: generated `/band-estimator` HTML declared `summary_large_image` but omitted
  `twitter:title`, `twitter:description`, and `twitter:image`. Its Open Graph image also lacked
  dimensions, MIME type, and accessible alt text.
- Fix: centralize the Band Estimator SEO contract and publish a dedicated 1200×630 estimator card
  with complete Open Graph image metadata plus matching Twitter title, description, image, and alt
  fields.
- Regression coverage: `lib/bandEstimatorSeo.test.js` verifies canonical content and every decoded
  dynamic image parameter.
- Commit: `Complete Band Estimator share metadata`
- Verification: focused 2-test SEO coverage, the complete current-worktree 36-file/198-test Vitest
  suite, ESLint, analytics audit, exact generated metadata inspection, and the 527-page production
  build. The clean Vercel build from the committed fix reached `Ready` with the production aliases.
  Live production returned every expected OG/Twitter field, matching OG/Twitter images, and an HTTP
  200 non-empty `image/png` card.

## CA-017 — Practice-bank shares relied on incomplete Twitter fallback metadata

- Status: `FIXED`
- Area: Reading / Listening / Writing / Speaking / social sharing
- Severity: Medium
- Evidence: the generated-site audit found 475 practice-bank and section routes that declared
  `summary_large_image` and a Twitter image but omitted explicit `twitter:title` and
  `twitter:description`; image alt text was also absent. Open Graph fallback is not a complete,
  consistently portable Twitter/X card contract.
- Fix: add explicit title, description, image, and image-alt fields to all five shared practice
  templates, covering every Reading, Listening, Writing, and Speaking landing/exercise route.
- Regression coverage: `lib/practiceTwitterMetadata.test.js` checks the complete large-card contract
  and correct dynamic title/description source in every affected template.
- Commit: `Complete practice share metadata`
- Verification: focused 6-template regression coverage, the complete current-worktree
  37-file/204-test Vitest suite, ESLint, analytics audit, exact generated metadata inspection across
  all 475 affected routes, and the 527-page production build. The clean Vercel build from the
  committed fix reached `Ready` with the production aliases. Live production probes across all six
  shared template shapes returned HTTP 200, complete large-card fields, and HTTP 200 `image/png`
  cards.

## CA-018 — Social-card images were not described for Twitter/X users

- Status: `FIXED`
- Area: Sitewide SEO / social sharing / accessibility
- Severity: Low
- Evidence: after the practice-template fix, the generated-site audit found 46 remaining indexable
  routes with a Twitter image but no `twitter:image:alt`. The affected routes covered the home
  page, blog, mock tests, Reading hubs, acquisition tools, and trust/legal pages; dynamic pricing
  had the same template omission.
- Fix: reuse each page's controlled Open Graph image description as `twitter:image:alt` across all
  14 affected templates.
- Regression coverage: `lib/twitterImageAltMetadata.test.js` enumerates every affected shared
  template and prevents any Twitter image from losing its accessible description.
- Commit: `Describe Twitter share images`
- Verification: focused 14-template regression coverage, the complete current-worktree
  38-file/218-test Vitest suite, ESLint, analytics audit, and the 527-page production build. Exact
  generated-site inspection found zero missing title, description, canonical, Open Graph, Twitter
  card, or Twitter image-alt fields across all 522 indexable static pages. The clean Vercel build
  from the committed fix reached `Ready` with the production aliases. Live verification passed on
  all 47 affected routes, including dynamic pricing; all Twitter descriptions matched their Open
  Graph counterparts. Fourteen representative card images covered every template and returned HTTP
  200 non-empty `image/png` responses.

## Investigation notes

- Footer trademark quotation marks initially appeared escaped in serialized browser output.
  Direct DOM text verification confirmed that the live page renders normal quotation marks; no
  defect or code change was recorded.
