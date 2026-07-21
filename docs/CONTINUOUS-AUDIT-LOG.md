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

## CA-068 — Realtime Speaking ignored failed score persistence

- Status: `FIXED`
- Area: Realtime examiner / score persistence / data consistency
- Severity: Medium
- Evidence: realtime scoring inserted an attempt and then awaited the score insert without
  inspecting its returned error. Both a resolved database error and a rejected write could leave a
  permanent attempt with no corresponding score.
- Fix: inspect the score-insert result, retain the created attempt ID, and compensating-delete that
  attempt after either a returned error or a thrown persistence failure. Rollback failures remain
  fail-soft and operationally logged.
- Regression coverage: complete authenticated realtime route cases force both failure forms after
  successful model scoring and attempt insertion. Each requires HTTP 200 and deletion of the exact
  attempt ID, while existing coverage continues to verify server-calculated bands and normal
  persistence.
- Commit: `2c9128b` (`Roll back orphaned realtime attempts`)
- Verification: focused 18-test realtime route/schema coverage, the complete current-worktree
  66-file/388-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the exact commit successfully. Fresh non-mutating production
  probes returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for a same-origin
  unauthenticated request. No live limiter, OpenAI, or persistence mutation occurred.

## CA-069 — Telemetry limiter outages were reported as user rate limits

- Status: `FIXED`
- Area: Analytics ingestion / rate limiting / operational accuracy
- Severity: Medium
- Evidence: `/api/track` returned HTTP 429 whenever `check_rate_limit` supplied either a genuine
  denial or a resolved database error. Infrastructure loss was therefore indistinguishable from
  user overuse, causing telemetry failures to be classified and retried incorrectly.
- Fix: return HTTP 503 with the existing generic telemetry-unavailable response for limiter
  infrastructure errors, log the operational cause, and reserve HTTP 429 for a verified
  `allowed !== true` result without an error.
- Regression coverage: new route tests cover resolved limiter errors, rejected limiter calls,
  verified denials, and the normal HTTP 202 activity insert. Both outage forms require HTTP 503 and
  zero table writes; only verified exhaustion returns HTTP 429.
- Commit: `b31702c` (`Distinguish telemetry limiter outages`)
- Verification: focused 4-test telemetry route coverage, the complete current-worktree
  67-file/392-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the exact commit successfully. Fresh non-mutating production
  probes returned HTTP 405 for GET, HTTP 403 for a cross-origin valid payload, and HTTP 400 for a
  same-origin invalid payload. No live rate-limit or activity mutation occurred.

## CA-070 — Newsletter writes failed open on resolved limiter errors

- Status: `FIXED`
- Area: Newsletter subscription / abuse prevention / database availability
- Severity: Medium
- Evidence: the subscription handler intended to fail closed when its rate limiter was unavailable,
  but `withinLimit` returned `true` when the RPC resolved with an error. A database outage could
  therefore bypass the only per-IP write control and permit unbounded public upserts.
- Fix: throw resolved limiter errors into the handler's existing fail-closed HTTP 503 path. A
  verified `data === false` remains the only condition that returns HTTP 429, and successful
  allowance continues to upsert without revealing subscriber existence.
- Regression coverage: new route tests cover returned limiter errors, rejected calls, verified
  denials, and successful normalized-email upserts. Both outage forms require HTTP 503 and zero
  table writes.
- Commit: `63ad9f4` (`Fail closed on newsletter limiter errors`)
- Verification: focused 4-test newsletter route coverage, the complete current-worktree
  68-file/396-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the exact commit successfully. Fresh non-mutating production
  probes returned HTTP 405 for GET, HTTP 403 for a cross-origin valid payload, and HTTP 400 for a
  same-origin invalid payload. No live limiter or subscriber mutation occurred.

## CA-071 — Checkout could create duplicate unlinked Stripe customers

- Status: `FIXED`
- Area: Billing checkout / Stripe customer creation / distributed consistency
- Severity: High
- Evidence: when a user lacked `stripe_customer_id`, Checkout created a Stripe customer, logged any
  failure to save that ID in Supabase, and still attempted session creation. A failed or retried
  flow could therefore create duplicate customers with no durable account link.
- Fix: require the customer link before creating a Checkout Session. A confirmed failed link
  compensating-deletes the new Stripe customer; a rejected write is read back first so a committed
  link is never deleted. Confirmed read-back success continues, while ambiguous state stops safely
  without deleting a possibly linked customer.
- Regression coverage: Checkout tests cover returned link errors, rejected writes confirmed
  unlinked, rejected writes confirmed committed, and unavailable read-back. They require cleanup
  only when safe, prohibit session creation on failure, and preserve the linked customer on
  confirmed success or ambiguity.
- Commit: `e2975ed` (`Roll back unlinked Stripe customers`)
- Verification: focused 29-test billing route coverage, the complete current-worktree
  68-file/400-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the exact commit successfully. Fresh non-mutating production
  probes returned HTTP 405 for GET, HTTP 403 for a cross-origin POST, and HTTP 401 for a same-origin
  unauthenticated POST. No live Stripe customer, Checkout Session, or Supabase mutation occurred.

## CA-072 — Mobile navigation dialog had no accessible name

- Status: `FIXED`
- Area: Shared navbar / mobile navigation / accessibility
- Severity: Medium
- Evidence: live testing at a 390×844 viewport opened the site menu as an unnamed modal. The
  accessibility tree exposed only `dialog`, so screen-reader users received no announcement of the
  panel's purpose despite its visible navigation content.
- Fix: give the shared mobile `SheetContent` an explicit `aria-label="Site navigation"` while
  preserving the existing focus trap, Escape dismissal, trigger restoration, and close control.
- Regression coverage: the existing navbar authentication-intent tests are preserved and extended
  to require the mobile sheet's accessible label; the separate sheet test continues to exercise
  focus movement, Escape closure, and trigger restoration.
- Commit: `8fafba9` (`Name the mobile navigation dialog`)
- Verification: focused 5-test navbar/sheet coverage, the complete current-worktree
  68-file/401-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the exact commit successfully. Fresh 390×844 production browser
  QA opened the menu and the accessibility tree announced `dialog "Site navigation"` with all
  seven navigation links, CTA, close button, and sign-in action. No application console error was
  present; accumulated errors were the already documented Google-managed AdSense `unfilled`
  rejection.

## CA-073 — Pricing checkout actions had ambiguous accessible names

- Status: `FIXED`
- Area: Pricing / conversion / accessibility
- Severity: Medium
- Evidence: live mobile testing exposed the Monthly, 6 Months, and Annual checkout controls with
  the identical accessible name `Choose this plan`. A screen-reader button list therefore could
  not identify which subscription each action would purchase; only the Exam Pass action was
  distinguishable.
- Fix: give every checkout control a plan-specific accessible label while preserving the visible
  CTA copy: `Choose Monthly plan`, `Choose 6 Months plan`, `Choose Annual plan`, and
  `Get the Exam Pass`.
- Regression coverage: the pricing checkout-return suite now renders every plan and requires the
  four accessible names in plan order.
- Commit: `71a04a4` (`Name every pricing plan action`)
- Verification: focused 2-file/8-test pricing coverage, the complete current-worktree
  68-file/402-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build all passed. Vercel deployed the exact commit successfully. Fresh 390×844 production
  browser QA confirmed all four unique names in the accessibility tree and a 390px document width
  within the 390px viewport. No checkout button was activated and no Stripe or Supabase mutation
  occurred.

## CA-074 — Checkout creation had no server-side abuse limit

- Status: `FIXED`
- Area: Billing API / Stripe Checkout / abuse prevention
- Severity: High
- Evidence: any authenticated free account could call `/api/billing/checkout` repeatedly and create
  unlimited Stripe Checkout Sessions. The client disabled its buttons only while one request was
  active, so direct or parallel API calls bypassed that UI-only protection and could create
  provider-side resource and operational cost.
- Fix: apply the shared atomic Supabase rate limiter per account immediately before Stripe work,
  allowing at most 10 checkout attempts per 10-minute window. Verified exhaustion returns HTTP
  429; limiter errors and rejections fail closed with HTTP 503.
- Regression coverage: billing route tests require the exact limiter bucket, account identifier,
  window, and maximum; prove verified exhaustion returns 429; and prove both resolved and rejected
  limiter failures return 503. Every guarded failure is required to make zero Stripe calls.
- Commit: `87fb65f` (`Rate limit Stripe checkout creation`)
- Compatibility correction: `d25c684` (`Match billing limiter RPC signature`)
- Verification: all 32 billing-route tests, the complete current-worktree 68-file/405-test Vitest
  suite, ESLint, the 150-file analytics audit, and the 528-page production build passed. Vercel
  deployed the corrected state successfully. A fresh same-origin unauthenticated production POST
  returned HTTP 401 before the account limiter or Stripe path; the corrected production RPC
  contract was then exercised and cleaned up as recorded in CA-076. No Checkout Session, Stripe
  customer, payment, user, or entitlement was created or changed.

## CA-075 — Checkout reconciliation had no server-side abuse limit

- Status: `FIXED`
- Area: Billing API / Stripe session reconciliation / abuse prevention
- Severity: High
- Evidence: after authentication and checkout-session syntax validation,
  `/api/billing/verify-session` retrieved any supplied Stripe Session ID without an account-level
  request limit. A single account could therefore loop valid-looking IDs into unbounded
  provider-side reads before ownership was known.
- Fix: apply the shared atomic Supabase rate limiter before Stripe retrieval, allowing 20
  activation checks per account per 10-minute window so legitimate checkout-return retries remain
  available. Verified exhaustion returns HTTP 429; limiter errors and rejections reuse the neutral
  HTTP 503 activation-pending response.
- Regression coverage: billing and checkout-return tests require the exact limiter bucket, account
  identifier, window, and maximum; cover verified exhaustion plus resolved and rejected limiter
  failures; and prove every guarded failure makes zero Stripe retrievals.
- Commit: `ce569ff` (`Rate limit checkout reconciliation`)
- Compatibility correction: `d25c684` (`Match billing limiter RPC signature`)
- Verification: focused 2-file/41-test billing and checkout-return coverage, the complete
  current-worktree 68-file/408-test Vitest suite, ESLint, the 150-file analytics audit, and the
  528-page production build passed. Vercel deployed the corrected exact commit successfully. A
  scoped production RPC probe returned `true` over HTTP 200 with the deployed `p_max` contract;
  its single rate-limit row was deleted and a follow-up read returned no rows. No Stripe Session,
  customer, payment, user, or entitlement was created or changed.

## CA-076 — Billing limiters called a nonexistent RPC signature

- Status: `FIXED`
- Area: Billing API / Supabase integration / release regression
- Severity: Critical
- Evidence: the first CA-074 and CA-075 implementations passed `p_max_requests` to
  `check_rate_limit`, but the deployed PostgreSQL function's fourth named argument is `p_max`.
  Supabase named-argument resolution would therefore reject authenticated checkout creation and
  reconciliation, and both fail-closed routes would return HTTP 503. The route mock accepted
  arbitrary argument objects, so the initial focused and full unit suites did not expose the
  database-contract mismatch.
- Fix: change both billing RPC calls to the deployed `p_max` argument and update their exact
  contract assertions. Repository-wide inspection confirms every established caller uses the same
  `p_max` signature defined by migration `0008_rate_limits.sql`.
- Regression coverage: checkout and reconciliation tests now assert `p_max` alongside the exact
  bucket, identifier, window, and limit for both provider-facing routes, while retaining all
  exhaustion and fail-closed cases.
- Commit: `d25c684` (`Match billing limiter RPC signature`)
- Verification: focused 2-file/41-test billing and checkout-return coverage, the complete
  current-worktree 68-file/408-test Vitest suite, ESLint, the 150-file analytics audit, and the
  528-page production build passed. Vercel deployed the exact corrective commit successfully. A
  production service-role RPC call using `p_max` returned `true` over HTTP 200; its uniquely named
  one-row rate-limit probe was deleted immediately, and a follow-up production read returned an
  empty array. No Stripe or account mutation occurred.

## CA-077 — Recorded Speaking scored against missing or mismatched prompts

- Status: `FIXED`
- Area: Recorded Speaking / AI scoring integrity / provider cost
- Severity: High
- Evidence: the scoring route looked up `passageSlug` only after consuming daily quota and
  transcribing the recording. A missing passage or failed database lookup silently became
  `(question text unavailable)`, and a submitted part that conflicted with the stored prompt was
  accepted. The model could therefore grade an answer without its real question, spend provider
  resources, and persist misleading feedback.
- Fix: resolve the authoritative Speaking passage after rate limiting but before quota or OpenAI
  work. Missing prompts return HTTP 404, stored-part conflicts return HTTP 400, and database errors
  or rejections return a retryable HTTP 503. Every rejected path removes the uploaded recording;
  valid scoring now always uses a real passage ID and prompt context.
- Regression coverage: recorded Speaking route tests inject a missing passage, part mismatch,
  resolved lookup error, and rejected lookup. Each case must stop before `consume_ai_score` and
  OpenAI, return the appropriate status, and clean the owner-scoped upload.
- Commit: `3c20f21` (`Validate Speaking prompts before AI scoring`)
- Verification: all 21 focused Speaking route tests, the complete current-worktree
  68-file/412-test Vitest suite, ESLint, the 150-file analytics audit, and the 528-page production
  build passed. Vercel deployed the exact commit successfully. A fresh same-origin production POST
  with a real passage slug but no credentials returned HTTP 401 before storage, limiter, quota, or
  OpenAI work. No recording, score, attempt, quota, or account was created or changed.

## CA-078 — Speaking audio controls had ambiguous and stale accessible names

- Status: `FIXED`
- Area: Speaking practice / examiner audio / accessibility
- Severity: Medium
- Evidence: live 390×844 browser QA exposed five Part 1 audio buttons with the identical accessible
  name `Play examiner question`, so screen-reader users could not identify which prompt a control
  would play. The fixed label also continued to say `Play` while the visible control changed to
  Pause or Loading.
- Fix: identify every list control by its question number and full prompt, keep the cue-card
  control's specific context, and derive the accessible action from disabled, loading, playing, or
  idle state.
- Regression coverage: a pure label contract used by the production page tests unique multi-item
  question names plus loading, pause, cue-card, and unavailable states.
- Commit: `649d29d` (`Name every Speaking audio control`)
- Verification: focused 2-file/5-test Speaking label and SEO coverage, the complete
  current-worktree 69-file/414-test Vitest suite, ESLint, the 152-file analytics audit, and the
  528-page production build passed. Vercel deployed the exact commit successfully. Fresh 390×844
  production browser QA exposed five unique button names containing their question number and full
  text, with a 390px document width inside the 390px viewport. No audio, microphone, authentication,
  storage, scoring, or quota action was triggered.

## CA-079 — Question flag controls did not identify their questions

- Status: `FIXED`
- Area: Reading and Listening practice / question review / accessibility
- Severity: Medium
- Evidence: live 390×844 Listening QA exposed 12 separate review controls with the identical
  accessible name `Flag`. A screen-reader control list could not associate an action with a
  question, and the selected control's visible `Flagged` text did not describe the available
  unflag action.
- Fix: give the shared `QuestionItem` control a state-aware accessible name:
  `Flag question N` when idle and `Unflag question N` when selected, while retaining
  `aria-pressed` and the existing visual copy.
- Regression coverage: a shared-question component test verifies both accessible names,
  corresponding pressed states, and that activation passes the correct continuous question number
  to the flag handler.
- Commit: `661f1bb` (`Name question flag actions`)
- Verification: focused 2-file/10-test QuestionItem and grading coverage, the complete
  current-worktree 70-file/416-test Vitest suite, ESLint, the 153-file analytics audit, and the
  528-page production build passed. Vercel deployed the exact commit successfully. Fresh 390×844
  production QA exposed unique names for all 12 Listening controls, changed question 1 from
  `Flag question 1` to `Unflag question 1`, then restored it to its original unflagged state. The
  document remained 390px wide in the 390px viewport. No answer, submission, score, authentication,
  or server mutation occurred.

## CA-080 — Listening intro dialog did not contain or restore keyboard focus

- Status: `FIXED`
- Area: Listening practice / intro dialog / keyboard accessibility
- Severity: High
- Evidence: the one-time Listening explainer focused its close button and handled Escape, but it
  did not trap forward or reverse Tab navigation and did not restore the previously focused
  element when removed. Keyboard users could move into the obscured question page and lose their
  place after closing the modal.
- Fix: integrate the established shared dialog-focus contract for initial focus, outside-focus
  recovery, forward and reverse wrapping, Escape dismissal, and opener restoration. Keep scroll
  locking separate and use stable refs so changing `Don’t show this again` does not reset focus or
  return stale preference state.
- Regression coverage: Listening integration tests verify initial focus, both Tab wrap directions,
  Escape, opener restoration, and the current checkbox preference after internal state changes;
  the shared focus-hook tests retain their own containment and restoration coverage.
- Commits: `c9df43f` (`Trap focus in Listening intro`) and `0564479`
  (`Reuse shared Listening dialog focus`)
- Verification: focused 2-file/6-test Listening and shared-dialog coverage, the complete
  current-worktree 71-file/419-test Vitest suite, ESLint, the 154-file analytics audit, and the
  528-page production build passed. Vercel deployed the exact final commit successfully. Fresh
  390×844 production QA confirmed initial Close focus, reverse wrap to the final CTA, forward wrap
  back to Close, Escape dismissal, and a 390px document width in the 390px viewport. No preference,
  answer, audio, authentication, or account state was changed.

## CA-081 — Speaking Examiner intro had no keyboard-accessible dismissal

- Status: `FIXED`
- Area: Live Speaking Examiner / intro dialog / keyboard accessibility
- Severity: High
- Evidence: the Premium examiner explainer rendered as an `aria-modal` dialog but provided only a
  mouse-clickable backdrop and `Start my interview`. It had no Close control, no Escape handler,
  no focus containment or restoration, and no scroll lock. A keyboard user could neither dismiss
  the explainer without starting a microphone session nor remain reliably inside the modal.
- Fix: extract the intro into a dedicated component using the shared dialog-focus contract; add a
  visible Close action, Escape dismissal, forward/reverse focus wrapping, opener restoration, and
  scroll lock. Stable refs preserve the latest preference while keeping dismiss/start callbacks
  deterministic, and the existing start path still closes before requesting a session.
- Regression coverage: component tests verify Close and both Tab directions, Escape without
  starting, opener restoration, the current `Don’t show again` value, exactly-once start, and
  close-before-start ordering. Shared dialog-focus and examiner SEO coverage run alongside them.
- Commit: `a2e7779` (`Make examiner intro keyboard dismissible`)
- Verification: focused 3-file/8-test examiner, dialog-focus, and SEO coverage, the complete
  current-worktree 72-file/422-test Vitest suite, ESLint, the 156-file analytics audit covering 269
  interactive controls, and the 528-page production build passed. Vercel deployed the exact commit
  successfully. Fresh 390×844 production QA confirmed the unchanged signed-out Premium gate,
  matching title/canonical/description/OG metadata, and a 390px document width. The gated dialog
  contract was exercised in component tests rather than creating a paid Realtime session; no
  payment, microphone, quota, or account mutation occurred.

## CA-082 — Customer Portal session creation had no server-side abuse limit

- Status: `FIXED`
- Area: Billing API / Stripe Customer Portal / abuse prevention
- Severity: High
- Evidence: any authenticated account with a Stripe customer ID could call `/api/billing/portal`
  repeatedly and create unlimited provider-side Customer Portal Sessions. The Billing page disabled
  its button only while one browser request was active, so direct or parallel API calls bypassed
  that UI-only protection.
- Fix: apply the shared atomic Supabase rate limiter per verified account immediately before any
  Stripe work, allowing at most 10 portal requests per 10-minute window. Verified exhaustion
  returns HTTP 429; resolved and rejected limiter failures fail closed with HTTP 503.
- Regression coverage: the portal route suite requires the exact `billing-portal` bucket, account
  identifier, 600-second window, deployed `p_max` argument, and maximum of 10. It proves a verified
  no-customer account does not consume the limiter, exhaustion returns 429, and both limiter error
  forms return 503; every guarded outcome is required to make zero Stripe calls.
- Commit: `ef0b896` (`Rate limit billing portal sessions`)
- Verification: focused 12-test portal coverage, the five-file/70-test billing suite, the complete
  72-file/425-test Vitest suite, ESLint, the strict 156-file analytics audit covering 269
  interactive controls, and the 528-page production build passed. Vercel deployment
  `dpl_9WZoCk17X1arn5FQZMLQqZkGtBiv` reached `READY` from exact Git SHA
  `ef0b896f92004cd73a6be2563228fffdfc177d78` with all production aliases. Fresh production probes
  returned HTTP 405 with `Allow: POST` for GET, HTTP 403 for a hostile-origin POST, and HTTP 401 for
  a same-origin unauthenticated POST. No rate-limit row, Portal Session, Stripe customer, payment,
  subscription, entitlement, or account state was created or changed.

## CA-083 — Failed subscription-pause mutations could be retried without limit

- Status: `FIXED`
- Area: Billing API / one-time subscription pause / Stripe mutation / abuse prevention
- Severity: Medium
- Evidence: the pause route atomically reserved its one-time action before calling Stripe and
  correctly released that exact reservation when Stripe rejected the update. That rollback made a
  legitimate retry possible, but also let an authenticated eligible account repeatedly invoke the
  provider mutation during a Stripe outage or stale-subscription failure with no request ceiling.
  The route suite also lacked direct method, origin, and missing-auth boundary coverage.
- Fix: apply the shared atomic Supabase limiter per verified eligible account before the one-time
  claim, allowing five pause attempts per 10-minute window. Verified exhaustion returns HTTP 429;
  resolved and rejected limiter failures fail closed with HTTP 503 before any database mutation or
  Stripe request.
- Regression coverage: the expanded pause suite asserts POST-only and same-origin enforcement,
  missing-auth rejection, the exact `billing-pause` bucket, account identifier, 600-second window,
  deployed `p_max` argument, and maximum of five. It covers exhaustion plus both limiter failure
  forms and requires zero claims and zero Stripe calls on every guarded branch; all prior atomic
  claim, concurrent request, exact rollback, reconciliation, expiry, and repeat-use cases remain.
- Commit: `decd908` (`Rate limit subscription pause retries`)
- Verification: focused 20-test pause coverage, the five-file/75-test billing suite, the complete
  72-file/430-test Vitest suite, ESLint, the strict 156-file analytics audit covering 269
  interactive controls, and the 528-page production build passed. Vercel deployment
  `dpl_8GvmxSEkGFEWUaFMMjkPB53oJQuV` reached `READY` from exact Git SHA
  `decd908614e474727e984ddd1ed829844a6c9d95`. Fresh production probes returned HTTP 405 for GET,
  HTTP 403 for a hostile-origin POST, and HTTP 401 for a same-origin unauthenticated POST. No
  rate-limit row, pause claim, Stripe subscription, payment, entitlement, or account state was
  created or changed.

## CA-084 — Newsletter unsubscribe network failures escaped the route contract

- Status: `FIXED`
- Area: Lifecycle email / newsletter unsubscribe / Supabase failure recovery
- Severity: High
- Evidence: after validating a signed unsubscribe link, the route awaited its Supabase update
  without a rejection guard. A network-level failure or client-construction exception could escape
  the handler as an uncontrolled server error instead of returning the route's intended temporary-
  unavailability response. Only the generic wrong-method contract was tested; no route test proved
  valid signed updates, forged-link rejection, missing configuration, or dependency failures.
- Fix: guard both admin-client construction and the signed subscriber update, treat resolved and
  rejected database failures identically, log the operational cause server-side, and always return
  the neutral HTTP 503 response without exposing provider details.
- Regression coverage: a new six-case route suite proves GET-only behavior with `Allow: GET`, forged
  token rejection before admin-client creation, controlled missing-configuration handling, exact
  normalized-email updates for a valid HMAC link, and HTTP 503 recovery for both resolved and
  rejected Supabase failures. Existing lifecycle rendering, provider suppression, token-secret,
  and shared API-method contracts run alongside it.
- Commit: `8303eaf` (`Recover newsletter unsubscribe failures`)
- Verification: focused three-file/15-test unsubscribe and lifecycle coverage, the complete
  73-file/436-test Vitest suite, ESLint, the strict 156-file analytics audit covering 269
  interactive controls, and the 528-page production build passed. Vercel deployment
  `dpl_FN8CtaXQ2VnrSxQJGjbNch6GH5nW` reached `READY` from exact Git SHA
  `8303eaf553ed909c8b5f21162ec08e2e3e1dec84`. Fresh production probes returned HTTP 405 with
  `Allow: GET` for POST and HTTP 400 for a deliberately forged signed link, both before database
  access. The valid-link and injected failure paths were verified in tests; no subscriber,
  lifecycle-email, provider, account, or consent state was created or changed in production.

## CA-085 — Band Estimator shares rendered the generic OG category

- Status: `FIXED`
- Area: Band Estimator / Open Graph image / social sharing
- Severity: Medium
- Evidence: the Band Estimator metadata correctly requested `/api/og` with `type=estimator`, but
  the image renderer's private allowlist had no `estimator` entry. It silently fell back to
  `IELTS PRACTICE`; direct production image inspection confirmed that generic pill beside the
  estimator-specific title and subtitle. The SEO test validated the emitted query parameter but
  never connected it to renderer support.
- Fix: centralize the OG category labels in a pure shared contract, add the dedicated
  `Band Estimator` label, preserve an explicit generic fallback for unknown values, and make the
  Edge renderer consume the shared resolver.
- Regression coverage: the OG contract suite enumerates every supported category, requires the
  estimator mapping, and covers normalization plus unknown/empty fallback behavior. The Band
  Estimator SEO test now passes its emitted `type` through the real resolver and requires
  `BAND ESTIMATOR`, preventing the metadata and renderer contracts from drifting independently.
- Commit: `4eab3bc` (`Label Band Estimator OG cards`)
- Verification: focused two-file/four-test estimator coverage, the 19-file/63-test SEO and social-
  card cluster, the complete 74-file/438-test Vitest suite, ESLint, the strict 156-file analytics
  audit covering 269 interactive controls, and the 528-page production build passed. Vercel
  deployment `dpl_abW8sNjEmSjuXVLzjh1LkY8A3Deo` reached `READY` from exact Git SHA
  `4eab3bc20eb14dccf2ccfc98cb34f4e77d2d5fdc`. Fresh production visual QA loaded the generated
  1200×630 image and confirmed the visible `BAND ESTIMATOR` pill with the intended title and
  subtitle. The live page retained matching canonical, title, description, OG image, Twitter
  image, and Twitter image-alt metadata. No account, analytics preference, payment, or content
  state was changed.

## CA-086 — CSP violation telemetry could leak URL secrets into production logs

- Status: `FIXED`
- Area: Security telemetry / CSP reporting / log privacy
- Severity: High
- Evidence: `/api/csp-report` bounded the reported document and blocked-resource fields but logged
  each URL verbatim. OAuth callbacks, signed links, private object URLs, and third-party resources
  can carry codes, tokens, email addresses, or credentials in their query strings, fragments, or
  authority components, so a browser-generated CSP violation could copy those secrets into
  production logs. Free-text fields also retained control characters that could corrupt log lines.
- Fix: normalize all logged fields; strip credentials, query strings, and fragments from HTTP(S)
  URLs; reduce opaque schemes such as `data:` to the scheme only; remove control characters; and
  preserve strict per-field size limits. Malformed reports remain safely acknowledged without
  throwing or echoing their body.
- Regression coverage: a new five-case route suite proves POST-only behavior with `Allow: POST`,
  legacy and Reporting API payload parsing, credential/query/fragment removal, opaque-scheme
  handling, malformed-JSON recovery, control-character removal, strict limits, and exclusion of
  unapproved fields such as the original policy.
- Commit: `cedd6ce` (`Redact secrets from CSP reports`)
- Verification: the focused five-test route suite, the complete 75-file/443-test Vitest suite,
  ESLint, the strict 156-file analytics audit covering 269 interactive controls, and the 528-page
  production build passed. Vercel deployment `dpl_7tWKcs1xXeVqH535NQCw1THmg2sj` reached `READY`
  from exact Git SHA `cedd6ce8f1d33a5195682564749fd2e6f7e48f1f`. A fresh production GET returned
  HTTP 405 with `Allow: POST`, and a synthetic report containing deliberately fake query and
  fragment secrets returned HTTP 204. Sanitized log shape and secret exclusion are asserted at the
  route boundary; no account, payment, consent, content, or provider state was created or changed.

## CA-087 — The public CSP report sink allowed unbounded production-log flooding

- Status: `FIXED`
- Area: Security telemetry / CSP reporting / abuse prevention
- Severity: High
- Evidence: `/api/csp-report` is intentionally unauthenticated so browsers can deliver violation
  reports, but every non-empty POST produced a production warning with no request ceiling. The
  16-kilobyte body cap limited one request only; a direct or distributed caller could still create
  unlimited log volume, cost, and noise capable of burying genuine security diagnostics. Malformed
  bodies also produced empty warning entries.
- Fix: discard empty or malformed reports before any database or logging work, then apply the shared
  atomic Supabase limiter at 30 accepted reports per IP and 300 globally per 60-second window.
  Verified exhaustion and limiter outages return the same neutral HTTP 204 without logging the
  untrusted report. Limiter-error diagnostics contain no request data and are themselves throttled
  to one per minute per warm function instance.
- Regression coverage: the expanded ten-case route suite requires the exact `csp-report-ip` and
  `csp-report-global` buckets, server-derived IP, 60-second window, and 30/300 ceilings. It proves
  both denial branches, resolved and rejected limiter failures, malformed-report early exit, zero
  report logs on every dropped path, POST-only handling, both CSP payload formats, URL redaction,
  control-character removal, strict field limits, and one-per-minute limiter-error diagnostics.
- Commits: `2488925` (`Rate limit CSP report logging`) and `56bf5d0`
  (`Test CSP limiter error throttling`)
- Verification: the focused ten-test route suite, the complete 75-file/448-test Vitest suite,
  ESLint, the strict 156-file analytics audit covering 269 interactive controls, and the 528-page
  production build passed. Vercel deployment `dpl_4FEKGwJ758UVQqmx7nyApfTaevRm` reached `READY`
  from exact Git SHA `2488925861b331760551916e19b134f446a95864`. Fresh production probes returned
  HTTP 405 with `Allow: POST` for GET and HTTP 204 for both an empty payload and one valid synthetic
  report. A read-only post-probe database query found exactly one check in each new limiter bucket;
  the empty payload created none. Live schema inspection confirmed RLS, the atomic composite unique
  index, the cleanup index, and service-role-only function execution with no `anon` or
  `authenticated` access. The synthetic report changed only its two temporary limiter counters and
  emitted one sanitized diagnostic; no account, payment, consent, content, or provider state
  changed.

## CA-088 — Recording cleanup reported success after Supabase Storage failures

- Status: `FIXED`
- Area: Scheduled maintenance / Supabase Storage / speaking-recording retention
- Severity: High
- Evidence: the daily cleanup cron checked failures while deleting old rate-limit rows and loading
  users, but discarded the error returned by every Storage listing. It also ignored failed Storage
  removals and simply omitted those files from `recordingsRemoved`. A provider outage or permission
  regression could therefore leave recordings beyond the documented 30-day retention window while
  the endpoint returned HTTP 200 with `{ok:true}`, preventing Vercel Cron from surfacing the failed
  maintenance run.
- Fix: treat admin-client construction, rate-limit deletion, user lookup, every Storage listing,
  and every Storage removal as explicit failure boundaries. Both resolved provider errors and
  rejected network calls now produce a controlled HTTP 503, log only the server-side operational
  cause, stop the run, and never count a recording unless Storage confirmed its deletion.
- Regression coverage: a new 13-case route suite proves method and bearer-secret gates, missing and
  invalid admin configuration, resolved and rejected failures for the database cleanup, user query,
  Storage listing, and Storage removal, zero downstream work after each guard, 30-day selection,
  exact bucket/path/options contracts, exclusion of current recordings, and the precise successful
  removal count.
- Commit: `39489bf` (`Surface cleanup storage failures`)
- Verification: the focused 13-test cleanup suite, the complete 76-file/461-test Vitest suite,
  ESLint, the strict 156-file analytics audit covering 269 interactive controls, and the 528-page
  production build passed. Vercel deployment `dpl_2uwH8RzpF3hr5urQsdTrHviESM2W` reached `READY`
  from exact Git SHA `39489bfda8de55637ffd177f3bf1cea903d669e0`. Fresh production probes returned
  HTTP 405 with `Allow: GET` for POST and HTTP 401 for an invalid bearer secret, both before database
  or Storage access. A separate read-only service-role Storage request confirmed the live
  `speaking-uploads` bucket was reachable without exposing object names. The authorized deletion
  path was deliberately verified with injected dependencies rather than run against customer
  recordings; no database, recording, account, payment, consent, content, or provider state
  changed.

## CA-089 — Daily reports returned success when their system-of-record write failed

- Status: `FIXED`
- Area: Analytics / scheduled daily report / Supabase persistence
- Severity: High
- Evidence: the route explicitly defines `daily_reports` as its system of record, but a resolved
  Supabase upsert error was only written to the server log. Execution then continued to the email
  step and returned HTTP 200 with `{ok:true}` and the transient in-memory report. A database outage,
  constraint regression, or permission failure could therefore produce a success signal—and
  potentially an emailed report—while leaving no durable daily record for trends or later audits.
- Fix: make a non-null upsert error fail the run inside the existing recovery boundary. Persistence
  must now succeed before email delivery is considered or HTTP 200 is returned; resolved provider
  errors and rejected network calls both produce the same controlled HTTP 503 response.
- Regression coverage: a new eight-case route suite proves method and bearer-secret gates, missing
  configuration, required-source failures, the optional-retention fail-soft contract, exact
  `report_date` upsert semantics, persistence-before-success ordering, and zero email calls after
  both resolved and rejected system-of-record write failures.
- Commit: `7cbffe2` (`Fail closed when report persistence fails`)
- Verification: the focused eight-test daily-report suite, the complete 77-file/469-test Vitest
  suite, ESLint, the strict 156-file analytics audit covering 269 interactive controls, and the
  528-page production build passed. Vercel deployment `dpl_7BpLtpNwL9KYBUruCwimjf5qQLx5`
  reached `READY` from exact Git SHA `7cbffe29dbaf6d51962857e4005b3c0cd7ad960d`. Fresh production
  probes returned HTTP 405 with `Allow: GET` for POST and HTTP 401 for an invalid bearer secret,
  both before report generation, persistence, or email delivery. A read-only live database check
  confirmed `report_date` is the `daily_reports` primary key used by the upsert and found three
  existing durable reports. The authorized cron/backfill path was deliberately verified with
  injected dependencies to avoid generating a duplicate report or administrative email; no
  database, email, account, payment, consent, content, or provider state changed.

## CA-090 — An optional retention RPC rejection aborted the entire daily report

- Status: `FIXED`
- Area: Analytics / scheduled daily report / Supabase RPC recovery
- Severity: Medium
- Evidence: `returning_visitor_stats` is explicitly optional because deployments can temporarily
  lack the function, and a resolved Supabase error correctly produced `retention: null`. A
  network-level rejection from the same RPC escaped the shared `Promise.all`, however, causing the
  whole report to return HTTP 503 before otherwise healthy signup, activity, practice, and history
  data could be persisted. The documented fail-soft contract therefore depended on the provider's
  error transport rather than the feature's actual importance.
- Fix: isolate the optional RPC behind a recovery helper that normalizes rejected calls to the same
  `{data:null,error}` shape as resolved Supabase failures. The existing diagnostic remains, while
  required source queries and system-of-record persistence continue to fail closed.
- Regression coverage: the nine-case daily-report route suite now injects a rejected retention RPC,
  requires HTTP 200 with `retention: null`, verifies the exact UTC query range and function name,
  and proves that the degraded report is still written. All prior method, auth, configuration,
  required-query, persistence-ordering, resolved-error, and rejected-upsert cases remain covered.
- Commit: `1eaba77` (`Recover optional retention report failures`)
- Verification: the focused nine-test daily-report suite, the complete 77-file/470-test Vitest
  suite, ESLint, the strict 156-file analytics audit covering 269 interactive controls, and the
  528-page production build passed. Vercel deployment `dpl_FkJ8RSzWHekPau4xhQJ2dEhU2vAn`
  reached `READY` from exact Git SHA `1eaba774a71e13366fbc712d42c34f466534aab0`. Fresh production
  probes returned HTTP 405 for POST and HTTP 401 for an invalid bearer-secret GET, both before
  report generation or mutation. The authorized degraded-RPC branch was verified with injected
  dependencies rather than by disrupting the live function; no database, email, account, payment,
  consent, content, or provider state changed.

## CA-091 — A best-effort report email failure retried an already-persisted cron run

- Status: `FIXED`
- Area: Analytics / scheduled daily report / Resend delivery recovery
- Severity: High
- Evidence: report email is documented as best-effort after `daily_reports` persistence. Resend HTTP
  failures returned a neutral `{sent:false}` result, but a rejected `fetch` escaped to the route's
  outer catch and changed the completed run to HTTP 503. Vercel Cron could then retry an already-
  persisted report; if Resend had accepted the first request before its response was lost, that
  retry could deliver a duplicate administrative email.
- Fix: contain the complete provider request inside the best-effort delivery boundary. Confirmed
  HTTP failures and rejected network calls now log only an operational cause and return distinct
  non-throwing reasons while preserving HTTP 200 for the durable report. Required report queries
  and persistence still fail closed.
- Regression coverage: the expanded 12-case daily-report suite proves a successful Resend request's
  endpoint, bearer header, recipient, subject, and rendered HTML; preserves the report across a
  provider HTTP 503; preserves it across a rejected network call; and requires exactly one durable
  upsert in every delivery outcome. All persistence, optional-RPC, source, auth, method, and
  configuration cases remain covered.
- Commit: `9a43a97` (`Keep report email delivery fail-soft`)
- Verification: the focused 12-test daily-report suite, the complete 77-file/473-test Vitest suite,
  ESLint, the strict 156-file analytics audit covering 269 interactive controls, and the 528-page
  production build passed. Vercel deployment `dpl_Cfawr2i87pj53tJQb6nxnrRb8gAf` reached `READY`
  from exact Git SHA `9a43a97a4246b95e3b6231b1abba8b760d7ed7b6`. Fresh production probes returned
  HTTP 405 for POST and HTTP 401 for an invalid bearer-secret GET, both before persistence or email
  delivery. Provider success, HTTP failure, and network rejection were verified with injected
  `fetch` responses rather than by sending administrative email; no database, email, account,
  payment, consent, content, or provider state changed.

## CA-092 — Invalid backfill dates could generate or email the wrong reporting day

- Status: `FIXED`
- Area: Analytics / scheduled daily report / manual backfill validation
- Severity: Medium
- Evidence: the documented `?date=YYYY-MM-DD` override was checked only with a shape regex. A typo
  with the wrong shape, an empty value, or a repeated query parameter silently fell back to
  yesterday, while impossible calendar dates passed through to later database parsing. Current or
  future dates were also accepted even though their UTC reporting period was incomplete. An
  authenticated operator mistake could therefore overwrite/email yesterday unexpectedly, fail as
  a misleading database error, or persist an empty/partial report.
- Fix: validate every explicit override before admin-client creation. Accepted values must be one
  scalar canonical calendar date in `YYYY-MM-DD` form and strictly earlier than the current UTC
  day; all other explicit values return HTTP 400. An omitted override retains the intended previous-
  UTC-day default.
- Regression coverage: the expanded 20-case daily-report suite rejects malformed, empty,
  impossible, repeated, future, and current-day values before any database call; accepts a real leap
  day; verifies its exact UTC start/end range and persisted key; and proves the omitted override
  resolves to the previous completed UTC day. All auth, persistence, optional-RPC, and email cases
  remain covered.
- Commit: `49c56c1` (`Validate daily report backfill dates`)
- Verification: the focused 20-test daily-report suite, the complete 77-file/481-test Vitest suite,
  ESLint, the strict 156-file analytics audit covering 269 interactive controls, and the 528-page
  production build passed. Vercel deployment `dpl_AZ1kLVFzmYhbZnTrVKhKdGPpchGV` reached `READY`
  from exact Git SHA `49c56c1387a3f32cca98087330233cb39d24fd20`. Fresh production probes returned
  HTTP 405 for POST and HTTP 401 for an invalid bearer-secret request containing an impossible date,
  proving both public gates remained ahead of protected work. The authenticated HTTP 400 and valid
  backfill branches were verified with injected dependencies because running them live would
  require the owner-only cron secret and could persist/email a report; no database, email, account,
  payment, consent, content, or provider state changed.

## CA-093 — A rejected lifecycle delivery stranded its claim and stopped the batch

- Status: `FIXED`
- Area: Lifecycle email / delivery queue / provider failure recovery
- Severity: High
- Evidence: `deliverDue` safely handled provider responses shaped as `{sent:false}`, but a rejected
  delivery promise escaped the loop after the row had been atomically claimed as `sending`. The
  remaining due emails were skipped until the next cron run, and the rejected row remained claimed
  for at least 15 minutes. On its fifth attempt the stale reclaimer's `< 5` filter could leave that
  row in `sending` indefinitely rather than recording a terminal failure.
- Fix: contain each provider call inside its claimed row. A rejected call now becomes a normalized,
  control-character-free, size-bounded failure reason, is persisted immediately as `failed`, and
  allows the loop to continue. A missing or malformed provider result also receives a stable
  `delivery-failed` reason; successful delivery behavior and the Resend idempotency key are
  unchanged.
- Regression coverage: the six-case lifecycle safety suite now runs a two-row batch whose first
  fifth-attempt delivery rejects with control characters and whose second succeeds. It requires the
  first row to move from `sending` attempt five to a sanitized terminal failure, the second row to
  be claimed and marked sent, both provider calls to execute, and the aggregate sent/failed counts
  to remain exact. Consent, suppression, stale reclaim, and successful marketing delivery coverage
  remains active.
- Commit: `fe45057` (`Recover rejected lifecycle deliveries`)
- Verification: the focused six-test lifecycle suite, the complete 77-file/482-test Vitest suite,
  ESLint, the strict 156-file analytics audit covering 269 interactive controls, and the 528-page
  production build passed. Vercel deployment `dpl_9NrcnrvNYqrqpWpdHemXWD5D5FRv` reached `READY`
  from exact Git SHA `fe45057b8adfec580d52ac1ef6054e98efd9e473`. Fresh production probes returned
  HTTP 405 for POST and HTTP 401 for an invalid bearer-secret GET, both before queue or provider
  work. A read-only live queue check found seven sent rows and zero stale or terminal-stale
  `sending` rows. Rejection and continuation paths used injected providers rather than live email;
  no queue, email, account, payment, consent, content, or provider state changed.

## CA-094 — A process crash on lifecycle attempt five left the row permanently `sending`

- Status: `FIXED`
- Area: Lifecycle email / stale claims / terminal retry state
- Severity: High
- Evidence: the stale-claim reclaimer selected only `sending` rows with `attempts < 5`. If a
  serverless process timed out or terminated after atomically claiming the fifth attempt but before
  recording its provider result, the row had `attempts = 5` and could never match either the stale
  reclaimer or the due-email query. It remained `sending` forever, hiding the terminal delivery
  failure from queue counts and operations.
- Fix: reclaim every unsent `sending` row older than 15 minutes into `failed`, regardless of attempt
  count. The existing due query still requires `attempts < 5`, so attempts one through four return
  to the retry queue while attempt five becomes a visible terminal failure with no sixth delivery.
- Regression coverage: the lifecycle stale-claim test now returns both a retryable and terminal row,
  requires both to be updated to `failed`, and records every query predicate. It explicitly proves
  the reclaimer filters only `status = sending`, `sent_at is null`, and the 15-minute cutoff—never
  attempt count—while the wider suite retains fifth-attempt rejection and batch-continuation
  coverage.
- Commit: `7e55edf` (`Recover terminal lifecycle claims`)
- Verification: the focused six-test lifecycle suite, the complete 77-file/482-test Vitest suite,
  ESLint, the strict 156-file analytics audit covering 269 interactive controls, and the 528-page
  production build passed. Vercel deployment `dpl_5iCdhfK8yAxhLaxFDLxG6DPiUFe6` reached `READY`
  from exact Git SHA `7e55edf0aa68972bade1c775afde9e17fe6f372d`. Fresh production probes returned
  HTTP 405 for POST and HTTP 401 for an invalid bearer-secret GET, both before queue work. A
  read-only live query found zero stale `sending` rows and zero terminal stale claims, so no live
  repair was required. Crash recovery was verified with injected queue results; no queue, email,
  account, payment, consent, content, or provider state changed.

## CA-095 — Recording retention inspected only the first 1,000 files in each user folder

- Status: `FIXED`
- Area: Privacy / recording retention / Supabase Storage pagination
- Severity: High
- Evidence: the daily cleanup requested one `speaking-uploads` listing per user with
  `limit: 1000` and no subsequent page. Because every recording is stored below its owner's folder,
  any object beyond that first page was never evaluated against the 30-day cutoff and could remain
  indefinitely. A full first page also concealed failures on later pages, while a future attempt to
  pass more than 1,000 expired paths to one removal request would exceed the provider's batch limit.
- Fix: enumerate each user folder with deterministic name ordering and 1,000-object offset pages,
  collecting all expired paths before any deletion begins. Remove the completed set in bounded
  1,000-object batches and count only successful batches; any listing or removal error still fails
  the protected run with a controlled HTTP 503.
- Regression coverage: the expanded 15-case cleanup suite proves exact offsets and sort options,
  traversal beyond a full first page, exclusion of current files on later pages, two bounded removal
  batches for 1,002 expired recordings, an exact aggregate count, and zero partial deletion when the
  second listing page fails. All method, auth, configuration, rate-limit cleanup, user-query,
  Storage rejection, and removal-failure coverage remains active.
- Commit: `b6ec291` (`Paginate recording retention cleanup`)
- Verification: the focused 15-test cleanup suite, the complete 77-file/484-test Vitest suite,
  ESLint, the strict 156-file analytics audit covering 269 interactive controls, and the 528-page
  production build passed. Vercel deployment `dpl_C93HJM1oipd3hhjp6KyotqmXiz1K` reached `READY`
  from exact Git SHA `b6ec2916a6802656597f43370946347ebdd2dfb8`. Fresh canonical-production
  probes returned HTTP 405 with `Allow: GET` for POST and HTTP 401 for an invalid bearer-secret GET,
  both before database or Storage work. A read-only live Storage-metadata aggregate found seven
  objects across six owner prefixes, a current maximum of two objects per prefix, and zero prefixes
  above the old 1,000-object boundary. The authorized cleanup was deliberately verified with
  injected dependencies instead of deleting customer recordings; no database, recording, account,
  payment, consent, content, or provider state changed.

## CA-096 — Recording retention derived owner folders from an incomplete, capped profile mirror

- Status: `FIXED`
- Area: Privacy / recording retention / Storage owner discovery
- Severity: High
- Evidence: cleanup discovered recording folders by selecting at most 5,000 IDs from
  `public.users`. Growth past that hard ceiling would silently exclude every later owner, and the
  profile table is not a reliable Storage index even below it. A read-only live integrity check
  found 45 auth users but only 43 mirrored profile rows; one of those two unmatched users owns a
  current recording, so the old job already omitted a real Storage folder on every run. The object
  was not yet 30 days old, but it could never become eligible through that scan.
- Fix: remove the profile-table dependency and enumerate the private bucket itself. Cleanup now
  pages the root and every discovered folder in deterministic name order, traverses nested folders,
  includes any legacy root-level objects, suppresses duplicate prefixes, and only starts bounded
  removals after the complete Storage tree has been inspected. Database rate-limit cleanup remains
  fail-closed and runs before recording work.
- Regression coverage: the rewritten 15-case cleanup suite proves the route never queries
  `public.users`; reaches an owner on the second root page after 1,000 folders; follows nested
  folders; evaluates root-level files; excludes current recordings; preserves multi-page file and
  1,000-object removal batching; and performs zero partial deletion when a later listing fails.
  Method, authentication, configuration, rate-limit, Storage rejection, and removal-failure cases
  remain active.
- Commit: `2e7bb21` (`Scan every recording storage folder`)
- Verification: the focused 15-test cleanup suite, the complete 77-file/484-test Vitest suite,
  ESLint, the strict 156-file analytics audit covering 269 interactive controls, and the 528-page
  production build passed. Vercel deployment `dpl_2chwEgPudu54vmRzihvHpVi78mft` reached promoted
  `READY` from exact Git SHA `2e7bb2187ff9c5ab775c32ffdec4d772dc9e0d75`. Fresh production
  probes returned HTTP 405 with `Allow: GET` for POST and HTTP 401 for an invalid bearer-secret GET,
  both before Storage access. The exact new traversal then ran read-only against live Storage and
  inspected six folders, seven listing pages, and all seven objects; it found zero expired or
  root-level objects. The authorized mutating cleanup was not invoked, so no database, recording,
  account, payment, consent, content, or provider state changed.

## CA-097 — Privileged profile deletion could orphan a live Auth account and erase dependent data

- Status: `FIXED`
- Area: Auth / profile integrity / database deletion safety
- Severity: High
- Evidence: the documented 1:1 `auth.users` → `public.users` invariant was false in production:
  45 Auth accounts existed but only 43 profile rows. Both unmatched accounts were confirmed,
  non-anonymous users; one owned a current private recording. Neither had surviving quota, attempt,
  purchase-email, or billing-event rows, although they had 47 activity events in aggregate. The
  enabled signup trigger had successfully mirrored all eight newer accounts after the latest
  orphan, isolating the cause to privileged/out-of-band profile deletion rather than an active
  signup failure. Deleting `public.users` also cascades through quota and practice foreign keys, so
  such an operation could silently erase account state while leaving Auth alive.
- Fix: add an idempotent migration that backfills every missing profile from authoritative Auth
  metadata with the original Auth timestamps, restores missing quota rows, and installs a hardened
  `BEFORE DELETE` guard. A direct profile delete is rejected with SQLSTATE 23503 while the Auth
  owner exists. Proper account deletion through `auth.users` remains allowed and cascades normally.
  The security-definer trigger function uses an empty search path and has no direct execution grant
  for `anon`, `authenticated`, or `service_role`.
- Regression coverage: a new four-case migration contract suite requires the idempotent profile and
  quota backfills, Auth-derived anonymity and timestamps, the conditional 23503 guard, exact trigger
  wiring, empty search path, and privilege revocation. The committed apply script performs the
  migration and its integrity/metadata assertions in one transaction and supports a guaranteed-
  rollback dry run. The exact migration passed that dry run before publication. A separate
  rollback-only temporary-table integration proved that parent/Auth deletion still cascades while
  direct child/profile deletion is blocked.
- Commit: `40b6ac7` (`Protect auth profile mirror rows`)
- Verification: the focused four-test migration suite, the complete 78-file/488-test Vitest suite,
  ESLint, the strict 156-file analytics audit covering 269 interactive controls, and the 528-page
  production build passed. Vercel deployment `dpl_GyDiKQ3c9ixgZqs3MnnNzcXadLX1` reached promoted
  `READY` from exact Git SHA `40b6ac77642f72e38516ef41189baee629f07f7c`. The production
  migration committed with zero remaining auth/profile gaps, zero profile/quota gaps, and the guard
  enabled. A disposable production Auth account then proved synchronous profile/quota creation,
  direct-delete rejection with 23503, preservation after that rejection, proper Auth cascade
  deletion, and zero residual Auth, profile, quota, or lifecycle rows. Final read-only security
  checks confirmed RLS remains enabled, no client DELETE policy exists, the trigger is enabled, and
  no API role can directly execute its function. The Supabase advisor connector was permission-
  blocked, so equivalent live catalog/privilege checks were run directly. The only customer-state
  changes were restoring the two missing profile and quota rows; no billing, payment, email,
  recording, attempt, entitlement, consent, or content state changed.

## CA-098 — Four privileged database functions retained a mutable application search path

- Status: `FIXED`
- Area: Supabase / database function security / defense in depth
- Severity: Low
- Evidence: a live inventory of every public `SECURITY DEFINER` function found
  `check_rate_limit`, `handle_new_user`, `handle_user_update`, and `record_login` configured with
  `search_path=public`; every other privileged function already used an empty path. `anon`,
  `authenticated`, and `service_role` cannot create objects in `public`, so no current API role
  could exploit name shadowing, and the RLS inventory found no disabled public table or unexpected
  client row policy. The mutable path nevertheless made trusted functions depend on ambient schema
  resolution and weakened the boundary if schema grants ever drifted.
- Fix: alter the four exact function signatures to `search_path=''` without replacing their audited
  bodies or changing grants. Their application table references were already fully schema-qualified,
  while PostgreSQL continues to resolve built-ins through `pg_catalog`, making the change behavior-
  preserving and idempotent.
- Regression coverage: a new five-case migration contract suite requires every exact overloaded
  signature to receive the empty path, rejects body replacement, and rejects reintroduction of
  `search_path=public`. The committed apply script verifies all four live identities plus the full
  privileged-function inventory in one transaction and supports a guaranteed-rollback dry run; the
  exact migration passed that dry run before publication.
- Commit: `3d7d1fa` (`Harden database function search paths`)
- Verification: the focused five-test migration suite, the complete 79-file/493-test Vitest suite,
  ESLint, the strict 156-file analytics audit covering 269 interactive controls, and the 528-page
  production build passed. Vercel deployment `dpl_9NEoGFiWFFqGUBAX39pU92zZaAfU` reached promoted
  `READY` from exact Git SHA `3d7d1fa8ac5230c1c2fc01dec2d7b38580664296`. The production
  migration reported all four targets hardened and zero remaining privileged functions with
  `search_path=public`. A disposable live Auth/database run then exercised signup mirroring, Auth
  profile updates, login attribution, and rate limiting successfully under the empty paths and
  confirmed zero residual Auth, profile, quota, lifecycle, or limiter rows. The Supabase advisor
  connector remained permission-blocked, so equivalent live catalog, schema-grant, function-grant,
  and RLS checks were performed directly. No customer, payment, email, recording, entitlement,
  consent, content, or provider state changed.

## CA-099 — Idempotent lifecycle reruns reported conflicted candidates as newly queued

- Status: `FIXED`
- Area: Lifecycle email / queue observability / idempotency
- Severity: Medium
- Evidence: weekly-digest and win-back builders upserted with
  `ignoreDuplicates: true` but always returned the candidate array length. Repeating a weekly run
  after the same idempotency keys already existed could therefore report every subscriber as newly
  queued even though Supabase inserted zero rows. The HTTP response and cron logs could materially
  overstate pending work, obscuring whether queue generation actually succeeded. A disposable live
  provider-contract check confirmed that an ignore-duplicate upsert returns one row for the first
  insert and zero for the conflict when inserted IDs are explicitly requested.
- Fix: request `id` representations from both queue upserts and return only the number of rows the
  database actually inserted. Candidate mapping, consent enforcement, idempotency keys, scheduling,
  and delivery behavior are unchanged. The queue helpers also accept an injected clock so their
  week and cancellation-cutoff contracts are deterministic in tests.
- Regression coverage: the expanded eight-case lifecycle suite injects two weekly candidates with
  zero inserted IDs and requires a queued count of zero, then injects two win-back candidates with
  one inserted ID and requires a count of one. It verifies lowercase recipients, linked/unlinked
  users, exact week and cancellation idempotency keys, ignore-conflict options, and the required
  `select('id')`, while all consent, suppression, stale-claim, rejection, and batch-continuation
  cases remain active.
- Commit: `e9e6169` (`Report actual lifecycle queue inserts`)
- Verification: the focused eight-test lifecycle suite, the complete 79-file/495-test Vitest suite,
  ESLint, the strict 156-file analytics audit covering 269 interactive controls, and the 528-page
  production build passed. Vercel deployment `dpl_4gSWJiK9uTwnRiCEv7zdRC5VhrXD` reached promoted
  `READY` from exact Git SHA `e9e61694852975c4d7bc684e76d3db4a64af51f3`. Fresh production
  probes returned HTTP 405 with `Allow: GET` for POST and HTTP 401 for an invalid bearer-secret GET,
  both before queue or provider work. The live Supabase contract check returned one inserted ID on
  its first synthetic upsert and zero on the idempotency conflict; final read-only checks found zero
  synthetic rows, zero active subscribers, and zero weekly or win-back rows. The authorized cron was
  not invoked, so no customer, email, payment, account, consent, content, or provider state changed.

## CA-100 — Lifecycle audience queries silently stopped at fixed row ceilings

- Status: `FIXED`
- Area: Lifecycle email / audience completeness / scheduled operations
- Severity: Medium
- Evidence: weekly generation fetched at most 50,000 active subscribers and 50,000 account rows,
  while win-back generation fetched at most 5,000 eligible users. None of the queries specified an
  order or requested another page, so growth beyond any ceiling would silently and arbitrarily omit
  recipients forever. The resulting candidate set was also sent through one unbounded upsert,
  making a nominal attempt to raise the read limit vulnerable to request-size and timeout failures.
- Fix: traverse every source with deterministic 1,000-row keyset pages—unique subscriber email for
  the consent list and the users primary key for account/win-back rows—with explicit cursor-progress
  guards. Queue candidates are written in bounded 1,000-row idempotent batches and their confirmed
  insert counts are summed. The cron duration budget is raised from 60 to 300 seconds so complete
  audiences can finish on the production plan; consent, filters, personalization, and delivery caps
  remain unchanged.
- Regression coverage: the expanded 12-case lifecycle suite builds 1,001-row subscriber, account,
  and win-back audiences; requires the exact second-page `gt` cursors and ascending orders; proves
  two queue writes of 1,000 and one row; verifies aggregate inserted counts; locks the 300-second
  runtime budget; and requires a second-page failure to abort before any queue write. All exact-
  count, consent, suppression, stale-claim, provider-rejection, and continuation cases remain active.
- Commit: `114c836` (`Paginate lifecycle email audiences`)
- Verification: the focused 12-test lifecycle suite, the complete 79-file/499-test Vitest suite,
  ESLint, the strict 156-file analytics audit covering 269 interactive controls, and the 528-page
  production build passed. Vercel deployment `dpl_4nTwpCBXQ98uRbUN4Z1VPDiTGrvr` reached promoted
  `READY` from exact Git SHA `114c8368dcb6fdb85697cbbd3d8d3a0115e75a96`. Fresh production
  probes returned HTTP 405 with `Allow: GET` for POST and HTTP 401 for an invalid bearer-secret GET,
  both before audience or queue work. A read-only live Supabase request exercised the same ordered
  users keyset, returned one row on each of two consecutive pages, and confirmed the cursor advanced;
  the active subscriber count remained zero. The authorized cron was not invoked, so no customer,
  email, payment, account, consent, content, or provider state changed.

## CA-101 — Retired checkout SKUs remained purchasable through the API

- Status: `FIXED`
- Area: Pricing / Stripe Checkout / server-side catalog enforcement
- Severity: High
- Evidence: production deployment `dpl_Aiwe8j773oEZASWTxLsojZmyfBVP` and GitHub `main` both served
  exact SHA `0959f10cac04c3d259c09e46c99aa1999533af33`. The pricing redesign at `01e82ee`
  explicitly removed Annual and Exam Pass from the sales surface while retaining their Stripe and
  webhook mappings for existing customers, but `/api/billing/checkout` still validated requests
  against all four historical SKUs. A signed-in Free account could therefore POST `annual` or
  `exam_pass` directly and create an unpublished Checkout Session. Read-only live Stripe inspection
  confirmed the retired global Annual lookup remained active at $44.99/year, below the currently
  advertised $49.99 six-month price. The four advertised global/PPP Monthly and 6 Months lookup
  prices otherwise matched the page exactly.
- Fix: restrict new Checkout Sessions to the advertised Monthly and 6 Months SKUs before account,
  rate-limit, or Stripe work. Preserve Annual and Exam Pass lookup mapping, webhook entitlement
  handling, and the existing-subscriber account upgrade path so historical customers are not
  broken.
- Regression coverage: the billing-route suite rejects `annual`, `exam_pass`, and an unknown SKU
  with HTTP 400 before any account query, limiter mutation, or Stripe call, while the existing
  global and PPP advertised-plan Checkout cases remain covered.
- Commit: `d04ef52` (`Block retired checkout plans`).
- Verification: focused three-file/79-test billing and pricing coverage, the complete
  89-file/556-test Vitest suite, ESLint, the strict 172-file analytics audit covering 282
  interactive controls, and the 529-page production build passed. The first sandboxed build failed
  only because Google Fonts DNS was unavailable; the network-enabled rerun passed. A concurrent,
  separately scoped consent commit advanced `main` immediately afterward, so production was
  re-baselined before live verification. Vercel deployment
  `dpl_6amvqQQUMgvX9Sef7pJqeiJgmmzH` reached promoted `READY` from exact Git SHA
  `2cad189ba0a5e691a6c8d9b1d3f2738411cdfdf6`, which contains CA-101 as its direct parent. A
  disposable confirmed production Auth user then received HTTP 400 `Unknown plan.` for both
  `annual` and `exam_pass`. The user was deleted immediately; follow-up checks found no Auth user,
  profile row, or quota row. No Stripe customer, Checkout Session, payment, subscription, or
  entitlement was created or changed.

## CA-102 — Optional analytics and advertising default on in consent-required regions

- Status: `PARTIALLY FIXED — CERTIFIED CMP PENDING`
- Area: Privacy / consent / Google Analytics / AdSense / regulatory and provider policy
- Severity: High
- Evidence: commit `2cad189` deliberately reversed CA-029's denied-until-granted model. The exact
  production bootstrap served from `49eebd5` defaults `analytics_storage`, `ad_storage`,
  `ad_user_data`, and `ad_personalization` to `granted` whenever Global Privacy Control is absent
  and no stored rejection exists. Fresh live browser inspection opened the `Cookie consent`
  control, whose deployed disclosure states that analytics and advertising “are on by default.”
  The implementation has no EEA/UK/Switzerland region-specific denial path or certified-CMP
  integration. Google currently requires legally valid consent for relevant storage and personal
  data use in those regions and requires a certified TCF-integrated CMP for personalized ads;
  Google's own Consent Mode implementation example defaults all four optional states to `denied`.
  Current ICO guidance likewise says non-essential cookies must not be set before a user's clear,
  positive action.
- Sources: [Google EU consent policy](https://support.google.com/adsense/answer/10961068),
  [Google CMP requirement](https://support.google.com/adsense/answer/13554116),
  [Google Consent Mode setup](https://developers.google.com/tag-platform/security/guides/consent),
  and [ICO cookie guidance](https://ico.org.uk/media/for-organisations/guide-to-pecr/cookies-and-similar-technologies-2-4.pdf).
- Fix: preserve the founder-directed opt-out default for a resolved non-required country, but add
  edge geo classification that defaults EU-27, EEA, UK, and Switzerland visitors to denied until
  an explicit grant. Missing or malformed geo fails closed. The pre-tag bootstrap, application
  tracking gates, banner copy, and AdSense loader now share the same region-aware state; AdSense is
  not loaded while optional consent is denied. Global Privacy Control and explicit saved choices
  continue to override the regional default.
- Regression coverage: pure region tests cover all 32 consent-required territories, representative
  opt-out countries, case normalization, and fail-closed input. Middleware-boundary tests require
  denied cookies for DE/GB/NO/CH, granted for CA, denied for missing/malformed geo, and no rewrite
  for an unchanged cookie. Consent, analytics, banner, ad-policy, and loader suites cover the
  default, explicit grant/rejection, GPC override, pre-tag order, and consent-gated AdSense path.
- Commit: `db82abe` (`Make analytics/ads consent geo-aware (opt-out except EU/EEA/UK/CH)`).
- Verification: the focused seven-file/39-test consent/analytics/advertising suite, complete
  91-file/572-test Vitest suite, ESLint, strict 174-file analytics audit covering 282 interactive
  controls, and 529-page production build passed. The first sandboxed build failed only because
  Google Fonts DNS was unavailable; the network-enabled rerun passed. The compiled production
  runtime returned HTTP 200 and the expected cookie for DE=`denied`, CH=`denied`, CA=`granted`, and
  missing geo=`denied`; an unchanged denied cookie was not rewritten. GitHub's Vercel status tied
  exact SHA `db82abec855554cd1d54f6d3e359fc49e20d0d36` to production deployment
  `dpl_E4rB4QPPGTRbRLNPeAq3SKpoRKh3`, which reached promoted `READY` on the canonical aliases. A
  fresh canonical request from the Toronto edge returned the expected `granted` cookie, ignored
  caller-supplied DE/CH geo headers in favor of trusted edge geo, and served the fail-closed pre-tag
  bootstrap. Live browser verification showed the Canadian opt-out disclosure, then an explicit
  rejection removed the AdSense script and left the privacy control available. This browser-local
  preference was the only state changed; no account, payment, provider, or application data changed.
- Residual risk: the custom consent UI is not a Google-certified TCF-integrated CMP. The geo fix
  removes the confirmed pre-consent default/storage and ad-loader defect, but does not by itself
  satisfy Google's separate certified-CMP requirement for serving personalized ads in the EEA, UK,
  and Switzerland. CA-102 therefore remains partially open until a certified CMP is configured and
  verified end to end in a consent-required location.

## CA-103 — A rejected auth-callback retry left the sign-in page hanging

- Status: `FIXED`
- Area: Authentication / email callback / failure recovery
- Severity: Medium
- Evidence: `/auth/callback` guarded its first `getSession()` request, but scheduled the second
  request in an async timer outside that `try/catch`. If the first read resolved without a session
  and the delayed retry rejected, the rejection escaped the component, no failure state was shown,
  and no redirect ran. A learner completing an emailed authentication link during that dependency
  failure could therefore remain indefinitely on “Signing you in…” with an unhandled promise.
- Fix: route both initial and delayed failures through one active-component failure handler, catch
  retry rejections explicitly, mark router transitions intentionally fire-and-forget, retain the
  successful `/dashboard` destination, and cancel the retry timer when the callback unmounts.
- Regression coverage: the callback component suite now executes the real 600ms retry boundary with
  fake time. It requires a delayed session to reach `/dashboard` and a rejected delayed read to show
  the recovery copy and redirect home, while preserving the callback's `noindex, nofollow` metadata.
- Commit: `Recover auth callback retry failures`.
- Verification: the focused five-file/14-test auth suite, complete 91-file/574-test Vitest suite,
  ESLint, strict 175-file analytics audit covering 282 interactive controls, and the 529-page
  production build passed. GitHub's Vercel status tied exact SHA
  `99ff72149ec39579e162557ff0f32cf5c4eb671b` to deployment
  `dpl_32J6DqoKEjBB4VEB1PF3eMkMcTwo`, which reached promoted `READY` on the canonical aliases. A
  fresh signed-out production browser visit to `/auth/callback` without a credential payload left
  the transient page after the retry window and reached `/`; it did not remain on the spinner. The
  live rejected-provider branch was not induced, so that branch is verified by the component's
  deterministic rejected-promise test. No auth session, account, or application data was changed.

## CA-104 — Failed confirmation-email resends advanced or throttled the auth flow

- Status: `FIXED`
- Area: Authentication / email confirmation / failure recovery
- Severity: Medium
- Evidence: when password sign-in returned `Email not confirmed`, the shared auth dialog awaited a
  confirmation-email resend but discarded its returned error and always advanced to the OTP step.
  A provider rejection therefore told the learner to enter a code that had not been sent. The
  manual resend path surfaced its provider error but left the optimistic 30-second cooldown active,
  blocking an immediate retry after a failed send.
- Fix: require the automatic resend to succeed before entering the verification step and show its
  provider error on the existing password form otherwise. Preserve the double-click guard for a
  manual resend, but reset the cooldown immediately when the provider returns an error.
- Regression coverage: the actual dialog flow injects an unconfirmed-password response followed by
  a failed automatic resend and requires the password form and provider error to remain visible.
  A second case reaches the OTP step, expires the initial cooldown, rejects a manual resend, and
  requires the error plus an immediately enabled `Resend code` action.
- Commit: `Recover auth confirmation resend failures`.
- Verification: the focused four-file/11-test auth suite, complete 92-file/581-test Vitest suite,
  ESLint, strict 175-file analytics audit covering 282 interactive controls, and the 529-page
  production build passed. GitHub's Vercel status tied exact SHA
  `2637517e5e2710d3ad23eb0aedea7a5a3b90e5bf` to deployment
  `dpl_PLHCB3Z5sQj6aJ2KeH3ABgDzbnfV`, which reached promoted `READY` on the canonical aliases. The
  canonical HTML referenced that exact deployment, and its fetched client chunks contained both
  automatic and manual resend recovery messages. A real provider failure was not induced in
  production; both rejected-provider transitions are verified by deterministic dialog tests. No
  email was sent and no auth or application data was changed.

## CA-105 — Existing-user passwordless sign-in could create a new account

- Status: `FIXED`
- Area: Authentication / passwordless OTP / signup boundary
- Severity: Medium
- Evidence: the dialog labels its passwordless alternative `Email me a one-time code instead` and
  documents it as a sign-in fallback for accounts from the magic-link era, but the shared helper
  called `signInWithOtp()` without `shouldCreateUser`. The installed `@supabase/auth-js` source sends
  `create_user: true` by default, so entering a new email through the sign-in control could create a
  fresh Auth account outside the explicit signup and onboarding path. [Supabase's current
  passwordless-email guide](https://supabase.com/docs/guides/auth/auth-email-passwordless) states
  that missing users are automatically signed up by default and requires `shouldCreateUser: false`
  to prevent it; the installed client source has the same contract.
- Fix: pass `shouldCreateUser: false` only in the existing-user email-code helper while preserving
  its email callback URL. Explicit password signup, confirmation resend, and recovery OTP flows are
  unchanged.
- Regression coverage: the AuthProvider suite invokes the exported email-code helper and requires
  the exact Supabase call to include the existing email, canonical `/auth/callback` destination, and
  `shouldCreateUser: false` option.
- Commit: `Restrict email-code sign-in to existing users`.
- Verification: the focused four-file/12-test auth suite, complete 92-file/582-test Vitest suite,
  ESLint, strict 175-file analytics audit covering 282 interactive controls, and the 529-page
  production build passed. GitHub's Vercel status tied exact SHA
  `36d8dc396fb55b8e74f4d892ac173c8ffae3fa64` to deployment
  `dpl_F2K7h3foH4ZEKGS2QVPta7jAXVSq`, which reached promoted `READY` on the canonical aliases. A
  unique audit email was confirmed absent, entered through the deployed `Email me a one-time code
  instead` control, and received the provider's `Signups not allowed for otp` error while remaining
  on sign-in. Post-request live readback found zero matching Auth users, profiles, or quota rows. No
  email was sent and no auth account or application data was created or changed.

## CA-106 — “Sign out on this device” revoked every active session

- Status: `FIXED`
- Area: Authentication / sign-out / multi-device sessions
- Severity: Medium
- Evidence: dashboard Account Settings promises `Sign out safely on this device`, but AuthProvider
  called Supabase `signOut()` without a scope. [Supabase's current JavaScript sign-out
  reference](https://supabase.com/docs/reference/javascript/auth-signout) states that the default
  scope is `global`, which terminates every active session for the user; current-session-only logout
  requires `{ scope: 'local' }`. A learner signing out of one browser could therefore be
  unexpectedly signed out on every other device.
- Fix: pass the explicit local scope from the shared provider. Existing error recovery, local user
  clearing, analytics identity clearing, and the dashboard control remain unchanged.
- Regression coverage: the provider's successful sign-out case now requires the exact
  `signOut({ scope: 'local' })` call in addition to the existing local user/analytics cleanup. The
  rejected-provider case continues to require session preservation and a retryable error.
- Commit: `Keep sign-out scoped to this device`.
- Verification: the focused five-file/15-test auth/account suite, complete 92-file/582-test Vitest
  suite, ESLint, strict 175-file analytics audit covering 282 interactive controls, and the
  529-page production build passed. GitHub's Vercel status tied exact SHA
  `7cc7034d65d02a0d4f3da3601b90571efe58c7b6` to deployment
  `dpl_995pwXikJ1ryyebqgqqFNAWSwpeG`, which reached promoted `READY` on the canonical aliases. A
  disposable confirmed user established two independent password sessions. The deployed dashboard
  Settings control signed session A out and immediately returned that browser to the signed-out
  state, while a provider-validated `getUser()` call proved session B remained valid. The exact
  disposable Auth user was then deleted; live readback found no matching Auth user and zero
  `user_quotas` rows, and the temporary session artifact was removed.

## CA-107 — Unexpected auth-client failures escaped every account journey

- Status: `FIXED`
- Area: Authentication / shared provider / signup / login / OTP / recovery
- Severity: Medium
- Evidence: every shared auth helper except the already-hardened sign-out path awaited client
  initialization and an auth operation without a rejection boundary. The dialog consumes the
  documented `{ error }` result contract and uses `finally` only, so an unexpected thrown failure
  could escape its event handler without user feedback across password signup, password login,
  passwordless login, OTP verification, confirmation resend, recovery-code request, or password
  update. [Supabase's current error-handling guide](https://supabase.com/docs/guides/api/handling-errors-in-supabase-js)
  documents the normal `{ data, error }` and `AuthError` paths; the installed `auth-js` client
  catches those errors but deliberately rethrows non-auth exceptions such as client initialization
  or browser-storage failures.
- Fix: add one shared last-resort recovery boundary at the AuthProvider API. Provider-returned
  errors remain unchanged, unexpected `Error` objects remain inspectable, non-Error throws become
  journey-specific retry messages, and password signup preserves its `{ data, error }` shape with
  `data: null` on rejection. Dialog behavior and successful auth transitions are unchanged.
- Regression coverage: the real provider suite forces each of the seven non-sign-out client calls
  to reject and requires every public helper to resolve with the original error. Existing dialog
  cases continue to require visible service feedback, retained form state, and enabled retry.
- Commit: `Recover unexpected auth client failures`.
- Verification: the focused five-file/16-test auth/account suite, complete 92-file/583-test Vitest
  suite, ESLint, strict 175-file analytics audit covering 282 interactive controls, and the
  network-enabled 529-page production build passed. GitHub's Vercel status tied exact SHA
  `730c9dc61cea0200a0477c9f4b1565de3b759e5d` to deployment
  `dpl_2irF2wf3hsG8Z73YDSAcafMUViWv`, which reached promoted `READY` on the canonical aliases. The
  canonical app bundle contained all seven journey-specific recovery messages, and a fresh
  production browser opened the shared sign-in dialog with password, email-code, and recovery
  controls intact. Unexpected exceptions are verified by the deterministic forced-rejection test;
  no auth request, email, session, or account was created or changed during production verification.

## CA-108 — Login recovery depended on mutable provider message text

- Status: `FIXED`
- Area: Authentication / password login / email confirmation / error routing
- Severity: Medium
- Evidence: password login detected an unconfirmed account and invalid credentials by matching the
  provider's English `error.message`. If Supabase changed that copy while retaining its stable error
  contract, an unconfirmed learner would remain on the password form instead of receiving a fresh
  confirmation code, and invalid credentials could expose raw provider wording. [Supabase's current
  error-handling guide](https://supabase.com/docs/guides/api/handling-errors-in-supabase-js)
  explicitly recommends branching on `AuthError.code` because messages can change; the installed
  client documents `email_not_confirmed` and `invalid_credentials` for these cases.
- Fix: route both decisions by their stable Auth error codes. Preserve the existing case-insensitive
  message checks only as a compatibility fallback for older or nonconforming error objects.
- Regression coverage: the real dialog receives unfamiliar messages paired with each stable code.
  The unconfirmed-account case must still request a confirmation resend and preserve the password
  form if that send fails; the invalid-credentials case must show the existing safe learner-facing
  guidance rather than the unfamiliar provider text.
- Commit: `Route auth failures by stable codes`.
- Verification: the focused five-file/17-test auth/account suite, complete 92-file/584-test Vitest
  suite, ESLint, strict 175-file analytics audit covering 282 interactive controls, and the
  network-enabled 529-page production build passed. GitHub's Vercel status tied exact SHA
  `64b0e07f134dc9b83770182848ba737cc71ead20` to deployment
  `dpl_Dgeqi6BMYJnFmxW8okiVZRWG34Qa`, which reached promoted `READY` on the canonical aliases. The
  canonical shared-auth chunk contained both stable error codes and the safe invalid-credentials
  guidance, and a fresh production browser opened the password, email-code, and recovery controls.
  Code-specific branches are verified by the deterministic unfamiliar-message tests; no auth
  request, email, session, or account was created or changed during production verification.

## CA-109 — A past exam date could block every profile update

- Status: `FIXED`
- Area: Dashboard / Account Settings / profile form / exam date
- Severity: Medium
- Evidence: Account Settings loaded the learner's persisted exam date into an HTML date input whose
  `min` was always today. Once that date passed, native form validation marked the control invalid
  and could prevent submission before React's handler ran. A returning learner could therefore be
  unable to save an unrelated display name, target band, or weekly goal, with no application error
  explaining why.
- Fix: remove the unconditional native minimum from the persisted Settings field and validate date
  changes inside the existing form handler. An unchanged historical date remains valid so unrelated
  settings can be saved without silent data loss; a newly selected past date is rejected with clear
  feedback before any database request. Fresh-signup onboarding retains its future-date minimum.
- Regression coverage: the real Settings form loads a saved 2020 date, requires no native `min`,
  changes the display name, and completes the profile update. A separate case selects a new 2020
  date and requires visible feedback plus zero profile writes.
- Commit: `Keep historical exam dates editable`.
- Verification: the focused one-file/five-test Account Settings suite, complete 92-file/586-test
  Vitest suite, ESLint, strict 175-file analytics audit covering 282 interactive controls, and the
  network-enabled 529-page production build passed. GitHub's Vercel status tied exact SHA
  `8e7da5ae53ae9b5b94663ef9c3b59226fcd4f81c` to deployment
  `dpl_23uxT4CWJEwvawD7XWqx38mWpmzc`, which reached promoted `READY` on the canonical aliases. A
  disposable confirmed learner with `exam_date = 2020-01-15` opened deployed Settings; the field
  retained that value with no native `min`, and changing only the display name produced the visible
  saved state. Provider readback found the new display name and the same historical date. The new
  past-date rejection is verified by the real-component no-write test. The exact Auth user was then
  deleted, with zero residual Auth users, `users` rows, or `user_quotas` rows.

## CA-110 — Checkout continued when Stripe could charge a different plan

- Status: `FIXED`
- Area: Monetization / Stripe Checkout / displayed-price integrity / global and PPP plans
- Severity: High
- Evidence: the checkout route compared the Stripe price's USD amount with the pricing page but only
  logged a mismatch and deliberately continued. It did not validate active state, currency,
  recurring type, billing interval/count, or licensed usage. A stale or misconfigured lookup key
  could therefore create a chargeable Checkout Session whose price or cadence differed from the
  learner's selected card. Stripe documents that a [Price object](https://docs.stripe.com/api/prices/object?lang=nodejs)
  defines the amount, currency, active state, price type, and recurring interval/count, and that
  [price listing](https://docs.stripe.com/api/prices/list?lang=node) can filter active lookup keys.
- Fix: request active prices with enough result capacity to detect ambiguity, require exactly one
  match, and fail closed before customer or session creation unless amount, USD currency, active
  state, recurring type, monthly interval/count, and licensed usage exactly match `saleConfig` and
  the selected SKU. Return a retryable pricing-update response while logging the full mismatch for
  operators.
- Regression coverage: the 49-test billing route suite requires the normal global and PPP sessions
  to use the exact active-price query, then independently injects wrong amount, currency, active
  state, one-time type, billing interval, metered usage, and duplicate lookup results. Every drift
  case must stop before Stripe customer or Checkout Session creation.
- Commit: `Block checkout on Stripe price drift`.
- Verification: the focused one-file/49-test billing route suite, complete 92-file/593-test Vitest
  suite, ESLint, strict 175-file analytics audit covering 282 interactive controls, and the
  network-enabled 529-page production build passed. Read-only live Stripe queries found exactly one
  active USD recurring licensed price for all four advertised global/PPP lookup keys, with amounts
  and monthly interval counts matching the pricing page. GitHub's successful Vercel status tied
  exact SHA `17e85b36752e3f99dbd494b5a0764d575e725d88` to production deployment
  `dpl_8TcteT4drZG1hLs9X81t9WakBiGz`, which reached promoted `READY` on every canonical alias. One
  disposable confirmed learner then called the deployed global monthly checkout route. It returned
  HTTP 200 and created one open, unpaid subscription-mode Checkout Session whose client reference,
  learner/SKU metadata, and non-PPP selection matched the request. Stripe readback found exactly one
  active USD 1,499-cent recurring licensed line item billed monthly with interval count one. No card
  details or payment were submitted. The session was expired, its exact Stripe customer and Auth
  user were deleted, and readback found zero residual matching Auth users, `users`, `user_quotas`,
  or `billing-checkout` rate-limit rows.

## CA-111 — Checkout return claimed activation without active entitlement

- Status: `FIXED`
- Area: Monetization / checkout return / entitlement reconciliation / purchase analytics
- Severity: High
- Evidence: the authenticated verification route returned `{ active: true }` after every owned,
  completed, paid Checkout Session unless the shared event handler returned an `error:` string. An
  unsupported Checkout mode returns `ignored: unsupported checkout`, while a supported Session can
  reconcile a subscription whose current Stripe state maps to Free/inactive. Both paths therefore
  produced HTTP 200 even though no active entitlement existed. Pricing trusted HTTP success alone,
  showed `You're in`, and emitted `purchase_success` without checking the response's entitlement
  value.
- Fix: accept only a supported `activated ...` reconciliation result, then read the learner's
  billing row back through the shared Premium entitlement rules. Return neutral retry/rejection
  states for database failures or verified inactive access. Pricing now also requires both HTTP
  success and an explicit `{ active: true }` response before showing activation or recording the
  purchase.
- Regression coverage: billing-route tests cover ignored sessions, an inactive reconciled
  subscription, resolved and rejected entitlement-readback failures, and a verified active row.
  Real Pricing component coverage proves that even HTTP 200 with `{ active: false }` cannot render
  the activation checklist or emit `purchase_success`.
- Commit: `Confirm entitlement after checkout return`.
- Verification: the focused two-file/60-test billing and Pricing return suite, complete
  92-file/598-test Vitest suite, ESLint, strict 175-file analytics audit covering 282 interactive
  controls, and the network-enabled 529-page production build passed. GitHub's successful Vercel
  status tied exact SHA `198558924621d8dd00c9d256b76791a91a62247b` to production deployment
  `dpl_BQYZv8fPiYuQGVWuiwDFXrzfCLg7`, which reached promoted `READY` on every canonical alias. A
  disposable confirmed learner then created one deployed global monthly checkout. Stripe readback
  confirmed the Session was open and unpaid; submitting its exact reference to the deployed return
  endpoint produced HTTP 409 with `status: open` and no active claim. No payment was submitted. The
  Session was expired, its exact customer and Auth user were deleted, and readback found zero
  residual matching Auth users, `users`, `user_quotas`, or checkout/verification rate-limit rows.
  Completed-but-inactive and unsupported reconciliation outcomes are covered without charging or
  consuming a limited live promotion by the dependency-injected route cases and real Pricing
  component test described above.

## CA-112 — Subscription upgrade trusted an unverified Stripe price

- Status: `FIXED`
- Area: Monetization / existing-subscriber upgrade / Stripe price integrity / global and PPP plans
- Severity: High
- Evidence: the plan-change route resolved the target lookup key with `limit: 1`, accepted the
  first returned Price without requiring it to be active or unique, and immediately submitted that
  Price to a prorated subscription update. It did not validate the amount, currency, billing
  scheme, recurring type, interval/count, or licensed usage. A stale, duplicated, or misconfigured
  6-month/annual lookup could therefore invoice a different price or cadence than the product's
  intended billing contract. Stripe's [Price object](https://docs.stripe.com/api/prices/object?lang=nodejs)
  exposes those charge-defining fields, and [price listing](https://docs.stripe.com/api/prices/list?lang=node)
  supports active lookup-key filtering.
- Fix: request active Prices with enough result capacity to detect ambiguity, require exactly one,
  and fail closed before `subscriptions.update` unless every charge-defining field matches the
  global or PPP contract: 6 months at USD 49.99/14.99 billed every six months, or annual at USD
  44.99/19.99 billed yearly, always per-unit recurring licensed usage.
- Regression coverage: the route suite requires the exact active lookup query for a normal annual
  upgrade, preserves the subscription's original PPP region, and independently injects wrong
  amount, currency, active state, billing scheme, price type, interval, interval count, usage type,
  and duplicate results. Every mismatch must stop before any subscription update.
- Commit: `Validate subscription upgrade prices`.
- Verification: the focused one-file/62-test billing route suite, complete 92-file/607-test Vitest
  suite, ESLint, strict 175-file analytics audit covering 282 interactive controls, and the
  network-enabled 529-page production build passed. Read-only live Stripe queries found exactly one
  active USD per-unit recurring licensed Price for each global/PPP 6-month and annual lookup key,
  with amounts and cadence matching the enforced contract. GitHub's successful Vercel status tied
  exact SHA `80c6089c56154280be473a25ac89abd7131f39e0` to production deployment
  `dpl_CG8GPQwz4CxgQ4gmpwkMzz6C2p9e`, which reached promoted `READY` on every canonical alias.
  Fresh deployed probes returned HTTP 405 with `Allow: POST` for GET, HTTP 403 for a cross-origin
  POST, and HTTP 401 for a same-origin unauthenticated POST. A post-deploy Stripe readback again
  found exactly one active target for all four lookup keys with the enforced amounts and shapes.
  Drift branches are injected before the provider mutation in route tests; no live subscription or
  payment was changed to manufacture a pricing mismatch.

## CA-113 — Plan upgrade could charge immediately without a quote or confirmation

- Status: `FIXED`
- Area: Monetization / existing-subscriber upgrade / informed consent / proration
- Severity: High
- Evidence: Billing Management rendered `Upgrade to 6 months` and `Upgrade to annual` buttons with
  no plan price or estimated amount due. One click called the mutation route, which immediately used
  `proration_behavior: always_invoice`; there was no preview or confirmation step between intent and
  a potentially chargeable subscription update. The server also accepted the SKU alone, so a stale
  client could still trigger the one-step mutation. Stripe's current
  [invoice preview API](https://docs.stripe.com/api/invoices/create_preview) previews subscription
  changes without creating an invoice and recommends reusing `subscription_details.proration_date`
  on the actual update so the calculation matches.
- Fix: split the route into explicit `preview` and `confirm` actions. Preview retrieves Stripe's
  exact invoice estimate and returns the recurring plan price, cadence, currency, amount due, and
  proration timestamp without modifying the subscription. Confirmation requires the same amount,
  currency, and a server-signed timestamp no older than five minutes. The signature binds the
  learner, subscription, current/target Price IDs, amount, currency, cadence, and timestamp; the
  server recomputes that quote and reopens confirmation if it changed, expired, or was altered.
  SKU-only legacy requests now default to preview. Only an exact accepted quote reaches
  `subscriptions.update`, which now reuses the preview timestamp. Billing Management presents the
  values in a focus-managed modal and labels the final action with the exact USD charge.
- Regression coverage: the billing route suite proves preview makes no subscription update, exact
  confirmation carries the same proration timestamp into Stripe, mismatched and expired quotes
  stop before mutation, and invalid preview data fails closed. The real Billing page test proves the
  first click only previews, displays the USD 44.99 yearly price and USD 32.00 estimated charge,
  emits no conversion event, and sends the mutation only after the learner confirms. A changed
  quote updates to USD 33.00 and requires another confirmation without recording success.
- Commit: `Require confirmation for plan upgrade charges`.
- Verification: the focused two-file/72-test billing route and Billing page suite, complete
  92-file/615-test Vitest suite, ESLint, strict 175-file analytics audit covering 284 interactive
  controls, and the network-enabled 529-page production build passed. GitHub's successful Vercel
  status tied exact SHA `74ccc678b9158fc0a09cc0a6c3e6af25ea53fa96` to production deployment
  `dpl_GfdvLaomJ81f3ZCpU1QuVoXnttCj`, which reached promoted `READY` on every canonical alias. A
  disposable confirmed Free learner then submitted the deployed legacy SKU-only annual request; it
  returned HTTP 409 `no_active_subscription`, and provider readback confirmed the plan remained
  Free with no Stripe customer or subscription identifier. The exact Auth user was deleted, with
  zero residual matching Auth users, `users`, `user_quotas`, or rate-limit rows. Active-subscriber
  preview/confirm behavior is covered without altering a live subscription by the signed route and
  real-component cases above.

## CA-114 — Deleted-account subscription webhooks retried forever

- Status: `FIXED`
- Area: Monetization / Stripe webhook / account deletion / idempotent acknowledgement
- Severity: Medium
- Evidence: the newest live `customer.subscription.deleted` event remained at
  `pending_webhooks: 1`. Two delivery attempts against the current production deployment logged an
  `activity_events_user_id_fkey` violation. The event still carried its original `metadata.user_id`,
  but the learner's application row had already been deleted. `findUserId` trusted that metadata
  without checking the row still existed, so the handler attempted an orphan activity insert,
  returned HTTP 500, and caused Stripe to keep retrying an event that could no longer update any
  account.
- Fix: resolve every supplied user, subscription, and customer identifier against the current
  `users` table before returning a mapping. A genuinely deleted account now reaches the existing
  no-mapping branch, performs no writes, and acknowledges the event. Database lookup failures still
  throw so transient dependency failures retain provider retries rather than being silently lost.
- Regression coverage: one handler case supplies a deleted account's stale metadata and requires
  the exact ignored result with zero updates or inserts; a second injects a lookup failure and
  requires the handler to throw with zero writes.
- Commit: `Acknowledge deleted-account Stripe events`.
- Verification: the focused two-file/100-test billing suite, complete 92-file/617-test Vitest suite,
  ESLint, strict 175-file analytics audit covering 284 interactive controls, and the network-enabled
  529-page production build passed. Local HEAD and `origin/main` matched exact SHA
  `9521a66ca6a253256f05b1c13585af6309d7dfc6`; GitHub's successful Vercel status tied that SHA to
  deployment `dpl_BNWshqHkv8ZpfrU6Z8MWeaXuJikg`, which reached promoted `READY` on every canonical
  alias. A locally signed replay of the exact affected Stripe event then returned HTTP 200
  `{ received: true }` from `www.ielts-bank.com`; the exact deployment log recorded
  `ignored: no user mapping for subscription.deleted`. Service-role readback before and after the
  replay remained at zero matching `users`, `user_quotas`, and billing `activity_events` rows. The
  original Stripe delivery record remains at `pending_webhooks: 1` until Stripe performs its next
  provider-managed retry; a locally signed replay verifies the deployed behavior but does not
  rewrite that provider delivery counter.

## CA-115 — A paused learner could buy a second recurring subscription

- Status: `FIXED`; one pre-existing duplicate requires billing-owner remediation
- Area: Monetization / Stripe Checkout / billing pause / duplicate subscriptions
- Severity: High
- Evidence: read-only live Stripe and service-role reconciliation found one learner mapped to two
  simultaneously active subscriptions. The monthly subscription was paused at 17:15, then a new
  six-month subscription was created for the same learner 11 minutes later. The newer webhook
  replaced the app row's single subscription mapping while the older monthly subscription remained
  active and scheduled to resume, leaving two independent future billing commitments. The checkout
  route used `isPremiumRow` as its ownership guard, but that entitlement helper deliberately returns
  false while `billing_pause_until` is in the future. The Pricing page made the same inference and
  rendered a new purchase action during the pause.
- Fix: when deciding checkout eligibility, evaluate the verified billing row with only the
  access-pause timestamp ignored. Active, trialing, past-due, paid-through cancellation, Exam Pass,
  and paused Premium commitments all stop before rate limiting or Stripe work. Pricing now treats an
  active pause as an existing plan, explains the resume date, and links to Billing Management instead
  of presenting another checkout.
- Regression coverage: the checkout route suite supplies an active recurring subscription with a
  future pause, requires HTTP 409 `already_premium`, and proves no rate-limit or Stripe call occurs.
  The real Pricing page test requires the paused-state explanation and management link, no purchase
  action, and no checkout request.
- Commit: `Block duplicate checkout during billing pause`.
- Verification: the focused two-file/77-test billing route and Pricing page suite, complete
  92-file/619-test Vitest suite, ESLint, strict 175-file analytics audit covering 284 interactive
  controls, and the network-enabled 529-page production build passed. Local HEAD and `origin/main`
  matched exact SHA `7602e8a6f9548f675d4b6c08d5e1457139322f7f`; GitHub's successful Vercel
  status tied that SHA to deployment `dpl_GFbpXJ1Ypg1N5YwxCANbAr7DoJPA`, which reached promoted
  `READY` on every canonical alias. A disposable confirmed learner with active Premium, a future
  pause, and inert customer/subscription identifiers called the deployed checkout: it returned HTTP
  409 `already_premium`, created zero rate-limit rows, and left every billing field unchanged. The
  exact Auth user was deleted with zero residual matching `users`, `user_quotas`, or rate-limit rows.
  The pre-existing learner's two real active subscriptions were not canceled or refunded during the
  audit; deciding which paid commitment to retain requires billing-owner review, and leaving both
  active carries a residual duplicate-charge risk.

## CA-116 — The 30-day pause stopped access but did not pause the paid term

- Status: `FIXED`; live success-path exercise needs a scoped cron credential or Stripe sandbox
- Area: Monetization / subscription pause / unused-time credit / automatic resume
- Severity: High
- Evidence: the route set `pause_collection: { behavior: 'void' }` and separately blocked Premium
  access for 30 days. Stripe's [pause-payment documentation](https://docs.stripe.com/billing/subscriptions/pause-payment)
  states that this primitive continues service delivery and invoice generation; `void` only makes
  invoices generated inside the window free. For the normal case where renewal was more than 30
  days away, no invoice occurred, the billing date did not move, and the learner simply lost 30 paid
  days. If renewal occurred inside the window, Stripe could void the whole renewal invoice and later
  restore access for the remainder of an uncharged monthly, six-month, or annual period. The UI's
  promise that billing and access both paused was therefore false in either timing case. Read-only
  live Stripe reconciliation confirmed every current active subscription uses flexible billing,
  which supports Stripe's true pause lifecycle.
- Fix: use Stripe's [true subscription pause](https://docs.stripe.com/billing/subscriptions/pause)
  preview endpoint with the required API version, flexible-billing/customer/subscription ownership
  checks, automatic collection, no legacy pause, and no attached schedule. Pause now stops service
  and invoice generation and creates a pending credit for unused licensed time and outstanding usage.
  App metadata binds the exact 30-day resume timestamp; a lost mutation response is read back before
  the one-time claim can be released. True paused subscriptions map to an explicit paused billing
  state that blocks both entitlement and duplicate checkout. An authenticated hourly Vercel cron
  resumes due subscriptions with `resume_on_payment_success`, resets the billing cycle, applies the
  credit through proration, clears pause metadata, and restores app access only for an active/trialing
  provider result. Failed payments remain paused for retry; terminal provider states reconcile
  without retrying forever. Billing Management now discloses the unused-time credit and possible
  remaining charge when billing resumes.
- Regression coverage: pause route cases require the preview API call and exact credit parameters,
  reject classic/manual/scheduled/mismatched/legacy subscriptions before mutation, preserve a
  read-back-confirmed lost response, and retain prior authorization, rate-limit, concurrency,
  rollback, and reconciliation guarantees. Mapper/checkout/status tests cover true paused state and
  stale metadata. The new cron suite covers authentication, no-op, successful resume, payment-pending
  retry, terminal reconciliation, and dependency failure.
- Commit: `Use true Stripe subscription pauses`.
- Verification: the focused seven-file/154-test pause, resume, mapper, checkout, status, real Billing,
  and Pricing page suite; complete 93-file/637-test Vitest suite; ESLint; strict 176-file analytics
  audit covering 284 interactive controls; and the network-enabled 529-page production build passed.
  Safe live probes against guaranteed nonexistent IDs reached both versioned pause
  and resume endpoints and returned Stripe `resource_missing`, proving the preview API and request
  options are enabled without mutating a billing object. Local HEAD and `origin/main` matched exact
  SHA `e839b814a01bd2b8658115e50941472f8d47c99b`; GitHub's successful Vercel status tied
  that SHA to deployment `dpl_Fbczb53cf6pQW2YwCMqKWE5S7Yih`, which reached promoted `READY` on
  every canonical alias. Deployment metadata contains the new `/api/cron/resume-billing` schedule
  at minute 47 of every hour. Deployed probes returned HTTP 405 with `Allow: POST` for pause GET,
  HTTP 403 for a cross-origin pause POST, HTTP 401 for a same-origin unauthenticated pause POST,
  HTTP 401 for an unsigned resume-cron GET, and HTTP 405 with `Allow: GET` for cron POST. A full live
  pause/resume success exercise was not run: the needed `CRON_SECRET` is deployment-only, and the
  attempted full-environment export was denied because it would expose unrelated production secrets.
  No billing object was created or mutated during that attempt. The remaining success-path gap is
  explicit until a scoped cron credential or Stripe sandbox is available.

## CA-117 — Customer Portal trusted an unverified database-to-Stripe customer pointer

- Status: `FIXED`
- Area: Monetization / Customer Portal / object ownership / billing-data authorization
- Severity: Medium
- Evidence: the authenticated portal route looked up only the learner's service-role
  `stripe_customer_id` and passed that identifier directly into Stripe session creation. Stripe's
  current [Customer Portal session API](https://docs.stripe.com/api/customer_portal/sessions/create?lang=node)
  scopes a session to the supplied Customer, and the resulting hosted UI can manage that customer's
  subscriptions and billing details. A stale or corrupted application mapping could therefore open
  another customer's invoices, payment methods, tax details, and cancellation controls without any
  provider-side ownership check. Read-only production reconciliation found no existing exposure:
  all seven stored customer IDs were unique and present, all seven Customer `metadata.user_id`
  values matched the application learner, and all three stored subscriptions matched both the
  customer and learner with zero anomalies.
- Fix: retrieve the Stripe Customer after authentication and rate limiting but before portal session
  creation. The route now requires a live, non-deleted Customer whose provider-side `user_id`
  metadata exactly matches the authenticated learner. Missing, deleted, unmapped, or mismatched
  customers fail closed with HTTP 409 `billing_account_mismatch` and no portal session. Stripe setup,
  retrieval, configuration, and session outages now return a retryable HTTP 503 rather than a
  misleading generic server failure. Stripe's current
  [Customer retrieval behavior](https://docs.stripe.com/api/customers/object) documents the
  `deleted: true` response that the guard handles explicitly.
- Regression coverage: the portal suite now verifies the customer lookup precedes session creation,
  rejects a different owner, absent owner metadata, deleted customer, and missing customer, and
  distinguishes provider unavailability from durable mapping failures. Existing method, origin,
  authentication, database-failure, rate-limit, fixed-return-URL, and successful-session cases remain
  covered.
- Commit: `Verify Stripe portal customer ownership`.
- Verification: the focused 17-test portal suite, complete 93-file/642-test Vitest suite, ESLint,
  strict 176-file analytics audit covering 284 interactive controls, and the network-enabled
  529-page production build passed. Local HEAD and `origin/main` matched exact SHA
  `fd0f45c1c95b2b1ccaec78c67c93d8eeb2115b6c`; GitHub's successful Vercel status tied that SHA to
  deployment `dpl_AkztHPuGJL1mzzBpWD2X2XRHqKku`, which reached promoted `READY` on every canonical
  alias. A disposable confirmed production learner was then linked to a Customer carrying a
  deliberately different owner: the deployed route returned HTTP 409 `billing_account_mismatch`
  with no session URL. After changing only that Customer's metadata to the exact learner ID, the
  same authenticated request returned HTTP 200 and a short-lived `billing.stripe.com` portal URL.
  The test created no subscription or charge. Its Stripe Customer and Auth user were deleted, the
  disposable limiter rows were removed, and service-role read-back found zero matching `users` or
  rate-limit rows.

## CA-118 — Billing Management offered actions the server rejects for non-active plans

- Status: `FIXED`
- Area: Monetization / cancellation return / payment recovery / Billing Management
- Severity: Medium
- Evidence: a period-end cancellation intentionally remains Premium through its paid-through date,
  so `isPremium` is true while `plan_status` is `canceled`. Billing Management used only that
  entitlement boolean to render monthly/six-month upgrade controls and labeled the state “Keep
  Premium active,” but the change-plan API accepts only `active` or `trialing` rows. A canceled
  learner returning from Stripe therefore saw contradictory renewal copy and buttons guaranteed to
  fail with `no_active_subscription`. A `past_due` learner similarly saw a future “next renewal,”
  upgrade buttons the API rejects, and a pause action that Stripe's active-only preflight rejects.
  Exam Pass and historical-customer rows were also shown recurring-subscription cancellation and
  switch-plan guidance even though neither has a recurring plan to cancel.
- Fix: make Billing Management state-specific. Upgrade and switch-to-Exam-Pass choices now require
  an active/trialing recurring SKU; the pause helper excludes canceled and past-due plans. Canceled
  plans say Premium is ending and direct the learner to review the scheduled cancellation. Past-due
  plans identify the failed payment and direct the learner to update payment details. Exam Pass and
  historical billing accounts show invoice/history guidance and explicitly state that no active
  recurring plan exists. The page header is now neutral across all account states.
- Regression coverage: the status helper proves past-due messaging never promises a renewal and
  that canceled/past-due plans cannot receive a pause action. Rendered Billing Management cases
  verify canceled and past-due learners receive no upgrade controls, canceled learners receive no
  pause or repeat-cancellation pitch, and an Exam Pass holder is never told to cancel a one-time
  purchase. Existing true-pause and signed upgrade-confirmation cases remain covered.
- Commit: `Align billing actions with plan state`.
- Verification: the focused two-file/12-test helper and rendered Billing Management suite, complete
  93-file/646-test Vitest suite, ESLint, strict 176-file analytics audit covering 284 interactive
  controls, and the network-enabled 529-page production build passed. Local HEAD and `origin/main`
  matched exact SHA `1f5fc515a8439849bd91f32de6a1562e9556d7d6`; GitHub's successful Vercel status
  tied that SHA to deployment `dpl_7EW8nbEGcSCV5Gd51H34EjFX4CJS`, which reached promoted `READY`
  on every canonical alias. A disposable confirmed production learner with paid-through
  `plan_status: canceled`, monthly SKU, a future access end, and an inert owned Stripe Customer then
  signed in through the real production dialog and opened Billing Management. The hydrated DOM
  rendered exactly “Premium is ending” and “Review your canceled plan”; its only billing button was
  “Continue to Stripe,” with no upgrade, pause, Exam Pass switch, or repeat-cancellation copy. The
  learner signed out through the production account menu. Its Stripe Customer and Auth user were
  deleted, and service-role read-back found zero matching `users`, `user_quotas`, or rate-limit rows.

## CA-119 — Trialing subscriptions were offered an active-only billing pause

- Status: `FIXED`
- Area: Monetization / trial lifecycle / pause eligibility / Billing Management
- Severity: Low
- Evidence: the Billing Management pause helper treated both `active` and `trialing` Premium rows as
  pause-eligible. The pause API's provider preflight intentionally requires
  `subscription.status === 'active'`, so a trialing learner saw a one-time pause action that could
  only consume a request, retrieve Stripe state, and fail with “This subscription cannot be paused
  automatically.” The upgrade API does accept `trialing`, so hiding all billing actions would also
  have been incorrect.
- Fix: require exact `plan_status: active` for the pause offer while continuing to allow legitimate
  trial-state upgrade choices. Server authorization and provider preflight remain unchanged and
  authoritative.
- Regression coverage: the status helper now explicitly rejects `trialing` pause eligibility, and
  the rendered Billing Management test proves a trialing monthly learner has no “Pause once” button
  while retaining the valid six-month upgrade action.
- Commit: `Hide pause action during trials`.
- Verification: the focused two-file/13-test helper and rendered Billing Management suite, complete
  93-file/647-test Vitest suite, ESLint, strict 176-file analytics audit covering 284 interactive
  controls, and the network-enabled 529-page production build passed. Local HEAD and `origin/main`
  matched exact SHA `6246087c8af0d0ce72973a3d8225380a8222e064`; GitHub's Vercel status tied that
  SHA to deployment `dpl_8SooMA9dzwSgwYbq7qaKEFiJGkGw`, which reached canonical `READY`. A
  disposable confirmed production learner with a monthly trial-state profile then signed in through
  the real dialog and opened Billing Management. The hydrated DOM contained exactly the valid
  “Upgrade to 6 months” and “Upgrade to annual” buttons and no pause button. The learner signed out
  through the production account menu. No Stripe customer or subscription was created; the Auth
  user was deleted, and service-role read-back found zero matching `users`, `user_quotas`, or
  rate-limit rows.

## CA-120 — Signing in briefly exposed the stale Free-plan UI before owner verification

- Status: `FIXED`; loading-ignorant consumers remain a separately logged follow-up surface
- Area: Auth transition / billing state / checkout gating / stale cross-account UI
- Severity: Medium
- Evidence: the signed-out `usePlan` effect settled the shared hook at `loading: false` with a Free
  plan. When Auth subsequently resolved a signed-in user, the owner-row query started without
  restoring the loading flag. Billing Management, Pricing, mock tests, Speaking Examiner, and the
  offer reminder therefore received a render window in which Auth was complete but plan state still
  represented the signed-out visitor. The production CA-118 and CA-119 browser exercises observed
  this twice: the first authenticated Billing Management DOM said “Premium is not active,” then a
  later snapshot changed to the real canceled or trialing state. On Pricing, the same race could
  momentarily expose checkout actions to an existing paid learner.
- Fix: immediately restore `loading: true` and clear stale plan errors whenever a non-null owner ID
  starts a plan query. Consumers that already honor the loading contract now keep billing actions
  blocked until the new owner's row resolves. The existing inactive state remains correct after a
  genuinely signed-out effect, and database failures still fail closed with the explicit plan error.
- Regression coverage: a deferred-query hook case first settles signed out, rerenders with a newly
  authenticated user, requires `loading: true` while the owner query is unresolved, then releases
  Premium state only after the query resolves. Existing resolved-error and verified-Premium cases,
  plus Billing Management and Pricing integration suites, remain green.
- Commit: `Restore plan loading after sign-in`.
- Verification: the focused three-file/21-test hook, Billing Management, and Pricing suite; complete
  93-file/649-test Vitest suite; ESLint; strict 178-file analytics audit covering 287 interactive
  controls; and the network-enabled 529-page production build passed. Local HEAD and `origin/main`
  matched exact SHA `d1d466adfeea2daa90b9a779e0e15b8c4e863a91`; GitHub's successful Vercel
  status tied that SHA to deployment `dpl_5fvvQj9VRbQrqsEh9UXhm9fCc9qU`, which reached promoted
  `READY` on every canonical alias. A disposable confirmed production learner with a paid-through
  canceled profile signed in through the real dialog. On direct authenticated navigation to Billing
  Management, the first DOM snapshot remained at “Loading billing…”; the next resolved directly to
  “Premium is ending” and the correct non-renewal date, with no false inactive render. The learner
  signed out through the production account menu. No Stripe object was created; the Auth user was
  deleted, and service-role read-back found zero matching `users`, `user_quotas`, or rate-limit rows.

## CA-121 — Premium article visits could initialize an ad before plan verification

- Status: `FIXED`; remote-history isolation exception documented below
- Area: Monetization / ads / Premium entitlement / auth transition / third-party requests
- Severity: Medium
- Evidence: `AdUnit` consumed only `usePlan().isPremium`. During the authenticated owner query,
  `isPremium` is still false while `loading` is true, so an article could mount an AdSense slot and
  push it to `adsbygoogle` before the verified Premium result removed the unit. This was the remaining
  ad-specific consumer identified by CA-120 and could disclose a paid learner's page visit to an ad
  provider despite the product promise that Premium removes ads.
- Fix: gate ad rendering on both a configured slot and completed plan verification. `AdUnit` now
  returns nothing while the plan is loading, remains absent for a verified Premium learner, and
  initializes exactly once for a verified Free learner.
- Regression coverage: the component suite holds plan verification in the loading state and proves
  there is no ad DOM and no `adsbygoogle` push, then proves one unit and one push after verified Free
  resolution, followed by removal without another push after verified Premium resolution.
- Commit: `4e154b2747020cdac75093b44b55f9b7c0bd93fb` (`fix: defer ads until plan verification`).
  The intended CA-121 change was limited to `src/components/AdUnit.jsx` and
  `src/components/AdUnit.test.jsx`. Concurrently staged estimator work was accidentally captured in
  the same commit and another process pushed that mixed commit to `main` before the local history
  could be split. The reconstructed two-commit local tree was byte-identical to the pushed tree, but
  rewriting published `main` was not authorized, so the remote commit remains a documented exception
  to the one-fix-per-commit audit rule. Subsequent audit commits must use path-limited commits when
  unrelated staged changes are present.
- Verification: the focused 1-test AdUnit suite, complete 95-file/653-test Vitest suite, ESLint,
  strict 180-file analytics audit covering 291 interactive controls, and the network-enabled
  529-page production build passed. Local HEAD and `origin/main` matched exact mixed SHA
  `4e154b2747020cdac75093b44b55f9b7c0bd93fb`; GitHub's successful Vercel status tied that SHA to
  deployment `dpl_7NvjFX5gGUsoJzPhADbgqXePFM5C`, which reached promoted `READY` on every canonical
  alias. A disposable confirmed production Premium learner signed in through the real dialog and
  opened a live article. Both the immediate authenticated read and settled DOM contained zero ad
  elements and zero configured slot elements while the article content rendered normally. The Auth
  user was deleted, and service-role read-back found zero matching `users`, `user_quotas`, or
  rate-limit rows.

## CA-122 — Estimator scoring reported success when its result was not stored

- Status: `FIXED`
- Area: Band estimator / anonymous Writing score / persistence / conversion journey
- Severity: High
- Evidence: the newly deployed anonymous Writing scorer awaited the Supabase insert but never
  inspected the client's resolved `{ error }`. Supabase write failures normally resolve with an
  error object rather than rejecting the promise, so a missing table, schema drift, database outage,
  or rejected row would still produce HTTP 200 `{ scored: true }`. The visitor would finish the
  estimator and be asked to create an account for a band that `/api/estimator/reveal` could never
  find. A read-only production service-role check confirmed the new table and all queried claim
  columns are currently reachable and contain one row, so the defect was a failure-path data-loss
  risk rather than evidence of a presently missing migration.
- Fix: inspect the estimator-score insert result and route every resolved Supabase error through the
  existing HTTP 503 save-failure response. A successful response is now emitted only after the band
  and report have actually been accepted by the database.
- Regression coverage: the route mock can now return a resolved insert error. The new case completes
  model scoring, rejects persistence, requires HTTP 503 with the retryable save message, and proves
  the response does not contain the false `scored` success flag.
- Commit: `4416f10b32438493e4bd22a01f40839170a84d6b` (`fix: fail closed when estimator storage fails`).
- Verification: the focused 1-file/6-test scorer suite, complete 95-file/654-test Vitest suite,
  ESLint, strict 180-file analytics audit covering 291 interactive controls, and the network-enabled
  529-page production build passed. Local HEAD and `origin/main` matched the exact code SHA; GitHub's
  successful Vercel status tied it to deployment `dpl_JDU3kHKU6mYpCyLQi4yPgvJJCEsj`, which reached
  promoted `READY` on every canonical alias. A no-cost same-origin request to the canonical
  production endpoint reached `/api/estimator/score-writing` and returned the expected HTTP 400 for
  an invalid anonymous identifier before model use or persistence.

## CA-123 — Estimator reveal returned results without a verified ownership claim

- Status: `FIXED`
- Area: Band estimator / post-sign-up reveal / object ownership / attempt history
- Severity: High
- Evidence: the reveal route selected an unclaimed anonymous result, issued an unconditional claim
  update, and neither inspected Supabase's resolved `{ error }` nor verified that the row was still
  unclaimed. A database rejection would therefore be ignored, while two concurrent account claims
  could both proceed from the same pre-claim row. Either path returned the withheld Writing band and
  mirrored an attempt before the route had established durable ownership, leaving the result
  available for a later claimant and potentially filing one anonymous sample into multiple accounts.
  The feature had no route-level reveal tests.
- Fix: condition the ownership update on `claimed_by_user_id IS NULL`, request the updated row, and
  require exactly one successful claim before revealing or mirroring. Resolved database errors now
  return retryable HTTP 503; a lost claim race returns HTTP 409; neither failure path exposes the band
  or creates history. A result already claimed by the same user remains idempotently revealable, and
  rows owned by another user remain indistinguishable from absent rows.
- Regression coverage: the new six-case reveal suite covers authenticated atomic first claim,
  conditional null-owner filtering, attempt/score mirroring, resolved claim errors, a competing
  claimant, same-owner idempotency, other-owner non-disclosure, and unauthenticated rejection.
- Commit: `03e99d50b6cd8bd443260f84985581f8fb686001` (`fix: claim estimator results atomically`).
- Verification: the focused 1-file/6-test reveal suite, complete 96-file/660-test Vitest suite,
  ESLint, strict 180-file analytics audit covering 291 interactive controls, and the network-enabled
  529-page production build passed. Local HEAD and `origin/main` matched the exact code SHA; GitHub's
  successful Vercel status tied it to deployment `dpl_GtGaeqEkfUnr9sz4nj3VFqn4ud6Z`, which reached
  promoted `READY` on every canonical alias. A disposable confirmed production learner then claimed
  a service-role-seeded anonymous estimator result through the canonical authenticated route. The
  first response returned the expected Free band, production read-back matched the claim owner and
  timestamp, and exactly one attempt plus one score existed. A second reveal returned the same result
  without duplicating history. The estimator row, Auth user, profile, attempt, and score were deleted;
  service-role read-back found zero matching rows in all four audited data groups.

## CA-124 — Anonymous estimator essays had no deletion path

- Status: `FIXED`
- Area: Band estimator / privacy / data retention / scheduled cleanup
- Severity: High
- Evidence: the reveal route intentionally ignores estimator samples after 30 days, but the newly
  deployed table stored full anonymous essay text indefinitely and the authenticated daily cleanup
  handled only stale rate-limit rows and Speaking uploads. An expired sample could therefore no
  longer provide any product function while its browser-linked writing remained in production. The
  privacy policy described signed-in Writing history and Speaking-recording cleanup but did not
  disclose this anonymous estimator storage or a retention period.
- Fix: extend the existing authenticated daily cleanup with an exact-count deletion of
  `estimator_writing_scores` rows older than 30 days, fail the run explicitly if that database
  cleanup cannot be verified, and report `estimatorResultsRemoved` in the cron response. The privacy
  policy now discloses the random browser identifier, post-sign-up reveal purpose, 30-day maximum,
  and scheduled deletion of the separate estimator copy.
- Regression coverage: the 18-case cleanup suite now covers the exact 30-day `created_at` cutoff,
  count reporting, resolved database errors, rejected database calls, and prevention of downstream
  Storage work after an unverified estimator cleanup. Existing method/auth/configuration guards,
  rate-limit deletion, recursive and paginated Storage traversal, bounded removal, and all failure
  paths remain covered with the expanded response contract.
- Commit: `dff30b9c0d750772b3f8089cc758ffc9f3a22de6` (`fix: expire anonymous estimator samples`).
- Verification: the focused 1-file/18-test cleanup suite, complete 96-file/663-test Vitest suite,
  ESLint, strict 180-file analytics audit covering 291 interactive controls, and the network-enabled
  529-page production build passed. Local HEAD and `origin/main` matched the exact code SHA; GitHub's
  successful Vercel status tied it to deployment `dpl_8TraJeGKkPxW2gW4uyUDZvtokW9e`, which reached
  promoted `READY` on every canonical alias. A live service-role proof inserted one disposable
  31-day-old sample and one current sample, then exercised the same exact-count cutoff semantics:
  one row was removed, the expired sample was absent, and the current sample remained. Final cleanup
  removed the retained fixture and read back zero matching rows. The canonical production privacy
  page rendered the complete new 30-day estimator disclosure.

## CA-125 — Privacy policy effective date predated its material estimator disclosure

- Status: `FIXED`
- Area: Privacy policy / disclosure accuracy / estimator retention
- Severity: Low
- Evidence: CA-124 materially changed the public policy to disclose anonymous estimator essay
  storage and its 30-day deletion lifecycle on July 21, 2026, but the rendered page still said
  “Last updated: July 18, 2026.” The page also states that policy changes become effective on the
  displayed date, so the stale label misrepresented when the new collection and retention terms
  became effective.
- Fix: centralize the policy's last-updated value alongside its existing metadata contract, set it to
  July 21, 2026, and render the exported value on the page rather than leaving an unrelated literal
  embedded in the component.
- Regression coverage: the privacy metadata suite now pins the effective date together with the
  canonical, title, description, social-card parameters, and image-alt contract.
- Commit: `dbb556742a3df1f8bbfd67032046e13004311a6f` (`fix: update privacy policy effective date`).
- Verification: the focused 1-file/2-test privacy suite, complete 96-file/663-test Vitest suite,
  ESLint, strict 180-file analytics audit covering 291 interactive controls, and the network-enabled
  529-page production build passed. Local HEAD and `origin/main` matched the exact code SHA; GitHub's
  successful Vercel status tied it to deployment `dpl_KLxiJfnPiTT83U6su5CsL2zL9dAS`, which reached
  promoted `READY` on every canonical alias. Fresh canonical production HTML rendered exactly “Last
  updated: July 21, 2026.”

## CA-126 — Estimator reveal treated a plan lookup outage as verified Free

- Status: `FIXED`
- Area: Band estimator / Premium entitlement / reveal reliability / fail-closed billing state
- Severity: Medium
- Evidence: `fetchPremiumStatus` deliberately returns separate entitlement and error fields so a
  route can distinguish a verified Free account from a database outage. The new estimator reveal
  route discarded the error and used only `isPremium`. Any billing-profile read failure therefore
  returned HTTP 200 with the redacted Free payload to a Premium learner, falsely implying the full
  report was not included in their plan and making a temporary service problem look like a durable
  entitlement decision.
- Fix: require an error-free plan lookup before choosing either report shape. A billing-profile
  failure now returns retryable HTTP 503 without a band payload; verified Free and Premium branches
  remain unchanged.
- Regression coverage: the seven-case reveal suite now injects a resolved plan-query error for an
  already owned result, requires the explicit HTTP 503 response, and proves no band is disclosed.
  Atomic ownership, claim failures and races, same-user idempotency, other-user non-disclosure, and
  unauthenticated rejection remain covered.
- Commit: `4ee69f4022a9c286f1b710bc5556df3604e0b1e5` (`fix: fail closed on estimator plan outage`).
- Verification: the focused 1-file/7-test reveal suite, complete 96-file/664-test Vitest suite,
  ESLint, strict 180-file analytics audit covering 291 interactive controls, and the network-enabled
  529-page production build passed. Local HEAD and `origin/main` matched the exact code SHA; GitHub's
  successful Vercel status tied it to deployment `dpl_D4dXYtX8wV9muUHLgNKsEMGy7zzE`, which reached
  promoted `READY` on every canonical alias. A disposable confirmed Premium production learner then
  claimed a seeded estimator result through the canonical route. The response returned HTTP 200,
  `premium: true`, Band 7, all four criteria, the summary, improvements, and corrected examples.
  Direct access to the underlying table with that authenticated learner still returned Postgres
  `42501` and zero rows. The estimator row, learner, profile, attempt, and score were deleted, and
  service-role read-back found zero matching rows in all four audited data groups.

## CA-127 — Quota modal pitched Premium before the learner's plan was verified

- Status: `FIXED`
- Area: Auth transition / AI quota / Premium messaging / conversion telemetry
- Severity: Medium
- Evidence: `AiQuotaPanel` consumed only `usePlan().isPremium`, one of the loading-ignorant
  consumers recorded after CA-120. If a quota response opened the modal while a signed-in owner's
  plan query was still loading, the default false entitlement rendered “AI Writing/Speaking scoring
  is a Premium feature,” displayed an upgrade link to an existing Premium learner, and emitted a
  `premium_gate` impression with `premium: false`. The UI could later switch to the correct fair-use
  message, but the misleading pitch and false analytics event had already occurred.
- Fix: keep the quota modal closed while owner-plan verification is loading, reset its impression
  guard during that unresolved state, and render plus attribute the modal only after the verified
  Free or Premium result is available.
- Regression coverage: the new two-case component suite begins with an open modal and unresolved
  plan, proves there is no dialog, purchase copy, or telemetry, then resolves a Premium owner and
  requires only the fair-use message plus one correctly attributed Premium impression. A verified
  Free owner still receives the upgrade path and a Free impression.
- Commit: `810b6e091a57aaf9d5e1948eb340cafeb416b0b4` (`fix: defer quota modal until plan verification`).
- Verification: the focused 1-file/2-test quota-modal suite, complete 97-file/666-test Vitest suite,
  ESLint, strict 181-file analytics audit covering 291 interactive controls, and the network-enabled
  529-page production build passed. Local HEAD and `origin/main` matched the exact code SHA; GitHub's
  successful Vercel status tied it to deployment `dpl_Fdrw4RNfUKz6CjCV7FCfSN4TXB2P`, which reached
  promoted `READY` on every canonical alias.

## CA-128 — Estimator discarded the Writing feedback returned after reveal

- Status: `FIXED`
- Area: Band estimator / post-sign-up reward / Free entitlement / Premium report
- Severity: High
- Evidence: `/api/estimator/reveal` intentionally returned the overall Writing band plus the first
  full criterion to a Free learner, and all four criteria, examiner summary, improvement plan, and
  corrected examples to Premium. `EstimatorResults` stored that response but passed only `band` and
  `wordCount` into a small card. Both account types therefore saw only the indicative band; the Free
  criterion and entire paid report were discarded despite being securely delivered, undermining the
  sign-up reward and withholding a Premium entitlement the API had already authorized.
- Fix: render the revealed payload through the existing secure Writing report component. Estimator
  copy now identifies a short sample rather than an essay and uses estimator-specific paywall
  attribution. A Free response renders Task Response in full while the absent API fields remain
  label-only Premium placeholders; no locked feedback is placed in the DOM. A Premium response
  renders all criteria, summary, improvements, and corrected examples.
- Regression coverage: the focused estimator/report suites verify the Free criterion is visible,
  locked criterion labels and the sample-specific upgrade count render, paid feedback text is absent
  from the Free DOM, and the Premium response renders Lexical feedback, summary, corrections, and no
  upgrade control. Existing shared full-essay Free/Premium report behavior remains green.
- Commit: `5dd2d1dbcce94fef2081de7d79f9c169f953dd80` (`fix: render revealed estimator writing feedback`).
- Verification: the focused 2-file/6-test estimator/report suite, complete 97-file/667-test Vitest
  suite, ESLint, strict 181-file analytics audit covering 291 interactive controls, and the
  network-enabled 529-page production build passed. Local HEAD and `origin/main` matched the exact
  code SHA; GitHub's successful Vercel status tied it to deployment
  `dpl_8zmBt6goyCicmNGJDBveQJjjgDmn`, which reached promoted `READY` on every canonical alias. The
  fresh canonical `/band-estimator` HTML referenced page chunk
  `band-estimator-e962375b6f064956.js`; that promoted chunk contained the new “Your Writing
  feedback,” “Indicative short Writing sample,” secure unlock, and estimator attribution literals.

## CA-129 — Claimed estimator results could permanently miss dashboard history

- Status: `FIXED`
- Area: Band estimator / account linking / dashboard history / retry safety / concurrent requests
- Severity: High
- Evidence: the reveal route atomically claimed the anonymous estimator row, then deliberately
  treated its `attempts` and `scores` writes as fail-soft. If either write failed, the route still
  returned the band. Every later same-owner reveal skipped history mirroring because only a first
  claim called the writer. A transient database failure could therefore consume the account-linking
  transition, tell the learner the save succeeded, and permanently omit the promised baseline from
  their dashboard. The old insert pair also had no idempotency key, so simply retrying it would have
  risked duplicate attempts or scores under concurrent requests.
- Fix: run history reconciliation for both first claims and same-owner re-reveals, and return a
  retryable HTTP 503 without a band until both the attempt and score are durably present. New rows
  use the estimator row UUID as the deterministic primary key in both tables and record
  `estimatorScoreId` in the attempt responses. Primary-key conflicts are read back as possible
  concurrent wins, making parallel retries converge on one attempt and one score. The lookup also
  recognizes the timestamp/source shape written by CA-121 through CA-128 so already-saved history
  is reused rather than duplicated. A score failure retains the deterministic attempt, allowing a
  later reveal to complete the missing half safely.
- Regression coverage: the 12-case reveal suite now covers missing-history repair, sequential and
  truly concurrent same-owner reveals, deterministic IDs and marker ownership, transient attempt
  and score failures followed by successful retries, and reuse of legacy estimator history. Atomic
  claim errors and races, other-user non-disclosure, plan lookup failure, Free response shape, and
  authentication enforcement remain covered.
- Commit: `5de4e2c3f012cfd7e9c2db13efe4e33f7fe489e2`
  (`fix: retry estimator history persistence`).
- Verification: the focused 1-file/12-test reveal suite, complete 97-file/672-test Vitest suite,
  ESLint, strict 181-file analytics audit covering 291 interactive controls, and the network-enabled
  529-page production build passed. The verified base was the exact prior canonical production SHA;
  local HEAD and `origin/main` then matched the code SHA above. GitHub's successful Vercel status
  tied it to deployment `dpl_hffpP39BZqd9CNoe5aHrDcCsx3Fi`, which reached promoted `READY` on every
  canonical alias. A disposable confirmed Free production learner claimed a seeded estimator row
  through `www.ielts-bank.com`, then issued two concurrent same-owner reveals. All three responses
  returned HTTP 200, Band 6.5, and `premium: false`; service-role read-back found exactly one owned
  attempt, one owned score, both deterministic IDs, and the estimator marker. Cleanup deleted the
  estimator row and Auth user; exact read-back found zero estimator rows, attempts, scores, profile
  rows, and lifecycle-email rows for the audit fixtures.

## CA-130 — Estimator showed verified-Free pitches before plan verification

- Status: `FIXED`
- Area: Band estimator / auth transition / Premium messaging / plan lookup failure
- Severity: Medium
- Evidence: `EstimatorResults` consumed `usePlan().isPremium` without its loading or error state.
  The hook intentionally initializes `isPremium` to false while it queries a newly signed-in owner.
  During that interval, a Premium learner's results rendered the Free acquisition messages “Get
  your real Writing band” and “Meet the AI examiner.” If the profile query failed, those messages
  remained indefinitely, converting an unknown entitlement into an apparently verified Free plan.
  This was the last loading-ignorant `usePlan` consumer recorded in the estimator investigation.
- Fix: signed-in results now render an accessible “Checking your plan…” status while the owner plan
  is unresolved. Plan-specific Writing and Speaking next steps appear only after a successful query.
  A lookup error renders the hook's explicit refresh message in an alert and never falls through to
  Free copy. Anonymous visitors still receive the appropriate Free acquisition path without waiting
  for an owner-only query.
- Regression coverage: the six-case estimator results DOM suite now starts a signed-in learner in
  unresolved default-Free state, proves neither Free pitch is present, then resolves the same render
  to Premium and requires the two Premium messages. A separate error case proves plan-query failure
  renders the explicit alert and no Free copy. Anonymous gating, post-sign-in reveal, full Premium
  Writing feedback, and self-assessed fallback behavior remain covered.
- Commit: `7fbae103a0d62a1b7dd14d84eeaf438069524b50`
  (`fix: wait for estimator plan verification`).
- Verification: the focused 1-file/6-test estimator results suite, complete 97-file/674-test Vitest
  suite, ESLint, strict 181-file analytics audit covering 291 interactive controls, and the
  network-enabled 529-page production build passed. Local HEAD and `origin/main` matched the exact
  code SHA, and GitHub's successful Vercel status tied it to deployment
  `dpl_dSMRNQgns9AQbVM5pw3H6cPyY1Lj`, which reached promoted `READY` on every canonical alias. Fresh
  canonical `/band-estimator` HTML referenced `band-estimator-01acee39ccff060e.js`; the promoted
  chunk contained the new checking, personalised-next-steps, and plan-verification-error literals.

## CA-131 — Empty or partial measured sections became false low bands

- Status: `FIXED`
- Area: Band estimator / Reading / Listening / scoring integrity / accidental submission
- Severity: High
- Evidence: Reading and Listening exposed an always-enabled Continue button. Their scorer correctly
  counts blank questions as incorrect, so clicking Continue with zero or partial answers recorded a
  completed measured section and converted the omissions into a very low band. The same screen also
  had a distinct “Skip this section” path, but the primary control bypassed that honest null result.
  This contradicted the Writing/Speaking self-assessment steps, which already require every question
  before Continue. The live Reading set also contains one “Choose TWO” multi-select; the shared
  grader calls a one-option response “answered,” so a simple nonblank count would still have accepted
  a structurally incomplete response.
- Fix: derive measured-section completion from every rendered question and disable Continue until
  all are complete. Standard inputs reuse the shared grader's type-aware nonblank semantics. A
  multi-select is complete only when its selection count exactly matches the question's required
  option count, without checking whether those selections are correct. The UI reports the live
  complete/total count; missing content stays blocked with an explicit unavailable message, and
  “Skip this section” remains available at every point.
- Regression coverage: the six-case runner integration suite now uses real question-shaped Reading
  and Listening fixtures instead of empty arrays. It proves an empty two-question section is
  blocked, a completed TF/NG plus one of two required checkbox choices is still blocked, the exact
  second selection enables Continue, and choosing Skip records `skipped: true` rather than a low
  measured score. Step transitions, writing-gate disclosure, all-skill skip, local result
  persistence, and analytics remain covered.
- Commit: `ec28246046ce48605c35e2da2ed1ffbb3b9114d1`
  (`fix: require complete estimator sections`).
- Verification: the focused 1-file/6-test runner suite, complete 97-file/675-test Vitest suite,
  ESLint, strict 181-file analytics audit covering 291 interactive controls, and the network-enabled
  529-page production build passed. Canonical page-data inspection confirmed the guard's live input
  surface includes sentence completion, TF/NG, matching features, single-choice, note completion,
  and a two-selection multi-choice question. Local HEAD and `origin/main` matched the exact code SHA;
  GitHub's successful Vercel status tied it to deployment `dpl_5z1ESgkmp8amd1JvouHLT2PE7BqC`, which
  reached promoted `READY` on every canonical alias. Fresh canonical `/band-estimator` HTML
  referenced `band-estimator-049ed9793748e730.js`, and that promoted chunk contained the completion
  and unavailable-section barrier literals.

## CA-132 — Estimator disclosures described the obsolete anonymous Writing flow

- Status: `FIXED`
- Area: Band estimator / account disclosure / SEO / FAQ schema / flow contract
- Severity: Medium
- Evidence: the page accurately disclosed near the Writing step that the marked sample's band and
  overall require a free account, but its “Do I need an account?” FAQ said the complete estimate was
  anonymous and that visitors could create an account afterward to score Writing. The default flow
  now scores Writing before that reveal gate, so the two adjacent public answers directly
  contradicted each other. The search, Open Graph, and Twitter description also said users would
  self-check Writing and promised “Free, no sign-up,” while the default is a genuinely marked sample
  with a free-account reveal. The flow constants still classified Writing exclusively as
  self-assessed, preserving the same obsolete contract internally.
- Fix: centralize the FAQ so visible content and FAQ JSON-LD share one source. The account answer now
  explains both valid journeys: anonymous completion through the Writing self-check, or a marked
  sample whose band and overall require a free account with no payment. The 159-character metadata
  description now states marked Writing, “Free to start,” and the reveal sign-up. Writing is
  classified as hybrid—measured by default and self-assessed through its explicit fallback—without
  duplicating it in ordered skill iteration; scoring/result behavior is unchanged.
- Regression coverage: a new FAQ contract suite pins the anonymous fallback, marked-sample gate,
  and removal of both contradictory phrases. The SEO suite requires marked Writing, free-to-start,
  and reveal language while rejecting the obsolete self-check/no-sign-up claims. Flow tests require
  Writing to satisfy both measured and self-assessed classifications. Existing canonical/social-card
  parameters, step order, result assembly, skip handling, and scoring suites remain green.
- Commit: `394109731daee51a3fd0201a2fd70b10cf3116fc`
  (`fix: align estimator account disclosures`).
- Verification: the focused 3-file/16-test FAQ/SEO/flow suite, complete 98-file/676-test Vitest
  suite, ESLint, strict 181-file analytics audit covering 291 interactive controls, and the
  network-enabled 529-page production build passed. Local HEAD and `origin/main` matched the exact
  code SHA; GitHub's successful Vercel status tied it to deployment
  `dpl_FKJGUjkbProHgMdjLS51jje782RZ`, which reached promoted `READY` on every canonical alias. Fresh
  canonical server-rendered HTML contained the corrected 159-character description and exactly two
  copies of the corrected account answer—visible FAQ plus FAQ JSON-LD. It contained zero copies of
  “The complete estimate is anonymous and free,” “Free, no sign-up,” or the obsolete “self-check
  your Writing and Speaking” description.

## CA-133 — Revealed estimator overall was not persisted for the return journey

- Status: `FIXED`
- Area: Band estimator / authenticated reveal / local persistence / return journey
- Severity: Medium
- Evidence: the anonymous completion snapshot deliberately stores `overall: null` and
  `writingLocked: true` because the client has not received the marked Writing band. After sign-in,
  `EstimatorResults` fetched the authorized band and recomputed the correct overall for the current
  render, but never updated the runner's `lastResult` or `ielts-estimator-result` local-storage row.
  Returning to the intro therefore showed “Your last estimate: — overall” after a successful reveal,
  even though the learner had unlocked and saved a real numeric estimate.
- Fix: pass the revealed band and recomputed overall back to the runner through a stable callback.
  A pure merge replaces the local Writing placeholder, writes the numeric overall, removes the lock
  marker, preserves the rest of the completion snapshot, and writes the updated result through the
  existing storage-safe helper. Only those two numeric results are persisted; criterion feedback,
  summary, improvements, corrections, entitlement fields, and the full API payload remain in
  component memory and are fetched again under server authorization when needed.
- Regression coverage: the estimator results DOM suite requires the successful reveal callback to
  receive Band 6 and the recomputed 6.5 overall for its measured/self-assessed mix. The flow suite
  starts from a real locked result, requires the Writing band and overall to replace the nulls, and
  proves `writingLocked` is absent afterward. Reveal gating, Free/Premium feedback boundaries,
  loading/error states, step persistence, and all completion behavior remain covered.
- Commit: `d8cdb792afdec51c304f502b9288e8e1ce5f2029`
  (`fix: persist revealed estimator overall`).
- Verification: the focused 3-file/26-test estimator lifecycle suite, complete 98-file/677-test
  Vitest suite, ESLint, strict 181-file analytics audit covering 291 interactive controls, and the
  network-enabled 529-page production build passed. Local HEAD and `origin/main` matched the exact
  code SHA; GitHub's successful Vercel status tied it to deployment
  `dpl_CgzxbeMx2Hg8EFxTbs2GQRbdU8F4`, which reached promoted `READY` on every canonical alias. Fresh
  canonical HTML referenced `band-estimator-0559086ce6375f05.js`; direct promoted-chunk inspection
  showed the compiled merge deleting `writingLocked`, replacing `bands.writing` and `overall`, and
  passing only that merged completion result to the existing local-storage writer.

## CA-134 — Anonymous estimator scorer trusted a caller-controlled task prompt

- Status: `FIXED`
- Area: Band estimator / anonymous Writing scorer / model spend / prompt integrity
- Severity: High
- Evidence: the public estimator presents one fixed short Writing question, but its browser request
  also sent that question as a mutable `prompt` field. The server accepted any caller-supplied
  string up to 600 characters and placed it directly in the OpenAI user message. A caller could
  therefore reuse the anonymous, platform-funded scorer for unrelated questions or injected task
  instructions, even though the endpoint's product contract and calibrated system prompt are
  limited to the estimator's single diagnostic task. Length, origin, per-anonymous-ID, per-IP, and
  global limits constrained volume but did not bind what the paid model was asked to assess.
- Fix: make the API use `WRITING_SAMPLE_TASK.prompt` from the shared server import as the sole task
  question and ignore any extra body `prompt`. The browser now sends only the anonymous UUID and
  response text, so the mutable field is absent in normal traffic as well as ineffective at the
  security boundary.
- Regression coverage: the seven-case scorer route suite submits an explicit unrelated/injected
  prompt, inspects the outbound OpenAI request, requires the canonical estimator question, and
  proves the injected text is absent. Anonymous band non-disclosure, ID and word-count validation,
  pre-model rate limiting, and fail-closed result persistence remain covered.
- Commit: `602cf8e63806bdc33d5cc5e97ba58494ed525b12`
  (`fix: bind estimator scoring to fixed task`).
- Verification: the focused 1-file/7-test scorer suite, complete 98-file/678-test Vitest suite,
  ESLint, strict 181-file analytics audit covering 291 interactive controls, and the network-enabled
  529-page production build passed. The verified base was the exact prior canonical production SHA;
  local HEAD and `origin/main` then matched the code SHA above. GitHub's successful Vercel status
  tied it to deployment `dpl_AFCcfafFLPS7VcEZniutkBTQ9KTe`, which reached promoted `READY` on every
  canonical alias. Fresh canonical `/band-estimator` HTML referenced
  `band-estimator-b9da531edd14f880.js`; direct promoted-chunk inspection showed the scorer body
  serializing only `anon_id` and `essay`, with no prompt field. A same-origin production POST with
  an invalid UUID and an injected prompt returned the expected HTTP 400 anonymous-ID rejection.

## CA-135 — Storage-denied browsers could not submit measured estimator Writing

- Status: `FIXED`
- Area: Band estimator / anonymous identity / storage failure / Writing submission
- Severity: Medium
- Evidence: the shared anonymous-ID helper wrapped its entire `localStorage` path in a try/catch and
  returned `null` whenever storage access or persistence threw. That ID is not merely optional
  analytics metadata: the anonymous Writing scorer requires a valid UUID so it can withhold and
  later reveal the marked result. A storage-denied browser could write a valid 40–180-word sample,
  but the client then sent `anon_id: null` and the API rejected the journey. The helper also trusted
  any non-empty stored string, so one corrupted value caused every later scorer request to fail its
  UUID validation until the visitor manually cleared site data.
- Fix: validate persisted anonymous IDs against the same UUID shape accepted by the APIs, replace a
  malformed value, and retain the generated UUID in module memory. If `localStorage` throws, the
  helper now returns that stable in-page functional ID rather than null; later calls reuse it, and a
  successful storage access keeps the persisted and in-memory identities synchronized.
- Regression coverage: the analytics/helper suite forces both `localStorage.getItem` and
  `setItem` to throw, requires two calls to return the same valid generated UUID, and proves only
  one UUID was generated. A separate case seeds a corrupt value and requires a valid replacement to
  be persisted. The focused anonymous scorer suite remains green against the same UUID contract.
- Commit: `ee805f5c00055711db4cc734b6ea955271ebc38a`
  (`fix: preserve estimator identity without storage`).
- Verification: the focused 2-file/17-test helper/scorer run, complete 98-file/680-test Vitest
  suite, ESLint, strict 181-file analytics audit covering 291 interactive controls, and the
  network-enabled 529-page production build passed. The verified base was the exact prior canonical
  production evidence SHA; local HEAD and `origin/main` then matched the code SHA above. GitHub's
  successful Vercel status tied it to deployment `dpl_FDxDTWGMMVnjUyuuXKwuJKe9uKgY`, which reached
  promoted `READY` on every canonical alias. Fresh canonical `/band-estimator` HTML referenced
  `_app-4eb3c78124a2ed59.js`; direct promoted-chunk inspection showed the UUID-format check,
  corrupted-value replacement, and catch path returning the stable generated fallback.

## CA-136 — Locally blocked scoring requests consumed global AI capacity

- Status: `FIXED`
- Area: AI Writing / recorded Speaking / realtime Speaking / estimator Writing / availability
- Severity: High
- Evidence: all four metered scoring routes invoked their shared daily circuit-breaker bucket before
  the narrower anonymous-ID, IP, or user bucket. `check_rate_limit` is an atomic increment, not a
  read-only capacity check. A caller already over their local cap could therefore repeat requests
  that never reached OpenAI but still incremented the global counter. One IP could exhaust the
  Writing or realtime shared allowance; one Premium owner could exhaust recorded Speaking; and an
  anonymous estimator caller could burn global capacity after either the visitor or IP limit had
  already denied them, turning a local throttle into a service-wide availability failure.
- Fix: evaluate limiters from narrowest identity to widest scope. The estimator now checks
  anonymous UUID, then IP, then global capacity; authenticated Writing and realtime Speaking check
  IP before global; recorded Speaking checks its authenticated owner before global. Existing
  fail-closed dependency handling, status codes, quota sequencing, and owned-audio cleanup remain
  unchanged. Eligible requests still increment the global cost breaker immediately before paid
  provider work.
- Regression coverage: the four focused route suites now pin the exact bucket order. Anonymous,
  IP, and user denial/error cases require only their caller-specific bucket(s) and prove the global
  bucket is untouched. Separate global exhaustion/error cases require successful narrow checks
  first and then the shared bucket, preserving every endpoint's established HTTP 429 or 503
  contract and preventing OpenAI/persistence work.
- Commit: `e70fb53c6b94ae8b722436426bdec8c05f441361`
  (`fix: protect global scoring capacity`).
- Verification: the focused 4-file/63-test scorer route run, complete 98-file/682-test Vitest suite,
  ESLint, strict 181-file analytics audit covering 291 interactive controls, and the network-enabled
  529-page production build passed. The verified base was the exact prior canonical production
  evidence SHA; local HEAD and `origin/main` then matched the code SHA above. GitHub's successful
  Vercel status tied it to deployment `dpl_9xiWbd8Tb7ctSmRLEPVt3xQRdSnn`, which reached promoted
  `READY` on every canonical alias. Production rate-limit rows were deliberately not mutated for
  live proof; the deployed server change is tied to the exact successful SHA and its deterministic
  RPC-order route coverage.

## Investigation notes

- The three loading-ignorant `usePlan` consumers found during the owner-transition audit are now
  corrected: `AdUnit` in CA-121, `AiQuotaPanel` in CA-127, and `EstimatorResults` in CA-130.

- A live production query using only the public anonymous Supabase key attempted to select from
  `estimator_writing_scores`. Postgres returned `42501`, and zero rows were exposed, confirming the
  table's no-client-policy RLS and revoked grants are active in production.

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
