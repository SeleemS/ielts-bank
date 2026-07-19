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

## CA-019 — Speaking exercises had no structured learning-resource data

- Status: `FIXED`
- Area: Speaking / structured data / SEO
- Severity: Medium
- Evidence: all 80 generated Speaking exercise pages exposed canonical and social metadata but no
  JSON-LD. Search engines could not identify the pages as free IELTS learning resources or infer
  their Home → Speaking → Exercise hierarchy.
- Fix: publish a canonical `LearningResource` and three-level `BreadcrumbList` graph on every
  Speaking exercise, including part, difficulty, educational purpose, language, and skills taught.
  Serialize the graph with HTML-significant characters escaped before embedding it in the page.
- Regression coverage: `lib/speakingQuestionSeo.test.js` verifies the canonical learning-resource
  contract, exact breadcrumb hierarchy, and safe serialization against a script-closing payload.
- Commit: `Add Speaking exercise structured data`
- Verification: focused 3-test schema coverage, the complete current-worktree 39-file/221-test
  Vitest suite, ESLint, analytics audit, and the 527-page production build. Exact generated HTML
  inspection parsed and validated the canonical learning-resource and breadcrumb graph on all 80
  Speaking exercise pages. The clean Vercel build from the committed fix reached `Ready` with the
  production aliases. Live production verification fetched and parsed all 80 pages with zero
  failures; every resource and final breadcrumb matched the page canonical and every page returned
  HTTP 200.

## CA-020 — Writing exercises had no structured learning-resource data

- Status: `FIXED`
- Area: Writing / structured data / SEO
- Severity: Medium
- Evidence: all 167 generated Writing exercise pages exposed canonical and social metadata but no
  JSON-LD. Search engines could not identify each prompt as a free, timed IELTS learning resource
  or infer its Home → Writing → Exercise hierarchy.
- Fix: publish a canonical `LearningResource` and three-level `BreadcrumbList` graph on every
  Writing exercise, including task number, expected 20/40-minute duration, difficulty, educational
  purpose, language, and skills taught. Escape HTML-significant characters before embedding.
- Regression coverage: `lib/writingQuestionSeo.test.js` verifies Task 1/2 timing, the canonical
  learning-resource contract, exact breadcrumb hierarchy, and safe script serialization.
- Commit: `Add Writing exercise structured data`
- Verification: focused 4-test schema coverage, the complete current-worktree 40-file/225-test
  Vitest suite, ESLint, analytics audit, and the 527-page production build. Exact generated HTML
  inspection parsed and validated the canonical learning-resource, 20/40-minute duration, and
  breadcrumb graph on all 167 Writing exercise pages. The clean Vercel build from the committed fix
  reached `Ready` with the production aliases. Live production verification fetched and parsed all
  167 canonical exercise URLs with zero failures; every resource and final breadcrumb matched the
  page canonical, every duration was valid, and every page returned HTTP 200.

## CA-021 — Mock-test pages had no structured collection or resource data

- Status: `FIXED`
- Area: Mock tests / pricing clarity / structured data / SEO
- Severity: Medium
- Evidence: the mock-test hub and all five published mock pages had complete canonical/social
  metadata but no JSON-LD. Search engines could not identify the hub as a collection or the tests
  as timed IELTS learning resources, and the machine-readable metadata did not express that access
  requires Premium.
- Fix: publish a canonical `CollectionPage`/`ItemList` on the hub and a timed
  `LearningResource`/`BreadcrumbList` graph on each mock. The resource contract accurately marks
  the content as paid, names the Premium access condition, and includes duration and section count.
- Regression coverage: `lib/mockStructuredData.test.js` verifies the collection items, paid-access
  contract, duration/section data, canonical breadcrumb hierarchy, and safe script serialization.
- Commit: `Add mock-test structured data`
- Verification: focused 4-test schema coverage, the complete current-worktree 41-file/229-test
  Vitest suite, ESLint, analytics audit, and the 527-page production build. Exact generated HTML
  inspection parsed and validated the five-item collection plus all five paid resource graphs,
  durations, sections, access conditions, canonicals, and breadcrumbs. The clean Vercel build from
  the committed fix reached `Ready` with the production aliases. Live production returned HTTP 200
  and valid JSON-LD on all six routes: a five-item collection, three 60-minute/three-section Reading
  mocks, and two 40-minute/four-section Listening mocks, all accurately marked as paid.

## CA-022 — Four API 405 responses omitted their allowed method

- Status: `FIXED`
- Area: API endpoints / HTTP contracts / cron / newsletter
- Severity: Low
- Evidence: a safe live wrong-method sweep of all 18 method-restricted API routes found that 14
  returned HTTP 405 with an `Allow` header, while the three GET-only cron handlers and GET-only
  newsletter unsubscribe route returned 405 without naming the supported method.
- Fix: add `Allow: GET` to every affected method-rejection path, matching the established contract
  used by the rest of the API.
- Regression coverage: `lib/apiMethodContracts.test.js` invokes each affected handler with POST and
  asserts the 405 status, `Allow: GET`, and completed response.
- Commit: `Complete API method contracts`
- Verification: focused 4-handler contract coverage, the complete current-worktree
  42-file/233-test Vitest suite, ESLint, analytics audit, and the 527-page production build. The
  clean Vercel build from the committed fix reached `Ready` with the production aliases. The safe
  live wrong-method sweep then passed all 18 endpoints: every route returned HTTP 405 and its exact
  supported `Allow` value, with no endpoint action executed.

## CA-023 — Sitemap omitted two indexable acquisition pages

- Status: `FIXED`
- Area: Sitemap / crawlability / pricing / Speaking examiner
- Severity: Medium
- Evidence: the live sitemap advertised 471 unique, healthy canonical URLs, but a comparison with
  the indexable page inventory found that `/pricing` and `/speaking-examiner` were absent. Both are
  public canonical acquisition pages and should be discoverable through the sitemap.
- Fix: add both stable routes to the static sitemap inventory without changing any existing URL.
- Regression coverage: `lib/sitemapRoutes.test.js` requires every major acquisition/conversion route
  and rejects duplicate or private/system entries.
- Commit: `Add acquisition pages to sitemap`
- Verification: focused 2-test inventory coverage, the complete current-worktree
  43-file/235-test Vitest suite, ESLint, analytics audit, and the 527-page production build. The
  clean Vercel build from the committed fix reached `Ready` with the production aliases. The live
  sitemap then contained exactly 473 unique locations, including both restored routes; a no-redirect
  crawl of every URL found zero non-200 responses, duplicates, redirects, or canonical mismatches.

## CA-024 — Named AI crawlers were allowed into protected paths

- Status: `FIXED`
- Area: robots.txt / crawl control / private and API routes
- Severity: Medium
- Evidence: live robots parsing showed that GPTBot, ClaudeBot, PerplexityBot, and Google-Extended
  each matched a specific group containing only `Allow: /`. Specific user-agent groups do not
  inherit the wildcard group's exclusions, so those bots were permitted to crawl `/dashboard`,
  `/api/`, and `/auth/` despite the site's stated public-content-only intent.
- Fix: consolidate the four named crawlers into one explicit group that welcomes public-content
  crawling while repeating all protected-path exclusions.
- Regression coverage: `lib/robotsPolicy.test.js` parses the actual robots file and verifies the
  wildcard and every named crawler against all three exclusions plus the canonical sitemap.
- Commit: `Protect private routes from named crawlers`
- Verification: focused 6-test crawler-policy coverage, the complete current-worktree
  44-file/241-test Vitest suite, ESLint, analytics audit, and the 527-page production build. The
  clean Vercel build from the committed fix reached `Ready` with the production aliases. Live
  robots parsing confirmed HTTP 200 text output, public-content access plus all three exclusions for
  every named crawler, matching wildcard exclusions, and the canonical sitemap declaration.

## CA-025 — AdSense rejected the framework-modified script tag

- Status: `FIXED`
- Area: Advertising / browser console / revenue / route policy
- Severity: Medium
- Evidence: signed-out production browser QA on the homepage logged `AdSense head tag doesn't
  support data-nscript attribute`. The framework script component adds `data-nscript`, which is
  not part of Google's supported async AdSense tag.
- Fix: load the official-shape async AdSense script directly and idempotently on allowed public
  routes, remove it when ads become disallowed, and retain the existing public-host and route
  policy. Google Analytics continues to use the framework loader separately.
- Regression coverage: `src/lib/adsenseLoader.test.js` verifies the exact three-attribute tag,
  publisher URL encoding, absence of `data-nscript`, idempotence, and removal on disallowed routes.
- Commit: `Load AdSense without unsupported attributes`
- Verification: focused 3-test loader coverage, the complete current-worktree 45-file/244-test
  Vitest suite, ESLint, the 134-file analytics audit, and the 527-page production build. Production
  browser QA on the clean deployment confirmed the exact publisher URL, native `async` and
  `crossorigin` attributes, no `data-nscript`, exactly one loader on the homepage, zero loaders on
  the ad-free pricing route, and exactly one clean loader after navigating back home. The original
  unsupported-tag warning did not recur.

## CA-026 — Global Sign in controls opened the signup form

- Status: `FIXED`
- Area: Authentication / navbar / desktop and mobile navigation
- Severity: Medium
- Evidence: signed-out production browser QA showed that selecting the global `Sign in` control
  opened a dialog titled `Create your free account`, with a `Create account` primary action and a
  new-password field. Existing users had to discover and select a second sign-in switch.
- Fix: preserve the caller's authentication intent in navbar state, open explicit sign-in controls
  in sign-in mode, and keep question-page `Create account` controls in signup mode.
- Regression coverage: `src/components/Navbar.test.jsx` exercises desktop and mobile sign-in
  controls plus a question-page create-account control, asserting the exact initial dialog mode.
  The navbar source now uses a `.jsx` extension so the component itself is parsed and exercised by
  the existing Vitest/Vite setup; all application imports remain extensionless.
- Commit: `Open the requested authentication mode`
- Verification: focused 3-test component coverage, the complete current-worktree
  46-file/247-test Vitest suite, ESLint, the 135-file analytics audit, and the 527-page production
  build. The pushed commit's deployment status completed successfully. Fresh production browser
  QA confirmed that the homepage `Sign in` control opens `Welcome back`, a current-password field,
  and sign-in recovery options, while a live Reading question's `Create account` control still
  opens the signup form with a new-password field.

## CA-027 — Contact analytics misclassified users and omitted failures

- Status: `FIXED`
- Area: Contact form / analytics / conversion diagnostics
- Severity: Medium
- Evidence: the contact form hard-coded every successful `contact_submit` event as
  `signed_in: false`, even when an authenticated learner submitted it. API rejections and network
  failures displayed an error to the visitor but emitted no outcome event, making failure rates
  and signed-in usage impossible to measure accurately.
- Fix: derive `signed_in` from the active auth user and emit bounded `success`, `error`, and
  `network_error` outcomes with HTTP status only; no name, email, or message enters analytics.
- Regression coverage: `src/pages/ContactUs.test.jsx` submits the actual component through
  signed-in success, API-rejection, and network-failure paths and asserts the exact privacy-safe
  event payloads. The page now uses a `.jsx` extension so Vitest/Vite can exercise the component
  directly, and the existing Twitter-image metadata inventory follows the rename.
- Commit: `Track contact submission outcomes accurately`
- Verification: focused 17-test component/metadata coverage, the complete current-worktree
  47-file/250-test Vitest suite, ESLint, the 136-file analytics audit, and the 528-page production
  build. The deployment completed successfully. A fresh production browser submission deliberately
  exceeded the 5,000-character server limit, displayed the correct rejection, wrote no contact
  message, and produced a live `contact_submit` row containing only `path=/contactus`,
  `outcome=error`, `signed_in=false`, and `status=400`.
- Related live form QA: newsletter invalid-email blocking, successful signup, persistence,
  duplicate non-enumeration, cross-origin rejection, and forged-unsubscribe-token rejection passed.
  Contact native validation, successful submission/reset, persistence, API validation, and
  cross-origin rejection also passed. All disposable newsletter and contact rows were deleted and
  verified absent.

## CA-028 — Newsletter analytics omitted failed signup attempts

- Status: `FIXED`
- Area: Newsletter / analytics / acquisition funnel
- Severity: Medium
- Evidence: `newsletter_subscribe` was emitted only after a successful response. API rejections
  and network failures displayed an error but produced no event, so the acquisition funnel could
  not distinguish low interest from a broken or rate-limited signup path. Successful events also
  lacked an explicit outcome and HTTP status.
- Fix: emit privacy-safe `success`, `error`, and `network_error` outcomes with source, current auth
  state, and bounded HTTP status only. Subscriber email addresses never enter analytics.
- Regression coverage: `src/components/NewsletterSignup.test.jsx` submits the real widget through
  signed-in success, compact-form API rejection, and network failure, asserts every exact event
  payload, and explicitly rejects email leakage.
- Commit: `Track newsletter submission outcomes`
- Verification: focused 3-test widget coverage, the complete current-worktree 48-file/253-test
  Vitest suite, ESLint, the 137-file analytics audit, and the 528-page production build. The
  deployment completed successfully. Fresh production browser QA submitted a browser-valid
  322-character address that the server correctly rejected, displayed the validation error, wrote
  no subscriber row, and produced a live `newsletter_subscribe` event containing only the expected
  `path=/`, `source=homepage`, `outcome=error`, `signed_in=false`, and `status=400` fields plus
  standard anonymous session/acquisition metadata.

## CA-029 — Optional analytics ran before consent and ignored rejection

- Status: `FIXED`
- Area: Privacy / consent / Google Analytics / Vercel Analytics / first-party telemetry
- Severity: High
- Evidence: first-time visitors were assigned `granted` for Google analytics, advertising storage,
  ad-user-data, and ad-personalization before interacting with the consent banner. GA, Vercel
  Analytics, first-party activity events, anonymous/session identifiers, and engaged-time
  heartbeats also ran independently of the saved choice. Global Privacy Control was not checked
  despite the privacy policy saying it is honored. [Google documents denied-until-granted Consent
  Mode initialization](https://developers.google.com/tag-platform/security/guides/consent), and
  [current ICO guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/online-tracking/consent-or-pay/privacy-by-design/)
  says non-essential storage must not run before consent.
- Fix: default every optional Google consent type to `denied` before any tag, enable ads-data
  redaction, require an explicit grant before mounting GA or Vercel Analytics, and gate all
  first-party events, page views, and heartbeats on the same choice. Preserve essential practice
  storage and limited non-personalized advertising, honor rejection immediately and across reloads,
  honor Global Privacy Control over a stored grant, and retain the choice in memory if browser
  storage is blocked.
- Regression coverage: `src/lib/consent.test.js`, `src/components/ConsentManager.test.jsx`, and
  `src/lib/analytics.test.js` cover default denial, explicit grant/reject, saved denial, storage
  failure, GPC override, pre-tag ordering, ads-data redaction, Vercel suppression, Google consent
  updates, and zero analytics identifiers or requests without a grant.
- Commit: `Require consent before optional analytics`
- Verification: 16 focused consent/analytics tests, the complete current-worktree
  50-file/263-test Vitest suite, ESLint, the 140-file analytics audit, and the 528-page production
  build. Deployed HTML contained the denied-until-granted bootstrap and ads-data redaction but no
  server-rendered GA or Vercel loader. Live rejection/reload QA retained AdSense for limited ads
  while loading zero GA/Vercel scripts and producing zero first-party events. Explicit acceptance
  immediately loaded exactly one GA and one Vercel script; the same behavior survived reload, and
  the live event ledger began a new anonymous session with the accept interaction followed by page
  views.

## CA-030 — Shared footer and contact headings skipped a level

- Status: `FIXED`
- Area: Accessibility / semantic headings / shared footer and cards
- Severity: Medium
- Evidence: axe-core found `heading-order` violations on `/contactus`, `/speaking-examiner`,
  `/mock/academic-reading-mock-1`, and `/404`. Pages with no intervening section heading jumped
  directly from the page `h1` to footer `h3` elements; the contact card added another `h3` directly
  under its `h1`.
- Fix: use `h2` for each independent footer section, let the reusable `CardTitle` select a semantic
  heading element while preserving `h3` as its default, and render the top-level contact-card
  section as `h2`. The footer source now uses a `.jsx` extension so its rendered semantics can be
  tested directly.
- Regression coverage: `src/components/Footer.test.jsx`, `components/ui/card.test.jsx`, and the
  expanded contact-page component suite assert all five footer heading levels, the card-title
  default/override contract, and the contact form section hierarchy.
- Commit: `Fix shared heading hierarchy`
- Verification: focused 7-test component coverage, the complete current-worktree
  52-file/267-test Vitest suite, ESLint, the 142-file analytics audit, and the 528-page production
  build. Axe-core found zero violations across 23 representative local production-build templates,
  including the four original failures. After deployment, the same 23-template live sweep again
  returned zero violations.

## CA-031 — Dialogs did not move, contain, or restore keyboard focus

- Status: `FIXED`
- Area: Accessibility / authentication dialog / mobile navigation sheet / keyboard interaction
- Severity: Medium
- Evidence: opening the production Sign in dialog left focus on the page-level Sign in trigger
  outside the modal. The shared authentication dialog and mobile Sheet listened for Escape and
  locked page scrolling, but neither established initial focus, trapped Tab/Shift+Tab inside the
  active modal, nor restored focus to the invoking control after dismissal.
- Fix: add one shared dialog-focus hook that captures the invoking element, moves focus to each
  dialog step's logical first field, contains forward and reverse keyboard traversal, handles
  Escape dismissal, and restores focus when the modal closes. Apply it to both the authentication
  dialog and shared Sheet, and make each modal container programmatically focusable as a safe
  fallback.
- Regression coverage: `src/lib/dialogFocus.test.jsx` covers initial focus, both Tab boundary
  directions, Escape, disabled controls, step changes, and restoration. `components/ui/sheet.test.jsx`
  exercises the shared Sheet integration and focus return to its trigger.
- Commit: `Trap and restore modal focus`
- Verification: focused 4-test dialog/Sheet coverage, the complete current-worktree
  54-file/271-test Vitest suite, ESLint, the 145-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the fix successfully. Fresh production browser QA confirmed
  that Sign in focuses `#signin-email` inside the `Welcome back` dialog, the dialog is safely
  focusable with `tabindex="-1"`, Escape removes it, and focus returns to the exact Sign in button
  that opened it. The shared Sheet behavior is verified by its DOM integration test because the
  production browser audit viewport is desktop-sized.

## CA-032 — Signed-out dashboard had no page-level heading

- Status: `FIXED`
- Area: Dashboard / authentication boundary / accessibility / semantic headings
- Severity: Medium
- Evidence: the signed-out `/dashboard` state rendered `Sign in to see your progress` with the
  reusable card title's default `h3`. There was no `h1` anywhere in the main content, so the route
  began at heading level three and then moved backwards to the footer's `h2` sections.
- Fix: render the signed-out dashboard title as the route's `h1` while retaining the reusable
  `CardTitle` default for nested cards. Rename the JSX-bearing state module to `.jsx` so its real
  rendered semantics can be regression-tested.
- Regression coverage: `src/components/dashboard/States.test.jsx` renders the signed-out state and
  requires exactly the expected page-level heading with no lower-level main-content headings.
- Commit: `Fix signed-out dashboard heading`
- Verification: focused 3-test state/CardTitle coverage, the complete current-worktree
  55-file/272-test Vitest suite, ESLint, the 146-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the fix successfully. Fresh signed-out production QA found
  exactly one heading in the dashboard main content: `H1 Sign in to see your progress`.

## CA-033 — Sign-in rejected valid existing passwords shorter than eight characters

- Status: `FIXED`
- Area: Authentication / password sign-in / legacy-account compatibility
- Severity: High
- Evidence: the shared auth dialog applied the new-account eight-character minimum to password
  sign-in as well. In production, entering a non-empty six-character existing password left the
  Sign in button disabled and the field carried `minlength="8"`, so the credential never reached
  Supabase for authentication. [Supabase's current password guidance](https://supabase.com/docs/guides/auth/password-security)
  distinguishes strengthened password policy from existing-user sign-in behavior; the identity
  service, not a signup-only client rule, must decide whether an existing credential is accepted.
- Fix: require eight characters only when creating a new account. Existing-account sign-in now
  accepts any non-empty password and delegates credential validation to Supabase; new-password and
  signup flows retain their eight-character client minimum.
- Regression coverage: `src/components/auth/SignInDialog.test.jsx` renders both modes, proves a
  six-character sign-in password has no signup-only minimum and reaches `signInWithPassword`, and
  proves the same value remains blocked in signup until it reaches eight characters.
- Commit: `Allow existing shorter passwords to sign in`
- Verification: focused 2-test auth-dialog coverage, the complete current-worktree
  56-file/274-test Vitest suite, ESLint, the 147-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the fix successfully. Fresh production QA confirmed the
  six-character sign-in value enables submission with no `minlength`, then switching to Create
  account restores `minlength="8"` and disables the same value.

## CA-034 — Forged checkout-return URLs claimed Premium activation

- Status: `FIXED`
- Area: Pricing / checkout reconciliation / conversion analytics / trust
- Severity: High
- Evidence: any visitor could open `/pricing?checkout=success&session_id=<anything>` and immediately
  see `You're in. Do this first`, including signed-out visitors with a fabricated session ID. For a
  signed-in visitor, the page also emitted `purchase_success` before the authenticated verification
  endpoint confirmed session ownership or payment status, creating false conversion data.
- Fix: show the activation checklist only after `/api/billing/verify-session` returns success and
  emit the client purchase event at that same verified point. Signed-out returns request sign-in;
  missing references and failed/delayed verification use neutral recovery copy that never claims a
  payment occurred. Rename the JSX-bearing pricing route to `.jsx` so its actual return-state logic
  can be regression-tested.
- Regression coverage: `tests/pricing-checkout-return.test.jsx` covers a forged signed-out URL,
  signed-in server rejection, and signed-in server success. It asserts the exact verification
  request, Bearer token, session reference, UI state, and absence/presence of `purchase_success`.
- Commit: `Verify checkout returns before claiming success`
- Verification: focused 39-test pricing, billing-route, and metadata coverage, the complete
  current-worktree 57-file/277-test Vitest suite, ESLint, the 147-file analytics audit, and the
  528-page production build all passed. Vercel deployed the fix successfully. Fresh production QA
  revisited a fabricated signed-out return URL and found no activation checklist or Premium claim,
  only `Sign in with the account used at checkout to confirm Premium access.` The authenticated
  legitimate $0 Checkout and entitlement path was already exercised end to end with
  `E2EVERIFY100` in CA-006.

## CA-035 — Pricing sign-in discarded the selected checkout plan

- Status: `FIXED`
- Area: Pricing / authentication handoff / checkout conversion
- Severity: High
- Evidence: selecting a paid plan while signed out opened an auth dialog whose copy promised
  `you’ll stay right on this page`, but Pricing omitted `redirectOnFinish={false}`. Successful auth
  therefore used the shared dialog's dashboard-first default, navigating away from Pricing and
  discarding the SKU the learner had selected.
- Fix: keep pricing authentication in context, retain the pending SKU while the dialog is open, and
  automatically resume the exact checkout request after authentication completes and the dialog
  closes. A canceled dialog retains no automatic action until authentication actually succeeds.
- Regression coverage: the pricing route test selects Monthly while signed out, requires the
  no-redirect dialog contract, completes the simulated auth handoff, and asserts the resumed
  authenticated `/api/billing/checkout` request contains `sku=monthly`, the access token, and no
  substituted offer.
- Commit: `Resume checkout after pricing sign in`
- Verification: focused 4-test pricing-flow coverage, the complete current-worktree
  57-file/278-test Vitest suite, ESLint, the 147-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the fix successfully. Fresh production QA selected a plan
  while signed out, stayed on `/pricing`, and received the in-context `Sign in to upgrade` dialog
  with the matching stay-on-page explanation; the authenticated resume is verified by the rendered
  route integration test without creating another live subscription after CA-006's completed
  `E2EVERIFY100` payment run.

## CA-036 — Successful billing pause left the one-time action active

- Status: `FIXED`
- Area: Billing management / subscription pause / client state
- Severity: Medium
- Evidence: after `/api/billing/pause` succeeded, the page displayed a success message but kept
  rendering from the stale `usePlan` snapshot. `Pause once` therefore remained visible and
  clickable even though the server had permanently set `billing_pause_used_at`; an immediate
  second click could only fail with HTTP 409, and the status card still described the pre-pause
  state.
- Fix: retain the authoritative `resumesAt` response as a local billing-state override, mark the
  one-time offer consumed immediately, render `Premium is paused` with its resume date, and remove
  the pause action without waiting for a page reload. Rename the JSX-bearing route to `.jsx` so the
  actual billing UI can be regression-tested.
- Regression coverage: `tests/billing-manage-page.test.jsx` renders an active subscription,
  completes the authenticated pause request, checks the access token and endpoint, and requires the
  updated status, resume copy, analytics event, and absence of the one-time button. Existing API
  tests continue to cover durable Stripe/Supabase mutation and repeat-pause rejection.
- Commit: `Refresh billing state after pause`
- Verification: focused 8-test billing page/API/status coverage, the complete current-worktree
  58-file/279-test Vitest suite, ESLint, the 147-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the fix successfully. Fresh production route QA confirmed the
  billing title, page `h1`, signed-out boundary, and zero console logs; the Premium-only post-pause
  state is verified by the rendered route test without consuming another live one-time pause.

## CA-037 — Account forms hung when network requests rejected

- Status: `FIXED`
- Area: Dashboard settings / profile persistence / password security / error recovery
- Severity: Medium
- Evidence: profile saving and password updating handled resolved Supabase error objects but did
  not catch rejected promises. A connection failure therefore escaped both submit handlers, left
  `busy=true`, kept the button disabled indefinitely, and gave the learner no explanation or retry
  path.
- Fix: wrap both mutations in explicit `try/catch/finally` flows, preserve service-returned errors,
  provide clear network-failure alerts, and always release the busy state. Successful updates keep
  the existing state-reset and profile-refresh behavior. Rename the JSX-bearing component to
  `.jsx` so its real forms can be regression-tested.
- Regression coverage: `src/components/dashboard/AccountSettings.test.jsx` rejects the real profile
  query chain and password auth call separately, then requires the correct alert and an enabled
  retry button for each form.
- Commit: `Recover account forms from network failures`
- Verification: focused 2-test account-form coverage, the complete current-worktree
  59-file/281-test Vitest suite, ESLint, the 148-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the fix successfully. Fresh production QA confirmed the
  dashboard title, signed-out heading/boundary, and successful route rendering; the only accumulated
  console entries were the previously documented Google-managed AdSense `unfilled` rejection, not
  account code.

## CA-038 — Sign-out failures escaped as unhandled promises

- Status: `FIXED`
- Area: Authentication / session controls / analytics identity / network recovery
- Severity: Medium
- Evidence: the shared `signOut` method awaited Supabase without handling either a returned error
  or rejected request, while navbar and dashboard controls invoked it without awaiting or catching.
  A network failure could therefore produce an unhandled promise with no recoverable UI. Successful
  sign-out also depended on the auth listener to clear the analytics identity.
- Fix: make the shared method return an explicit `{ error }` result for service errors and rejected
  requests, preserve local session state on failure, and clear both user and analytics identity
  immediately on success. The dashboard session control now shows a busy state, reports the
  returned error, and re-enables retry. Rename the JSX-bearing auth module to `.jsx` for direct
  provider coverage.
- Regression coverage: `src/lib/auth.test.jsx` covers rejected and successful provider sign-out,
  including preserved/cleared user state and analytics cleanup. The expanded account-settings suite
  verifies dashboard feedback and retry after a returned sign-out error; navbar intent coverage
  remains green.
- Commit: `Recover safely from sign-out failures`
- Verification: focused 8-test auth/provider/account/navbar coverage, the complete current-worktree
  60-file/284-test Vitest suite, ESLint, the 149-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the fix successfully. Fresh production QA opened the shared
  `Welcome back` dialog, confirmed initial email focus, and found zero application console errors.

## CA-039 — Billing pause could be consumed twice or partially persisted

- Status: `FIXED`
- Area: Billing API / Stripe-Supabase consistency / concurrency / one-time offers
- Severity: High
- Evidence: the endpoint read `billing_pause_used_at`, changed Stripe, and only then wrote the
  one-time marker. Concurrent requests could both pass the initial read and mutate Stripe. If
  Stripe succeeded but the Supabase update failed, the endpoint returned 503 even though billing
  was already paused, invited a duplicate retry, and could leave the durable one-time marker unset.
- Fix: atomically reserve the one-time action with a null-filtered Supabase update before touching
  Stripe, using the [documented update-plus-select contract](https://supabase.com/docs/reference/javascript/update)
  to distinguish the winning request. Reject concurrent losers, roll back the exact reservation
  only when Stripe itself fails, and retain the claim after Stripe success. If the subsequent pause
  detail write fails, return the truthful success plus `reconciling=true`; Stripe's subscription
  webhook remains the authoritative detail-reconciliation path.
- Regression coverage: the expanded billing API suite covers successful reservation/finalization,
  an already-used row, a concurrent null-filter loser, Stripe failure with timestamp-guarded
  rollback, and Stripe success followed by a Supabase detail failure that must not roll back or
  invite retry.
- Commit: `Make billing pause claims atomic`
- Verification: focused 35-test billing page/API/webhook suite, the complete current-worktree
  60-file/287-test Vitest suite, ESLint, the 149-file analytics audit, and the 528-page production
  build all passed. The current Supabase changelog showed no relevant JavaScript update-contract
  breaking change. Vercel deployed the fix successfully; fresh production probes returned HTTP 405
  with `Allow: POST` for GET and HTTP 401 for an unauthenticated valid-origin POST. No live
  subscription was mutated for this failure-path verification.

## CA-040 — Plan lookup failures silently presented paid users as Free

- Status: `FIXED`
- Area: Billing / Pricing / Supabase plan state / fail-closed mutations
- Severity: High
- Evidence: `usePlan` ignored Supabase's resolved `{ error }` result and treated the missing row as
  `plan=free` with `plan_status=inactive`; rejected requests likewise ended loading without
  exposing a failure. A temporary database outage could therefore show a Premium learner the Free
  pricing state, enable another checkout, or present billing controls against an unverified
  subscription snapshot.
- Fix: expose an explicit plan-verification error from the shared hook for both resolved query
  failures and rejected requests. Pricing now explains the temporary problem and disables every
  checkout action; Billing Management shows the same recovery guidance and withholds all billing
  mutations until the current plan can be verified. Verified and signed-out states retain their
  existing behavior.
- Regression coverage: `src/lib/usePlan.test.jsx` proves a resolved Supabase error cannot silently
  become a verified Free state and that a valid Premium row remains recognized. The Pricing
  integration suite requires all four checkout actions to be disabled during verification
  failure, while the Billing Management suite requires pause and Stripe-portal actions to be
  absent.
- Commit: `3827c20` (`Fail closed when plan lookup fails`)
- Verification: focused 12-test plan/pricing/billing coverage, the complete current-worktree
  61-file/291-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the commit successfully. Fresh signed-out production browser
  QA confirmed the Pricing route renders all four plan choices and Billing Management renders its
  correct page-level heading and sign-in boundary. The injected database-failure branches were
  verified in rendered integration tests rather than causing an unsafe live service outage.

## CA-041 — Billing portal database failures were misreported as no account

- Status: `FIXED`
- Area: Billing API / customer portal / Supabase failure recovery
- Severity: High
- Evidence: `/api/billing/portal` discarded the resolved Supabase error from its customer lookup.
  A database outage therefore followed the same HTTP 404 path as a verified user who had never
  purchased, telling a paid learner `No billing account yet.` Auth and customer-query promise
  rejections also escaped the handler without a controlled response.
- Fix: distinguish invalid credentials, a verified missing customer, and backend verification
  failure. The endpoint now catches rejected auth lookups, checks resolved customer-query errors,
  uses `maybeSingle()` to preserve the real no-row case, and returns a retryable HTTP 503 without
  contacting Stripe whenever the current billing account cannot be verified.
- Regression coverage: the new `tests/billing-portal.test.js` route suite covers method and origin
  enforcement, missing and invalid authentication, rejected auth verification, resolved and
  rejected customer-query failures, a genuine no-customer user, exact successful Stripe portal
  session construction, and Stripe session failure.
- Commit: `dd12462` (`Recover billing portal lookup failures`)
- Verification: focused 11-test portal/page coverage, the complete current-worktree
  62-file/300-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the commit successfully. Fresh non-mutating production probes
  returned HTTP 405 with `Allow: POST` for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for
  a same-origin unauthenticated POST. The paid-customer success and injected dependency-failure
  paths are verified by the route tests without opening a live customer session or disrupting
  production services.

## CA-042 — Checkout dependency failures were misreported as account problems

- Status: `FIXED`
- Area: Billing API / Checkout / authentication / Supabase failure recovery
- Severity: High
- Evidence: `/api/billing/checkout` performed auth verification and the user-row query outside its
  guarded Stripe flow. An auth-service rejection could escape the handler, while both resolved and
  rejected user-query failures were conflated with a genuine missing row and returned
  `Account not found.` A learner could therefore be told their account did not exist during a
  temporary backend outage.
- Fix: make auth resolution explicitly distinguish an invalid credential from an infrastructure
  failure, catch the latter as a retryable HTTP 503, and guard the account query separately. The
  route now checks resolved Supabase errors, catches rejected queries, uses `maybeSingle()` for the
  actual no-row case, and never contacts Stripe when account verification is unavailable.
- Regression coverage: the expanded billing-route suite injects a rejected auth request, a
  resolved database error, and a rejected database request; each must return HTTP 503 with no
  Stripe calls. It separately proves that a successful empty query retains the existing
  `Account not found` response, alongside all prior SKU, Premium, PPP, win-back, customer reuse,
  Exam Pass, and checkout reconciliation coverage.
- Commit: `0c14ec4` (`Recover checkout account lookup failures`)
- Verification: focused 29-test Checkout/Pricing coverage, the complete current-worktree
  62-file/304-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the commit successfully. Fresh non-mutating production probes
  returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for a same-origin
  unauthenticated Checkout request. Dependency failures are injected in route tests rather than by
  disrupting production, and no live Checkout session or charge was created.

## CA-043 — Checkout-return auth outages escaped reconciliation recovery

- Status: `FIXED`
- Area: Billing API / checkout reconciliation / authentication failure recovery
- Severity: High
- Evidence: `/api/billing/verify-session` guarded Stripe retrieval and entitlement reconciliation,
  but it awaited Supabase auth verification before entering that recovery block. A rejected auth
  request could therefore escape the handler instead of returning the route's neutral
  `Activation is still processing` response, leaving a legitimately paid learner with an
  uncontrolled API failure on return from Checkout.
- Fix: make auth resolution distinguish invalid credentials from a rejected dependency request.
  Invalid or absent credentials remain HTTP 401; an auth infrastructure failure is logged
  server-side and returns the existing retryable HTTP 503 activation-pending response without
  retrieving or reconciling a Stripe session.
- Regression coverage: the expanded billing route suite injects a rejected auth request, requires
  HTTP 503 and the neutral processing message, and proves Stripe retrieval was never called. All
  existing malformed-session, cross-account, incomplete-payment, and successful paid-session
  reconciliation cases remain covered.
- Commit: `29edcae` (`Recover checkout verification auth failures`)
- Verification: focused 30-test reconciliation/Pricing coverage, the complete current-worktree
  62-file/305-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the commit successfully. Fresh non-mutating production probes
  returned HTTP 405 with `Allow: POST` for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for
  a same-origin unauthenticated reconciliation request. No Stripe session was retrieved or
  mutated by the production checks.

## CA-044 — Billing-pause lookup failures looked like inactive subscriptions

- Status: `FIXED`
- Area: Billing API / one-time pause / authentication / subscription verification
- Severity: High
- Evidence: `/api/billing/pause` awaited auth and the initial subscription query without rejection
  recovery, and grouped a resolved Supabase query error with the legitimate no-subscription state.
  An infrastructure failure could therefore escape the route or tell an active paid learner
  `There is no active subscription to pause.`
- Fix: distinguish absent or invalid credentials, verified inactive subscriptions, and dependency
  failures before any mutation. Rejected auth verification plus resolved or rejected subscription
  queries now return a retryable HTTP 503, while real unauthenticated and no-subscription states
  retain HTTP 401 and 409 respectively. No claim or Stripe operation begins until subscription
  state is verified.
- Regression coverage: the expanded pause suite injects an auth rejection, a resolved database
  error, and a rejected database request, and requires each to leave both Stripe calls and
  Supabase mutations empty. A successful empty query separately proves the genuine no-active-plan
  response, alongside existing atomic-claim, concurrency, rollback, reconciliation, expiry, and
  repeat-use coverage.
- Commit: `2b13aa6` (`Recover billing pause lookup failures`)
- Verification: focused 16-test billing pause/page/status coverage, the complete current-worktree
  62-file/309-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the commit successfully. Fresh non-mutating production probes
  returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for a same-origin
  unauthenticated pause request. No subscription or one-time pause claim was changed.

## CA-045 — Rejected pause-lifecycle promises could contradict Stripe

- Status: `FIXED`
- Area: Billing API / one-time pause / Stripe-Supabase consistency / failure recovery
- Severity: High
- Evidence: the pause endpoint handled resolved Supabase errors but not rejected promises while
  claiming the one-time action, rolling it back, persisting the completed pause, or writing the
  activity event. Most critically, a detail-persistence or event rejection after Stripe had
  already paused billing could escape the route and present failure, inviting a duplicate retry
  despite the successful external mutation.
- Fix: contain every asynchronous claim and post-Stripe persistence operation. A rejected claim
  fails safely before Stripe. Stripe failure still attempts the timestamp-guarded rollback; if
  that rollback itself rejects, the response truthfully says the subscription was not paused but
  the one-time action needs support rather than promising a safe retry. Once Stripe succeeds,
  rejected detail persistence returns HTTP 200 with `reconciling=true`, and rejected fail-soft
  activity logging cannot overwrite the truthful success response.
- Regression coverage: the expanded pause suite injects rejected claim, rollback, pause-detail,
  and activity promises. It requires no Stripe call before a claim, explicit stuck-claim guidance
  after rollback failure, truthful success plus reconciliation after a completed Stripe pause,
  and unaffected success when only analytics logging is unavailable.
- Commit: `eedb2a5` (`Recover billing pause lifecycle rejections`)
- Verification: focused 20-test billing pause/page/status coverage, the complete current-worktree
  62-file/313-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the commit successfully. Fresh non-mutating production probes
  returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for a same-origin
  unauthenticated pause request. No live subscription, claim, or Stripe object was changed.

## CA-046 — Protected mock outages appeared as authentication or upgrade failures

- Status: `FIXED`
- Area: Premium entitlement / protected mock tests / Supabase failure recovery
- Severity: High
- Evidence: the shared server entitlement helper intentionally returned `false` for both a
  verified non-Premium account and any Supabase failure. `/api/mock/[slug]` therefore had no way to
  distinguish a real Free learner from a paid learner whose plan could not be checked, and auth
  promise rejections escaped entirely. During an outage, the route could show `Premium is
  required` or fail uncontrolled rather than offering a truthful retry path.
- Fix: add a tri-state server entitlement result containing `isPremium` and `error`, while keeping
  the original boolean helper as a fail-closed compatibility wrapper. Protected mock access now
  returns HTTP 503 for rejected auth or resolved/rejected entitlement failures, HTTP 402 only for a
  verified non-Premium account, and never loads protected mock content unless access is positively
  verified.
- Regression coverage: shared helper tests cover active, trialing, past-due, canceled,
  Exam-Pass, billing-pause, verified Premium, verified Free, resolved query error, rejected query,
  and compatibility fail-closed behavior. The expanded protected-route suite proves auth and
  entitlement outages never load content, while genuine Free, invalid slug, and successful
  private/no-store Premium responses remain distinct.
- Commit: `40fb7f9` (`Distinguish mock entitlement outages`)
- Verification: focused 13-test helper/protected-route coverage, the complete current-worktree
  62-file/319-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the commit successfully. Fresh non-mutating production probes
  returned HTTP 401 without credentials, HTTP 405 for POST, and HTTP 401 for an invalid Bearer
  token. No protected mock content was fetched with a live user account.

## CA-047 — Examiner entitlement outages appeared as upgrade requirements

- Status: `FIXED`
- Area: Realtime examiner / Premium entitlement / authentication / cost controls
- Severity: High
- Evidence: `/api/realtime/session` used the shared fail-closed boolean entitlement check, so a
  Supabase plan error was indistinguishable from a verified Free account and returned the
  Premium-plan 402 upsell. Auth promise rejections also escaped before the route's cost controls.
  A paid learner could therefore be told to upgrade during an outage rather than receiving a
  truthful temporary-unavailability response.
- Fix: use the tri-state Premium result and explicit auth resolution. Rejected auth verification
  plus resolved or rejected entitlement queries now return HTTP 503; HTTP 402 is reserved for a
  successfully verified non-Premium account. Every failure occurs before rate limits, Realtime
  quota consumption, content selection, or OpenAI client-secret minting.
- Regression coverage: the Realtime suite injects auth rejection, resolved entitlement error, and
  rejected entitlement query and proves each returns 503 without an OpenAI call. Verified Free,
  invalid mode, exhausted minutes, mint success, atomic refund, legacy refund, ambiguous refund,
  IP/global capacity, and rate-limit failure behavior remain covered alongside the shared
  entitlement tests.
- Commit: `b3a218a` (`Distinguish examiner entitlement outages`)
- Verification: focused 28-test Premium/Realtime coverage, the complete current-worktree
  62-file/322-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the commit successfully. Fresh non-mutating production probes
  returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for a same-origin
  unauthenticated session request. No quota was consumed and no OpenAI secret was minted.

## CA-048 — Rejected examiner rate-limit RPCs escaped cost controls

- Status: `FIXED`
- Area: Realtime examiner / rate limiting / cost controls / Supabase failure recovery
- Severity: High
- Evidence: the shared Realtime mint limiter handled a resolved Supabase RPC error and failed
  closed, but the `await` itself was outside a rejection guard. A network-level RPC rejection
  could therefore escape the endpoint instead of producing its controlled temporary-unavailable
  response.
- Fix: contain both resolved errors and rejected promises inside the limiter helper. The IP and
  global mint limits continue to return an explicit unavailable sentinel in fail-closed mode, so
  the route returns HTTP 503 before consuming Realtime seconds, selecting speaking content, or
  requesting an OpenAI client secret.
- Regression coverage: the expanded Realtime suite injects a rejected `check_rate_limit` RPC,
  requires HTTP 503, and proves no refund or OpenAI request occurs because quota consumption never
  begins. Existing resolved limiter-error, IP limit, global capacity, entitlement, mint, and refund
  coverage remains green.
- Commit: `6794464` (`Fail closed on examiner limiter rejections`)
- Verification: focused 21-test Realtime coverage, the complete current-worktree
  62-file/323-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the commit successfully. Fresh non-mutating production probes
  returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for a same-origin
  unauthenticated session request. No rate-limit bucket, quota, or OpenAI resource was mutated.

## CA-049 — Transcript-scoring outages appeared as Premium upsells

- Status: `FIXED`
- Area: Realtime examiner / transcript scoring / Premium entitlement / authentication
- Severity: High
- Evidence: `/api/score/speaking-realtime` used the fail-closed boolean Premium helper and awaited
  auth outside a rejection guard. A paid learner whose auth or entitlement dependency was
  unavailable could therefore receive an uncontrolled failure or the same HTTP 402
  `not_premium` upsell as a verified Free account.
- Fix: use explicit auth and tri-state Premium results. Auth rejection plus resolved or rejected
  entitlement queries now return HTTP 503; HTTP 402 is reserved for a successfully verified Free
  account. All these paths stop before global/IP limiters, OpenAI scoring, or attempt persistence.
- Regression coverage: the new dedicated route suite covers method, origin, missing auth, rejected
  auth, verified Free, resolved plan error, and rejected plan query. Every error or non-Premium
  case proves no rate-limit RPC was called. Shared Premium edge tests remain part of focused
  coverage.
- Commit: `18f4812` (`Distinguish realtime scoring entitlement outages`)
- Verification: focused 14-test route/Premium coverage, the complete current-worktree
  63-file/329-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the commit successfully. Fresh non-mutating production probes
  returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for a same-origin
  unauthenticated scoring request. No limiter, OpenAI call, or score record was created.

## CA-050 — Transcript-scoring limiter rejections escaped fail-closed handling

- Status: `FIXED`
- Area: Realtime examiner / transcript scoring / global and IP rate limits / cost controls
- Severity: High
- Evidence: the transcript-scoring route awaited both `check_rate_limit` RPCs directly. It handled
  resolved Supabase errors but not rejected promises, so a network-level limiter failure escaped
  instead of returning the route's controlled temporary-unavailable response.
- Fix: route both global and per-IP checks through one rejection-safe helper. Resolved errors and
  rejected RPCs return HTTP 503, verified global exhaustion remains fail-closed HTTP 503, and only
  a successful global check followed by a verified per-IP denial returns HTTP 429. Scoring never
  reaches transcript validation, OpenAI, or persistence on these paths.
- Regression coverage: the dedicated route suite now covers resolved limiter error, rejected RPC,
  global exhaustion, and per-IP denial in addition to its method, origin, auth, and entitlement
  cases. It asserts the exact limiter order and confirms the first failure stops later checks.
- Commit: `7656822` (`Fail closed on transcript limiter rejections`)
- Verification: focused 10-test transcript-scoring route coverage, the complete current-worktree
  63-file/333-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the commit successfully. Fresh non-mutating production probes
  returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for a same-origin
  unauthenticated scoring request. No limiter-backed scoring work or OpenAI call was initiated.

## CA-051 — Recorded Speaking outages appeared as sign-in or upgrade failures

- Status: `FIXED`
- Area: Speaking scoring / authentication / Premium entitlement / failure recovery
- Severity: High
- Evidence: `/api/score/speaking` swallowed rejected auth checks inside its helper and returned the
  same HTTP 401 as missing credentials. It also used the boolean fail-closed entitlement helper,
  so plan-query failures returned the HTTP 402 `premium_required` upsell. Paid learners could
  therefore be told to sign in or upgrade during dependency outages.
- Fix: let rejected auth verification reach the handler's existing HTTP 503 recovery path and use
  the tri-state Premium result. Resolved or rejected plan errors now return HTTP 503; HTTP 401 is
  reserved for missing/invalid credentials and HTTP 402 for a verified Free account. All failures
  stop before rate limits, quota consumption, storage access, transcription, or scoring.
- Regression coverage: the expanded Speaking route suite covers missing auth, rejected auth,
  verified Free, resolved entitlement error, and rejected entitlement query, proving no quota RPC
  or storage cleanup occurs. Its existing provider-unavailable case still proves the exact
  consumed quota is refunded and the owned recording is removed.
- Commit: `0319fab` (`Distinguish speaking entitlement outages`)
- Verification: focused 14-test Speaking/Premium coverage, the complete current-worktree
  63-file/338-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the commit successfully. Fresh non-mutating production probes
  returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for a same-origin
  unauthenticated scoring request. No quota, storage object, or OpenAI request was created.

## CA-052 — Speaking per-user limiter failed open on database errors

- Status: `FIXED`
- Area: Speaking scoring / global and per-user rate limits / cost controls
- Severity: High
- Evidence: the recorded Speaking limiter returned `true` for a resolved Supabase error unless
  explicitly called in fail-closed mode. The global circuit breaker opted into fail-closed
  behavior, but the per-user limiter did not, so its database failure silently allowed scoring to
  continue. Global limiter errors were also surfaced as ordinary HTTP 429 demand rather than
  dependency failure.
- Fix: replace the ambiguous boolean helper with an explicit `{ allowed, error }` result for both
  limiters. Resolved errors and rejected promises now return HTTP 503 at either stage. Verified
  global exhaustion and verified per-user exhaustion retain HTTP 429, and quota consumption begins
  only after both checks are positively verified.
- Regression coverage: the expanded Speaking suite covers global resolved error, global rejection,
  verified global exhaustion, per-user resolved error, and verified per-user exhaustion. It asserts
  exact check order and proves every error stops before `consume_ai_score`, while the existing
  provider-failure test continues to verify refund and cleanup.
- Commit: `988b02a` (`Fail closed on speaking limiter errors`)
- Verification: focused 11-test Speaking route coverage, the complete current-worktree
  63-file/343-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the commit successfully. Fresh non-mutating production probes
  returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for a same-origin
  unauthenticated scoring request. No limiter, quota, storage, or OpenAI mutation occurred.

## CA-053 — Rejected Speaking requests orphaned private voice uploads

- Status: `FIXED`
- Area: Speaking scoring / private storage / quota and limiter failure cleanup
- Severity: High
- Evidence: the client uploads an owned voice recording before calling `/api/score/speaking`.
  After ownership validation, global/user limiter failures and quota failures returned before the
  scorer's cleanup `finally`. The UI did not retain those rejected paths and uploaded a new file on
  retry, leaving private audio orphaned until the 30-day cleanup cron.
- Fix: remove the verified owned upload on limiter errors, verified rate-limit exhaustion, quota
  RPC errors/rejections, and non-upgrade quota denials. Preserve the file only for the intentional
  `premium_required` checkout handoff, where the client stores that exact path and resumes scoring
  after purchase.
- Regression coverage: the expanded Speaking suite requires cleanup for global/user limiter
  failures and limits, quota resolution errors, quota promise rejection, and verified daily-cap
  denial. A separate test proves `premium_required` preserves the upload, while the existing
  provider-failure case continues to prove refund plus cleanup.
- Commit: `2732e55` (`Clean rejected speaking uploads`)
- Verification: focused 15-test Speaking route coverage, the complete current-worktree
  63-file/347-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the commit successfully. Fresh non-mutating production probes
  returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for a same-origin
  unauthenticated request. Cleanup/preservation branches were verified with owned-path route tests
  rather than deleting a real learner recording.

## CA-054 — Writing auth outages appeared as sign-in failures

- Status: `FIXED`
- Area: Writing scoring / authentication / Supabase failure recovery
- Severity: High
- Evidence: `/api/score/writing` caught every rejected Supabase auth lookup inside
  `resolveUserId` and returned `null`. A signed-in learner therefore received the same HTTP 401
  sign-in response during an auth dependency outage as a request with missing or invalid
  credentials.
- Fix: keep missing, invalid, and anonymous credentials on the intentional HTTP 401 path, but let
  rejected auth lookups reach a guarded handler boundary. Dependency rejection now returns a
  generic HTTP 503 response and stops before validation, rate limits, quota consumption, or OpenAI.
- Regression coverage: the Writing route suite now distinguishes missing authentication, a valid
  anonymous-auth identity, and a rejected auth lookup. It requires HTTP 503 for the dependency
  failure and proves no rate-limit or quota RPC is called; the existing provider-failure test
  continues to prove exact quota refund behavior.
- Commit: `a5e5def` (`Recover writing auth dependency failures`)
- Verification: focused 4-test Writing route coverage, the complete current-worktree
  63-file/349-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the commit successfully. Fresh non-mutating production probes
  returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for a same-origin
  unauthenticated scoring request. No limiter, quota, or OpenAI mutation occurred.

## CA-055 — Writing limiter errors bypassed or impersonated verified limits

- Status: `FIXED`
- Area: Writing scoring / global and per-IP rate limits / cost controls
- Severity: High
- Evidence: the shared Writing limiter returned an ambiguous boolean. A resolved Supabase error
  on the per-IP check failed open and allowed scoring to continue, while the same error on the
  global circuit breaker became an ordinary HTTP 429 high-demand response. Rejected promises
  reached a separate HTTP 503 path, so equivalent dependency failures had inconsistent behavior.
- Fix: return an explicit `{ allowed, error }` result from a rejection-safe limiter helper. Both
  global and per-IP resolved errors or rejected promises now return HTTP 503 and stop before quota
  consumption. Only positively verified global or per-IP exhaustion returns HTTP 429.
- Regression coverage: the expanded Writing route suite covers resolved RPC errors, promise
  rejections, and verified exhaustion at both limiter stages. It asserts exact check order and
  bucket selection, proves the first failure stops subsequent RPCs, and retains the provider
  failure test that verifies exact quota refund.
- Commit: `09a9a5e` (`Fail closed on writing limiter errors`)
- Verification: focused 10-test Writing route coverage, the complete current-worktree
  63-file/355-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the commit successfully. Fresh non-mutating production probes
  returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for a same-origin
  unauthenticated scoring request. No limiter, quota, or OpenAI mutation occurred.

## CA-056 — Unbounded Writing prompts could inflate scoring requests

- Status: `FIXED`
- Area: Writing checker / request validation / AI cost controls / form UX
- Severity: High
- Evidence: the scoring route capped essay length but accepted the optional user-controlled task
  prompt at any length allowed by the framework request body. It then included that prompt
  verbatim in the OpenAI request, permitting unnecessary token spend and oversized processing.
  The browser field had no corresponding input bound.
- Fix: introduce one shared 8,000-character prompt limit, enforce it server-side before rate limits
  or quota consumption, and expose the same `maxLength` on the Writing checker field. The limit is
  deliberately generous for legitimate IELTS task text while bounding model input.
- Regression coverage: the Writing route suite proves 8,001 characters returns HTTP 400 without
  any limiter or quota RPC, while exactly 8,000 characters passes validation and reaches the
  normal limiter path.
- Commit: `cc05825` (`Bound writing prompt input`)
- Verification: focused 12-test Writing route coverage, the complete current-worktree
  63-file/357-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the commit successfully. Production HTML rendered
  `maxLength="8000"` on the prompt field, while fresh non-mutating API probes returned HTTP 405
  for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for a same-origin unauthenticated POST.
  No authenticated scoring mutation occurred.

## CA-057 — Writing score schemas allowed invalid band values

- Status: `FIXED`
- Area: Writing scoring / Structured Outputs / IELTS result correctness
- Severity: High
- Evidence: the strict OpenAI response schema described bands as 0–9 half-bands but declared
  every criterion and the overall as an unconstrained JSON `number`. Schema-conforming output
  could therefore contain a negative value, a value above 9, or a non-half increment even though
  none is a valid IELTS band.
- Fix: extract the Writing Structured Output schema into a testable module and constrain every
  band with `minimum: 0`, `maximum: 9`, and `multipleOf: 0.5`. Current official OpenAI Structured
  Outputs documentation confirms all three numeric constraints are supported for the configured
  non-fine-tuned model families.
- Regression coverage: the new schema suite builds both Task 1 and Task 2 variants, verifies strict
  mode and the task-specific first criterion key, and requires the numeric constraints on the
  overall plus all four criterion bands.
- Commit: `5da9b9a` (`Constrain writing band outputs`)
- Verification: focused 14-test Writing route/schema coverage, the complete current-worktree
  64-file/359-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the commit successfully. Fresh non-mutating production probes
  returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for a same-origin
  unauthenticated scoring request. No quota or OpenAI request was created.

## CA-058 — Writing trusted model arithmetic for the overall band

- Status: `FIXED`
- Area: Writing scoring / IELTS band calculation / score persistence
- Severity: High
- Evidence: the Writing prompt asked the model to average four criterion bands, but the server
  returned and persisted the model-provided `overallBand` without verifying the arithmetic.
  A structurally valid response could therefore show an overall score that contradicted its own
  criterion scores. Recorded Speaking already computed its overall server-side.
- Fix: calculate the Writing overall from the task-specific first criterion plus Coherence and
  Cohesion, Lexical Resource, and Grammatical Range using the shared official band-rounding helper.
  Override the model's arithmetic before response and persistence. An incomplete criterion set now
  returns HTTP 502 and refunds the exact consumed quota.
- Regression coverage: successful Task 1 and Task 2 route tests deliberately supply a model
  overall of 3.0 with criterion bands 6.5, 7.0, 7.5, and 8.0. Both require the correctly rounded
  7.5 in the response, attempt, and score records. A malformed provider-result test proves HTTP 502,
  no persistence, and exact quota refund.
- Commit: `09781c9` (`Compute writing overall bands server-side`)
- Verification: focused 17-test Writing route/schema coverage, the complete current-worktree
  64-file/362-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the commit successfully. Fresh non-mutating production probes
  returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for a same-origin
  unauthenticated scoring request. No live quota or OpenAI mutation occurred.

## CA-059 — Realtime Speaking schemas allowed invalid band values

- Status: `FIXED`
- Area: Realtime examiner / transcript scoring / Structured Outputs / IELTS correctness
- Severity: High
- Evidence: the strict realtime transcript-scoring schema declared its overall and three
  transcript-assessed criterion bands as unconstrained numbers. A schema-conforming OpenAI result
  could therefore contain negative, above-9, or non-half-band values that are not valid IELTS
  scores.
- Fix: extract the realtime Speaking schema into a testable module and constrain every overall and
  criterion band with `minimum: 0`, `maximum: 9`, and `multipleOf: 0.5`, using the numeric
  restrictions supported by current official OpenAI Structured Outputs documentation.
- Regression coverage: the new schema suite requires strict mode, all three expected
  transcript-assessed criteria, and the complete numeric constraint set on each band plus the
  overall. Existing method, origin, auth, entitlement, and limiter route tests remain green.
- Commit: `c38953c` (`Constrain realtime speaking band outputs`)
- Verification: focused 11-test realtime route/schema coverage, the complete current-worktree
  65-file/363-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the commit successfully. Fresh non-mutating production probes
  returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for a same-origin
  unauthenticated scoring request. No limiter or OpenAI request was created.

## CA-060 — Unscorable realtime transcripts consumed limiter allowance

- Status: `FIXED`
- Area: Realtime examiner / transcript validation / rate limits / availability
- Severity: High
- Evidence: the realtime scoring route called the global and per-IP `check_rate_limit` RPCs before
  verifying that the transcript contained the 40 candidate words required to score. The RPC
  atomically increments on every call, so empty or short HTTP 422 submissions consumed both
  allowances and could unnecessarily reduce scoring availability.
- Fix: authenticate and verify Premium entitlement, then normalize and validate the transcript
  before mutating either limiter counter. Only a transcript that is actually eligible for scoring
  reaches the global and per-IP checks.
- Regression coverage: a new verified-Premium short-transcript case requires HTTP 422 and zero
  limiter RPCs. Every limiter error, rejection, global-capacity, and per-IP exhaustion test now
  supplies a valid 40-word candidate transcript so those branches remain genuinely exercised.
- Commit: `adf6f69` (`Validate realtime transcripts before limiting`)
- Verification: focused 12-test realtime route/schema coverage, the complete current-worktree
  65-file/364-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the commit successfully. Fresh non-mutating production probes
  returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for a same-origin
  unauthenticated scoring request. No live limiter or OpenAI mutation occurred.

## CA-061 — Recorded Speaking accepted invalid band increments

- Status: `FIXED`
- Area: Speaking scoring / Structured Outputs / runtime validation / IELTS correctness
- Severity: High
- Evidence: the recorded Speaking strict schema declared criterion and overall bands as
  unconstrained numbers. Its server fallback validator checked only finite 0–9 range, so values
  such as 6.25 were accepted even though IELTS scores use whole and half bands.
- Fix: extract the recorded Speaking schema and validator into a testable module. Constrain every
  schema band to 0–9 with `multipleOf: 0.5`, and require the server fallback validator to accept
  only values whose doubled value is an integer.
- Regression coverage: direct schema tests require the constraints on the overall and every
  criterion. Validator cases cover valid boundary/whole/half bands and reject negative, above-9,
  quarter-band, non-finite, and string values. Existing Speaking auth, entitlement, limiter,
  quota, cleanup, and refund tests remain green.
- Commit: `33a2f78` (`Validate recorded speaking band outputs`)
- Verification: focused 27-test recorded Speaking route/schema coverage, the complete
  current-worktree 66-file/376-test Vitest suite, ESLint, the 150-file analytics audit, and the
  528-page production build all passed. Vercel deployed the commit successfully. Fresh
  non-mutating production probes returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and
  HTTP 401 for a same-origin unauthenticated scoring request. No live quota, storage, or OpenAI
  mutation occurred.

## CA-062 — Realtime Speaking trusted model arithmetic for the overall band

- Status: `FIXED`
- Area: Realtime examiner / transcript scoring / IELTS band calculation / persistence
- Severity: High
- Evidence: realtime transcript scoring returned and persisted the model-provided overall without
  validating the three criterion values or checking their arithmetic. A structurally parseable
  response could therefore contradict its own criteria or persist an incomplete score.
- Fix: validate Fluency and Coherence, Lexical Resource, and Grammatical Range as whole/half IELTS
  bands; compute their mean with the shared nearest-half rounding helper; and override the model
  overall before response and persistence. Malformed criterion results now return HTTP 502 without
  creating an attempt or score.
- Regression coverage: a successful route case deliberately supplies a model overall of 3.0 with
  criterion bands 6.5, 7.5, and 8.0, then requires 7.5 in the response, attempt, and score. A
  missing-criterion case requires HTTP 502 and zero persistence.
- Commit: `593f3ca` (`Compute realtime speaking bands server-side`)
- Verification: focused 26-test realtime/recorded Speaking route and schema coverage, the complete
  current-worktree 66-file/378-test Vitest suite, ESLint, the 150-file analytics audit, and the
  528-page production build all passed. Vercel deployed the commit successfully. Fresh
  non-mutating production probes returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and
  HTTP 401 for a same-origin unauthenticated scoring request. No live limiter, OpenAI, or
  persistence mutation occurred.

## CA-063 — Realtime scoring accepted unsupported session modes

- Status: `FIXED`
- Area: Realtime examiner / API contract / prompt integrity / persisted attempts
- Severity: Medium
- Evidence: the realtime session-mint endpoint validated `mock`, `part1`, `part2`, and `part3`
  against the shared mode contract, but the scoring endpoint accepted any string. An unsupported
  value could therefore enter the scoring prompt, consume the rate limiter, and be persisted as an
  invalid attempt mode even though no matching session could be minted.
- Fix: validate scoring requests against the same shared `MODES` registry immediately after
  entitlement checks and before transcript processing, rate limiting, OpenAI calls, or
  persistence. Unsupported modes now return HTTP 400 with `Unknown session mode.`
- Regression coverage: the scoring route sends an unsupported `karaoke` mode, requires HTTP 400,
  and asserts that neither rate-limit RPCs nor database-table calls occur. The focused realtime
  mint/scoring suite continues to exercise every valid mode and the existing security boundaries.
- Commit: `e92016e` (`Validate realtime scoring modes`)
- Verification: focused 35-test realtime mint/scoring coverage, the complete current-worktree
  66-file/379-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the exact commit successfully. Fresh non-mutating production
  probes against both the mint and scoring endpoints returned HTTP 405 for GET, HTTP 403 for a
  cross-origin POST, and HTTP 401 for a same-origin unauthenticated POST. No live limiter, OpenAI,
  or persistence mutation occurred.

## CA-064 — Realtime feedback counts were descriptive rather than enforced

- Status: `FIXED`
- Area: Realtime examiner / Structured Outputs / feedback completeness
- Severity: Medium
- Evidence: the scoring prompt promised 1–3 strengths and 1–3 improvements for every criterion,
  plus 3–5 top-level practice actions, but its strict JSON schema placed no bounds on those arrays.
  A schema-valid response could therefore contain no actionable feedback or an excessive,
  unscannable list despite the learner-facing contract.
- Fix: enforce `minItems: 1` and `maxItems: 3` on every criterion's strengths and improvements,
  and `minItems: 3` and `maxItems: 5` on the priority-action list at the Structured Output boundary.
- Regression coverage: direct schema assertions cover both arrays for all three transcript-assessed
  criteria and the top-level action list, while the full realtime route suite continues to verify
  the schema is sent to OpenAI.
- Commit: `91de2fe` (`Enforce realtime feedback counts`)
- Verification: focused 16-test realtime route/schema coverage, the complete current-worktree
  66-file/380-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the exact commit successfully. Fresh non-mutating production
  probes returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for a same-origin
  unauthenticated request. No live limiter, OpenAI, or persistence mutation occurred.

## CA-065 — Writing feedback counts were descriptive rather than enforced

- Status: `FIXED`
- Area: Writing scorer / Structured Outputs / feedback completeness
- Severity: Medium
- Evidence: Writing promised 1–3 strengths and 1–3 improvements for each of four criteria and 3–5
  priority actions, but its strict JSON schema allowed every feedback array to be empty or
  unbounded. A schema-valid assessment could therefore omit the guidance the learner requested or
  return an excessive list that broke the intended scannable format.
- Fix: enforce `minItems: 1` and `maxItems: 3` for strengths and improvements on every Task 1 and
  Task 2 criterion, and enforce `minItems: 3` and `maxItems: 5` for top-level priority actions.
- Regression coverage: parameterized schema tests exercise both task-specific first criteria and
  all shared criteria, plus the top-level action list; the complete Writing route suite continues
  to verify that this strict schema is sent to OpenAI.
- Commit: `1aeb6a0` (`Enforce writing feedback counts`)
- Verification: focused 19-test Writing route/schema coverage, the complete current-worktree
  66-file/382-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the exact commit successfully. Fresh non-mutating production
  probes returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for a same-origin
  unauthenticated request. No live limiter, OpenAI, quota, or persistence mutation occurred.

## CA-066 — Recorded Speaking could leave orphaned attempts

- Status: `FIXED`
- Area: Recorded Speaking / score persistence / data consistency
- Severity: Medium
- Evidence: recorded Speaking persisted an attempt and score in two sequential writes. If the
  attempt succeeded but the score insert returned an error or rejected, the route logged the
  failure and left the attempt permanently orphaned without a matching score.
- Fix: retain the created attempt ID and perform a compensating delete whenever score persistence
  returns an error or throws. Rollback failures remain fail-soft and are logged without hiding the
  completed assessment from the learner.
- Regression coverage: full route tests complete storage download, transcription, scoring,
  server-side overall calculation, and cleanup, then force both a resolved score-insert error and a
  rejected score write. Each case requires HTTP 200, deletion of the exact attempt ID, and removal
  of the private recording.
- Commit: `d689bad` (`Roll back orphaned speaking attempts`)
- Verification: focused 29-test recorded-Speaking route/schema coverage, the complete
  current-worktree 66-file/384-test Vitest suite, ESLint, the 150-file analytics audit, and the
  528-page production build all passed. Vercel deployed the exact commit successfully. Fresh
  non-mutating production probes returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and
  HTTP 401 for a same-origin unauthenticated request. No live limiter, OpenAI, quota, storage, or
  persistence mutation occurred.

## CA-067 — Writing could leave orphaned attempts and false saved-score events

- Status: `FIXED`
- Area: Writing scorer / score persistence / analytics integrity
- Severity: Medium
- Evidence: Writing inserted an attempt before its score. A returned error or rejected score write
  left the attempt orphaned; a returned error also continued into `writing_score_server` activity
  insertion, falsely recording a saved score even though no score row existed.
- Fix: retain the attempt ID, delete that attempt after either form of score-write failure, return
  before downstream activity logging on a resolved error, and keep rollback failures fail-soft but
  operationally visible.
- Regression coverage: complete route cases force a resolved score error with a valid anonymous
  analytics ID and a rejected score write. Both require HTTP 200 and deletion of the exact attempt;
  the resolved-error case also proves only the attempt and score writes occur, with no activity
  event.
- Commit: `7aa087a` (`Roll back orphaned writing attempts`)
- Verification: focused 21-test Writing route/schema coverage, the complete current-worktree
  66-file/386-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the exact commit successfully. Fresh non-mutating production
  probes returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for a same-origin
  unauthenticated request. No live limiter, OpenAI, quota, activity, or persistence mutation
  occurred.

## Investigation notes

- Footer trademark quotation marks initially appeared escaped in serialized browser output.
  Direct DOM text verification confirmed that the live page renders normal quotation marks; no
  defect or code change was recorded.
- The pre-fix sitemap crawlability sweep fetched all 471 advertised URLs without following
  redirects. Every URL returned HTTP 200, every rendered canonical matched the sitemap location,
  and there were no duplicate locations. Generated legacy question aliases are intentionally
  omitted in favor of their single canonical sitemap URL.
- A production security-header sweep across static HTML, dynamic pricing, the OG image API, and the
  HTTP origin confirmed enforced CSP, HSTS, MIME sniffing protection, same-origin framing, strict
  referrer policy, camera/geolocation denial, same-origin microphone access, CSP reporting, and an
  HTTP→HTTPS 308 redirect. No defect was found.
- A fresh article page rendered one AdSense unit and Google marked it `unfilled`; Google's managed
  script then emitted `Uncaught (in promise) undefined`. Because the loader tag is valid, the
  application unit rendered, and the rejection coincided with the external `unfilled` result, this
  remains recorded as third-party ad-serving behavior rather than a confirmed application defect.
- The valid newsletter-unsubscribe path requires a production-signed link from a delivered email.
  The local audit environment does not hold that signing secret and no test inbox is connected, so
  the live forged-token rejection was verified but the delivered-link click remains an explicit
  end-to-end verification gap.
- The post-publication sitemap contained 474 unique URLs. A no-redirect live crawl found all 474
  healthy, indexable, and self-canonical. One raw-HTML comparison saw `Australia&#x27;s` in a
  canonical attribute; direct DOM verification confirmed the browser correctly decodes it to the
  advertised apostrophe URL, so it is not a canonical defect.
- Signed-out production probes sent valid same-origin POST requests to billing checkout, billing
  pause, billing portal, checkout verification, realtime examiner session, Writing scoring,
  realtime Speaking scoring, and recorded Speaking scoring. All eight rejected the request with
  HTTP 401 before performing protected work.
