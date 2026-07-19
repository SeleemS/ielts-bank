# Audit Action Plan Progress

Source: `docs/AUDIT-ACTION-PLAN-2026-07.md`

Last updated: 2026-07-19

## Status legend

- `DONE` — implemented and verified against the task's acceptance criteria
- `SUPERSEDED` — historical implementation replaced by a newer source of truth
- `OWNER` — requires Seleem or an external account/dashboard decision
- `GATED` — intentionally deferred by the product threshold in the plan

## Phase 1 — Critical fixes

- 1.1 `DONE` — exact production origin allow-list; localhost is development-only; trusted client-IP precedence; valid bearer authentication required for Writing; global scoring limits fail closed. Production HTTP probes: spoofed origin `403`, unsigned Writing request `401`.
- 1.2 `OWNER` — choose and configure the canonical host in Vercel. The existing apex canonical/sitemap convention is preserved until this is resolved.
- 1.3 `DONE` — false model-answer copy was removed, then restored only after 4.2 shipped 144 real model answers.
- 1.4 `DONE` — all four skills are named sitewide, live database counters replace stale hardcoding, Reading uses “passages,” Speaking links are present, and the signed-out dashboard includes an inline sign-in action.
- 1.5 `OWNER` — rotate the Supabase service-role key and database password previously shared in chat.

## Phase 2 — Learning experience

- 2.1 `DONE` — `answer_keys.explanation`, importer support, 1,269 live explanation rows, sanitized post-submit “Why” evidence, and browser verification on a Reading passage.
- 2.2 `DONE` — sanitized, post-submit Listening transcript reveal; live coverage is 45/45 published Listening pages and the reveal was browser-tested.
- 2.3 `DONE` — debounced answer/deadline/flag persistence, hydration, submit cleanup, and browser-verified refresh resume.
- 2.4 `DONE` — persisted timed/untimed mode, auto-submit, stop-on-submit, five/one-minute announcements, 20-minute Reading default, audio-plus-ten-minute Listening practice, and shared mock timers.
- 2.5 `DONE` — sticky answered/unanswered/flagged navigation palette, anchors, scrolling, and per-question flag controls.
- 2.6 `DONE` — three same-skill related items on all four question surfaces plus Reading/Listening-to-Writing cross-sell.
- 2.7 `DONE` — labels, pressed states, focusable live result summary, and a shared Escape/focus-trapped modal with focus restoration. Hydration QA also fixed the Badge primitive’s invalid block-inside-paragraph markup.
- 2.8 `DONE` — three 60-minute Academic Reading and two four-part Listening mocks, all exactly 40 questions, using non-overlapping deterministic compositions; `/mock-test`, `/mock/[slug]`, navigation and sitemap coverage; band conversion uses the seeded table-equivalent data rather than percentages.

## Phase 3 — Tracking and analytics

- 3.1 `DONE` — shared analytics helper and the requested funnel taxonomy across questions, Writing, Speaking, checker, auth, newsletter, contact, calculator and audio.
- 3.2 `DONE` — GA4 user-id set/clear, duplicate automatic pageview disabled, initial and SPA pageviews implemented, and authenticated telemetry automatically carries the current bearer token.
- 3.3 `DONE` — live migration adds `attempts.total` and `per_question`; `started_at`, totals and question results are persisted for practice and AI scoring attempts.
- 3.4 `DONE` — RLS-private `activity_events`, UUID-backed anonymous IDs, rate-limited `/api/track`, auth-time historical linking and bearer-linked future events. The endpoint accepted a live `202` QA probe and rejects malformed IDs with `400`; text/audio/email fields are filtered.
- 3.5 `DONE` — dashboard weakness-by-type, oldest-first mistake retry, Writing criterion trends, target-band prompt/gap, and distinct-day streak.
- GA4 custom-dimension registration is `OWNER`: recommended event-scoped dimensions are `skill`, `slug`, `signed_in`, `question_type`, `outcome`, `task`, `part`, `source`, `trigger`, `score_pct`, `duration_seconds`, `word_count` and `band`.

## Phase 4 — Content

- 4.1 `DONE` — all 13 Reading question-type hubs build and appear in the sitemap.
- 4.2 `DONE` — migration and resumable generator shipped; 144/144 published Writing tasks have a sanitized Band 8–9 model answer and examiner-style rationale with a reveal UI.
- 4.3 `DONE` — 31/31 published Academic Task 1 tasks have an inline accessible SVG; the final missing employment table visual was generated and live-verified.
- 4.4 `DONE` — zero Reading rows missing module, zero Writing rows missing difficulty, zero published Reading pages below the 1,500-character floor; the five thin 2025 blog posts were expanded/reframed.
- 4.5 `DONE` — gap-cluster topic queue, generator and daily GitHub Actions generate/build/commit/push workflow are in place. `OWNER` activation: populate the repository secrets listed in `.github/workflows/daily-blog.yml` if they are not already configured.
- 4.6 `DONE` — Reading completion/GT and General Writing priorities are encoded in `scripts/content/generation-priorities.json`; Speaking model-answer audio remains an explicitly later premium candidate.

## Phase 5 — Monetization

- 5.1 `SUPERSEDED` — the July 19 monetization plan replaces the three-score meter with one lifetime signed-in Writing sample, a cheap-model/full-report tease, Premium-only Speaking, and Premium daily fair-use caps. See `docs/MONETIZATION-PROGRESS-2026-07-18.md`.
- 5.2 `DONE` — shared quota panel on checker/Writing/Speaking and accessible waitlist modal for `402`/`429`.
- 5.3 `DONE` — score-another, quota-remaining, waitlist and onward-practice CTAs after Writing and Speaking results.
- 5.4 `DONE` — result cross-sell plus newsletter coverage on results, homepage, calculator, blog and scoring surfaces; Resend-backed signup, purchase, weekly, and win-back lifecycle delivery is implemented.
- 5.5 `DONE` — Stripe billing and `/pricing` include server-selected PPP, Monthly/6-month/Annual subscriptions, a non-renewing Exam Pass, checkout reconciliation, idempotent activation telemetry, a pause/cancel interstitial, and the Customer Portal. Both July 19 production migrations are applied and advisor-verified.
- 5.6 `DONE` — explicit blog/section-list units, public-host-only AdSense loading, and exclusions for dashboard/auth/scoring/results/mock/question-detail surfaces. `OWNER` activation: set `NEXT_PUBLIC_ADSENSE_SLOT_IN_CONTENT` to render the explicit units and monitor AdSense thin-page reports.

## Phase 6 — Tech debt and hardening

- 6.1 `DONE` — Chakra/Emotion/Framer/Firebase/web-vitals/testing-library runtime dependencies removed; CRA corpses and stale components/CSS deleted; Firebase migration documented as isolated archived tooling; `.tw-root` eliminated; canvas-confetti dynamically loaded.
- 6.2 `DONE` — direct ESLint CLI with zero warnings, Vitest 4 with 10 passing grading/dashboard/sanitizer tests, and Next build-time lint/type validation. Next upgraded to 15.5.20 and narrow transitive overrides applied; full `npm audit` reports zero vulnerabilities.
- 6.3 `DONE` — enforced CSP with same-origin reporting endpoint, security headers, authenticated daily cleanup cron, immediate post-score recording deletion plus 30-day fallback cleanup, and escaped JSON-LD. Legacy-ID redirects in 6.3(e) remain `OWNER`-blocked by canonical-host task 1.2 to avoid redirect chains.
- 6.4 `DONE` — Listening uses metadata preload/loading state; Speaking examiner audio exposes a visible loading state.

## Final verification record

- `npm run lint`: pass, zero warnings/errors.
- Latest monetization verification: 17 test files / 139 tests passed; production build generated 527 static pages.
- `npm audit`: 0 vulnerabilities across production and development dependencies.
- `git diff --check`: pass.
- `npm run build`: pass on Next 15.5.20; 527 static pages generated.
- Production HTTP: CSP enforced; spoofed scoring origin `403`; unsigned Writing `401`; invalid telemetry `400`; valid telemetry `202`; CSP report `204`.
- Browser QA: mock answering and refresh resume, Reading explanations, Listening transcript, Writing model-answer reveal, updated privacy copy, four-skill homepage copy, and zero first-party console warnings/errors on the final production build.
- Live database: 1,269 explanations; 45/45 transcripts; 144/144 model answers/rationales; 31/31 Academic Task 1 SVGs; five published mocks and all are exactly 40 questions; telemetry RLS enabled; quota function ACL/security configuration verified.

## Remaining owner checklist

1. Complete canonical host task 1.2 in Vercel, then implement/approve the legacy-ID redirect map in 6.3(e).
2. Rotate the exposed Supabase credentials in task 1.5 and update every deployment/GitHub secret that uses them.
3. Register GA4 custom dimensions and confirm the sitemap in Google Search Console.
4. Verify the Resend sending domain and production lifecycle-email environment values.
5. Add the explicit AdSense slot ID if desired now.
6. Monitor Stripe webhook delivery/Radar and finish Stripe Tax setup; all eight lookup-key prices, `invoice.paid`, the win-back coupon, and managed portal are configured.
