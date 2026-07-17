# IELTS-Bank Full Audit & Action Plan — July 16, 2026

Audit scope: content, UX/design, tracking, monetization, architecture/tech-debt. Sources: four
parallel code audits over this repo + live Supabase DB, plus a hands-on review of the production
site (desktop + mobile) at https://www.ielts-bank.com.

This document is written to be executed task-by-task by a coding agent (Codex). Each task states
WHAT, WHY, WHERE (files), and DONE-WHEN (acceptance criteria). Work phases in order; within a
phase, tasks are ordered by priority. Do not start Phase N+1 items before Phase N's P0s are done.

## EXECUTION DIRECTIVE — do not stop until the plan is complete

The goal is COMPLETION OF THIS ENTIRE PLAN. Work through it continuously and autonomously:

- **Do not stop, pause, or ask for permission between tasks or phases.** Finish a task, verify its
  DONE-WHEN criteria, and move straight to the next one.
- **Do not stop for decisions you can make yourself.** Where the plan leaves an implementation
  choice open, pick the sensible default, note it in the commit message, and keep going.
- **Blocked on one task? Skip it, log it, continue.** Never let one blocked task halt the plan.
  Keep a running `PROGRESS.md` next to this file: tasks completed, decisions made, tasks skipped
  and why.
- **The ONLY valid reasons to stop and ask Seleem** are things genuinely impossible without him:
  items already listed as human-only (1.2 canonical flip, 1.5 key rotation, GA4 console setup,
  ESP choice, Paddle account, Search Console), missing credentials/env vars, a required paid
  account or dashboard action, or a destructive/irreversible step not covered by this plan. Even
  then: ask, and while waiting, continue with every other task that isn't blocked by the answer.
- **Verify as you go** — `npm run build` after every task, plus each task's DONE-WHEN check. A
  task is not complete until verified.

---

## Executive summary

The product foundation is genuinely strong: 426 passages / 2,415 questions across all four skills,
AI writing+speaking scoring, accounts, dashboard, SSG/ISR SEO, daily blog cron. The audit found no
existential problems, but four themes recur:

1. **Trust leaks** — a false homepage claim (model answers don't exist), canonical URLs that
   redirect, stale copy that omits Speaking.
2. **Learning value stops at "Correct answer: X"** — explanations are already authored in the
   content files but thrown away at import; listening transcripts are fetched but never rendered.
3. **We are flying blind** — 3 GA4 events total, no user-id stitching, anonymous usage (the vast
   majority) never touches the server, zero instrumentation on the two best SEO pages.
4. **Monetization is provisioned but unwired** — `user_quotas` table exists unused, 429s are dead
   ends, no premium waitlist, and the scoring API has a real auth/origin hole that lets anyone
   burn the daily OpenAI budget.

---

## Phase 1 — Critical fixes (security, SEO, trust) — do first

### 1.1 Fix scoring-API origin bypass + unauthenticated scoring (P0, S)
- **What:** In `pages/api/score/writing.js`, `pages/api/score/speaking.js`, `pages/api/contact.js`,
  `pages/api/newsletter/subscribe.js`:
  - Replace `candidate.startsWith(allowed)` origin checks (writing.js:155, speaking.js:236) with
    exact match: `candidate === allowed`.
  - Remove `http://localhost:3000` / `:3025` from the production allow-list — gate them on
    `process.env.NODE_ENV !== 'production'`. Add port 3005 for dev (matches `.claude/launch.json`).
  - Prefer `x-vercel-forwarded-for` / `x-real-ip` over first-hop `x-forwarded-for` in `clientIp()`.
  - Require a valid Supabase bearer token in the writing scorer (the client UI already forces
    sign-in at `pages/ielts-writing-checker.js:367` and the FAQ promises it; the server must match).
  - Make the GLOBAL rate-limit bucket fail **closed** on RPC error (keep per-IP fail-open):
    `withinLimit()` at writing.js:68-71, speaking.js:90-94.
- **Why:** `Origin: https://ielts-bank.com.evil.com` currently passes; anonymous curl can exhaust
  the 500/day global scoring budget, DoS-ing the feature and burning OpenAI spend.
- **Done when:** curl with spoofed origin gets 403; unauthenticated POST to /api/score/writing gets
  401; existing signed-in flow still scores end-to-end.

### 1.2 Resolve www vs non-www canonical split-brain (P0, S) — OWNER TASK, not for Codex
- **What:** Site serves on `www.` (apex 307→www) but ALL 459 sitemap URLs and every canonical tag
  say `https://ielts-bank.com`. Pick ONE host. Recommended: make apex primary in Vercel domain
  settings (www → 308 → apex) since all canonicals/sitemap/OG/schema already use apex. If Vercel
  settings can't be changed from code, flip the site origin constant to `https://www.ielts-bank.com`
  everywhere instead (sitemap.xml.js, SEO components, robots, OG URLs).
- **Why:** Google is told the canonical is a URL that redirects — classic indexing dilution.
- **Done when:** `curl -sI` on both hosts shows exactly one 200 host and one permanent redirect,
  and that 200 host matches canonicals + sitemap `<loc>` values.
- **Note:** Seleem is handling this one personally (Vercel domain settings). Codex: skip, but do
  not undertake 6.3(e) legacy-URL redirects until it's resolved.

### 1.3 Remove the false "model answers" claim (P0, S — until Phase 4 ships the real feature)
- **What:** `src/pages/HomePage.js` (~lines 63, 97-98) and `src/components/Footer.js` (~line 69)
  claim "Every Writing task ships with a high-band sample answer." No model answers exist anywhere
  in schema or data. Reword to what's true today (e.g. "instant AI band feedback on your essays").
- **Why:** A checkable false claim on the homepage of a trust-sensitive product.
- **Done when:** No copy anywhere promises model answers until they exist (Phase 4.2 restores it).

### 1.4 Fix stale sitewide copy that omits Speaking (P1, S)
- **What:** Hero (`src/pages/HomePage.js`), dashboard signed-out empty state (`pages/dashboard.js`
  area: "Track your band scores across Reading, Listening and Writing"), footer description
  (`src/components/Footer.js`), and `<title>`/meta descriptions ("Reading, Writing, Listening")
  — all predate Speaking launch. Also: reading hub header says "156 questions" but the rows are
  passages — change label to "passages"; verify homepage stat counters against live DB counts
  (426 passages / 2,415 questions) and make them dynamic if hardcoded.
- **Done when:** grep for "Reading, Writing and Listening"/"Reading, Listening and Writing" returns
  nothing; all four skills named consistently; stats accurate.
- Also add an inline "Sign in" button to the dashboard signed-out card (it currently tells users to
  find the navbar button).

### 1.5 Rotate exposed credentials (P0, human task — flag for Seleem, not Codex)
- Supabase service_role key + DB password were shared via chat in July and are still not rotated.

---

## Phase 2 — Learning experience (the product's core value)

### 2.1 Answer explanations from existing `evidence` data (P0, M — cheapest big win)
- **What:** Content files already author per-question `evidence` quotes
  (`scripts/content/data/rd*.json`, ~940+ questions) but imports drop them.
  - Migration: `alter table answer_keys add column explanation text` (or `explanation_html`).
  - Update `scripts/content/import-rd*.mjs` (and other import lanes) to write it.
  - Backfill by re-running imports (they're idempotent upserts).
  - Render post-submit in `src/components/question/QuestionItem.jsx` (~lines 276-292) under the
    "Correct answer" block, sanitized via `lib/sanitize.js`.
- **Why:** Review currently teaches nothing beyond the letter of the right answer; competitors'
  explanations are their stickiest feature. The content is already written.
- **Done when:** Submitting a reading attempt shows a "Why" line quoting passage evidence for every
  question that has one.

### 2.2 Render listening transcripts post-submit (P0, S — 20-line win)
- **What:** `transcriptHtml` is already shaped and shipped in props (`lib/supabase.js:352`) but
  `src/pages/ListeningQuestion.js` never renders it. Add a collapsible "Show transcript" section
  that appears ONLY after submission, sanitized.
- **Why:** Standard on every competitor; also a large indexable-text SEO asset. (Keep it
  post-submit-only in the DOM to avoid handing answers out pre-submit.)
- **Done when:** 45/46 listening pages show a transcript accordion after submitting.

### 2.3 Save & resume in-progress attempts (P1, S)
- **What:** Answers live only in React state (`src/components/question/QuestionEngine.jsx:113`);
  refresh loses everything. Debounce-write `ielts-inprogress:<skill>:<slug>` = `{answers, deadline}`
  to localStorage on every change, hydrate on mount, clear on submit. Copy the existing
  writing-draft pattern (`src/pages/WritingQuestion.js:207-230`).
- **Done when:** Mid-passage refresh restores all selected answers and remaining time.

### 2.4 Real timed mode with auto-submit (P1, M)
- **What:** The reading timer (`src/pages/ReadingQuestion.js:13-23`) is cosmetic — hits 0 and does
  nothing, keeps ticking after submit. Lift the timer into `QuestionEngine` (prop
  `durationSeconds`; 20min reading default, audio-length+10min listening), persist deadline in
  localStorage (pairs with 2.3), auto-submit at 0, stop on submit, `aria-live` warnings at 5min/1min,
  and an "untimed practice" toggle.
- **Done when:** Timer auto-submits at zero, stops at submission, survives refresh.

### 2.5 Question navigation palette + flag-for-review (P2, S/M)
- **What:** Sticky strip of numbered chips in `QuestionEngine` (answered/unanswered/flagged
  colors), click scrolls to the question anchor; add flag toggle in `QuestionItem` header.
- **Done when:** 13-question passages navigable without scrolling hunt.

### 2.6 Next-passage / related links on all question pages (P1, S)
- **What:** All four question components are dead ends for users and crawlers. In each page's
  `getStaticProps`, fetch 3 same-skill (prefer same question-type) items and render a "Keep
  practising" block after results + at page bottom. Also add a post-results cross-sell: reading/
  listening results → "Now get your Writing scored" link to `/ielts-writing-checker` (see 5.4).
- **Done when:** Every question page links to ≥3 related items; results view links onward.

### 2.7 A11y fixes in question components (P1, S)
- **What:** `QuestionItem.jsx` text `Input` (~221-234) and `Select` (~197-218) have no label —
  add `aria-label={question.promptText}`. TFNG buttons get `aria-pressed`. Move focus to the
  results summary on submit + `aria-live="polite"` announcement. Unify the two Modal
  implementations (WritingQuestion.js:49 lacks role/Escape/focus-trap; SpeakingQuestion.js:494 has
  role+Escape) into one accessible component with a focus trap.
- **Done when:** Keyboard-only + screen-reader pass on one page per skill.

### 2.8 Full mock test mode (P2, L — flagship differentiator)
- **What:** `mock_tests` + `mock_test_sections` tables (migration 0003) and `attempts.mock_test_id`
  exist, all empty/unused. Seed 3 reading mocks (3 passages, 60min) + 2 listening mocks (4 parts)
  from existing content via a script in `scripts/content/`; new route `pages/mock/[slug].js`
  chaining passages through one QuestionEngine session with shared timer; sum raw score /40 and map
  via the seeded-but-unused `band_tables` (replace hardcoded `estimateBand` percentages in
  `src/components/question/grade.js` with real table lookup). Add `/mock-test` index page + sitemap
  + navbar. "Free IELTS mock test" is a top-volume keyword.
- **Done when:** A user can sit a full timed reading mock and get a band from `band_tables`.

---

## Phase 3 — Tracking & analytics (build the eyes)

### 3.1 Analytics helper + enriched core events (P0, S)
- **What:** Create `src/lib/analytics.js` exporting `track(event, params)` (wraps `window.gtag`,
  no-ops server-side). Migrate the only 3 existing events (QuestionEngine.jsx:156, 
  WritingQuestion.js:240, SpeakingQuestion.js:799) off legacy category/label params.
  Event taxonomy (params in parentheses; `skill`, `slug`, `signed_in` on everything):
  - `question_open` (question_type) — question page mount
  - `attempt_start` — first answer interaction (ref-guarded), record startedAt
  - `attempt_submit` (score, total, score_pct, band, duration_seconds, answered_count)
  - `writing_submit` (task, word_count) — AFTER validation, not before
  - `ai_score_result` (outcome: ok|rate_limited|error, band) — writing, speaking, AND checker
  - `speaking_record_complete` (part, duration_seconds)
  - `signin_gate_shown` (trigger), `login_start`, `login` (auth funnel)
  - `newsletter_subscribe` (source), `contact_submit`
  - `band_calculator_use` (skill, raw_score, band; debounced)
  - `audio_play` / `audio_complete` (listening)
- **Where:** files listed per event above plus `src/components/auth/SignInDialog.jsx:58`,
  `pages/auth/callback.js:35`, `src/components/NewsletterSignup.jsx:46`,
  `pages/band-calculator.js`, `pages/ielts-writing-checker.js` (currently ZERO events).
- **Done when:** GA4 DebugView shows the full funnel on a test run of each skill; `ai_score_result`
  with `outcome=rate_limited` visible.

### 3.2 GA4 user-id stitching + SPA pageviews (P0, S)
- **What:** In `src/lib/auth.js` `onAuthStateChange` (~line 70): `gtag('set', {user_id})` on
  SIGNED_IN, clear on sign-out. Add a `routeChangeComplete` → `page_view` handler in
  `pages/_app.js` (and disable `send_page_view` double-fire accordingly).
- **Done when:** GA4 shows user-id coverage; client-side navigations produce page_views.

### 3.3 Server-side attempt telemetry (P1, M)
- **What:** Migration: add `attempts.total int` and `attempts.per_question jsonb`; populate
  `attempts.started_at` (column exists, never written). QuestionEngine already computes
  `perQuestion` locally (QuestionEngine.jsx:27-35) — thread it through
  `src/lib/progress.js:85-112` and the score API persist paths.
- **Why:** Unlocks time-on-task, abandonment, and per-question-type weakness analysis (Phase 4/5
  features depend on it).
- **Done when:** New signed-in attempts carry started_at, total, per_question.

### 3.4 Anonymous server-side telemetry (P2, M)
- **What:** `activity_events` table (anon_id text, user_id nullable, event, skill, slug, props
  jsonb, created_at) + thin `POST /api/track` (service-role insert, IP rate-limited, pattern-copy
  `pages/api/newsletter/subscribe.js`). anon_id = UUID in localStorage; link to user_id at sign-in.
  Also log an anonymized row (band, task, word_count — NO essay) for anonymous writing scores in
  `pages/api/score/writing.js`.
- **Why:** Ad blockers kill ~30%+ of GA in this audience; anonymous users are the whole top of
  funnel and currently invisible.
- **Done when:** Funnel (question_open → attempt_start → attempt_submit) reconstructable from
  Supabase for anonymous users.

### 3.5 Dashboard uses the new data (P2, M)
- **What:** With 3.3 live: accuracy by question type, "Practice your mistakes" card (wrong answers,
  oldest first), per-criterion writing trend from `scores.criteria`, target-band gap (wire the
  never-used `users.target_band` with a set-target prompt), streak = distinct practice days.
- **Done when:** Dashboard shows weakness-by-type and a retry-mistakes entry point.

---

## Phase 4 — Content (depth where it converts, breadth where it ranks)

### 4.1 Six missing reading question-type hubs (P1, S)
- **What:** `lib/readingQuestionTypes.js` covers 7 of 13 types. Add guides for:
  sentence_completion, summary_completion, note_completion, table_completion,
  matching_sentence_endings, multiple_choice_multi. The `/reading/[type]` renderer + sitemap pick
  them up automatically.
- **Done when:** 13 hub pages live, each listing its passages.

### 4.2 Real model answers for Writing (P1, M) — restores the 1.3 claim honestly
- **What:** Generate one band-8/9 model answer + brief examiner-style rationale per writing task
  (144 tasks) via a `scripts/content/` pipeline (same generate→verify pattern as existing lanes);
  new column on `writing_details` (e.g. `model_answer_html`); render behind a "Show model answer"
  reveal on `src/pages/WritingQuestion.js`. Then reinstate the homepage/footer claim.
- **Why:** Highest-converting content type on competitor sites; currently falsely advertised.

### 4.3 SVG charts for the 41 chart-less Academic Task 1 tasks (P1, M)
- **What:** Only the wr2 lane (7 tasks) has inline SVG charts in `prompt_html`. Author SVGs for the
  rest (reuse wr2 pattern from `scripts/content/data/wr2-task1-academic.json`; sanitizer already
  allows SVG). Task 1 without a visual is not test-realistic.

### 4.4 Content hygiene batch (P2, S)
- **What:** (a) Backfill `module` on 31 legacy reading passages (academic/general); (b) import
  writing `difficulty` (wr2 files have it, `import-wr2.mjs` drops it; backfill others); (c) retire
  or rewrite the 4 thin legacy GT notice passages (<1,500 chars); (d) rewrite or 301 the 5 thin
  July-2025 blog posts (all <1,450 chars, one date-stale "2025" title).

### 4.5 Steer the daily blog cron toward gap clusters (P2, S)
- **What:** Update the cron prompt/topic list toward: individual listening question types,
  completion-family reading strategies, Speaking Part 1 samples, vocabulary topic lists,
  band-descriptor explainers per skill, score-requirements-by-country/university, cue-card model
  answers. Also: the cron writes `lib/posts.js` but publishing requires a deploy — decide
  auto-commit+push (currently posts sit undeployed until someone pushes). Longer term (16 posts
  now, unmergeable at 100+): move posts to MDX files or DB.

### 4.6 Rebalance generation lanes (P3, ongoing)
- **What:** New reading generation toward under-represented types (completion family + matching
  sentence endings + MC-multi = only 212/1,666 questions) and GT (18 GT vs 107 academic passages);
  more GT writing (only 17). Speaking model-answer audio via the existing TTS pipeline is a nice
  premium-content candidate later.

---

## Phase 5 — Monetization (Stage 2 now, Stage 3 scaffolding)

### 5.1 Wire per-user quotas into scoring (P0, M)
- **What:** `user_quotas` (ai_scores_remaining default 3, period_resets_at — migration 0004) is
  seeded by the auth trigger and used by NOTHING. New migration: `SECURITY DEFINER`
  `consume_ai_score(uid)` RPC (`FOR UPDATE` decrement + 30-day reset; premium bypass branch ready
  for 5.5). Call it after auth in writing + speaking routes; return HTTP 402 `{remaining: 0,
  resetsAt}` on exhaustion. Keep IP/global limits as abuse backstop. Split models:
  `SCORING_MODEL_FREE` (mini-class) vs `SCORING_MODEL_PAID` (gpt-5.1) — free tier currently runs
  the premium model at ~10x the planned COGS. Fix speaking.js reading `OPENAI_WRITING_MODEL`.
- **Done when:** 4th free scoring in a month returns 402; free tier scores on the cheap model.

### 5.2 Quota UI + paywall/waitlist modal (P0, M)
- **What:** Show "N of 3 free AI scores left this month" under submit buttons
  (`pages/ielts-writing-checker.js`, `src/pages/WritingQuestion.js`, `SpeakingQuestion.js`) — own
  `user_quotas` row is already RLS-readable. On 402/429 render a modal: benefits list + premium
  waitlist email capture (reuse `NewsletterSignup` with `source="premium-waitlist"` — the API +
  table already support source tags).
- **Why:** The 429 is currently a dead-end error string at the single highest-intent moment.
- **Done when:** Quota visible pre-submit; limit-hit shows waitlist modal; waitlist rows accrue.

### 5.3 Post-score CTA block (P0, S)
- **What:** After the band score renders in the checker (`ielts-writing-checker.js` ~line 543) and
  speaking results: "Score another draft (N left)" + waitlist teaser + link to `/writingquestion`.
  Currently the results card ends in a disclaimer.

### 5.4 Results-page cross-sell + newsletter coverage (P1, S)
- **What:** Extend `ResultsSummary` (`src/components/question/QuestionEngine.jsx:79-110`):
  "Reading band ~7.0 — now get your Writing scored by AI" + compact NewsletterSignup for
  signed-out users. Add NewsletterSignup to `/band-calculator` and homepage (both currently lack
  it). Pick an ESP or set up a simple send pipeline — the list currently accrues with no way to
  email it.

### 5.5 Billing scaffolding + Paddle + /pricing (P2, L — build when waitlist validates demand)
- **What:** Migration per `docs/MONETIZATION.md` §4.2: `users.plan/plan_status/plan_renews_at/
  paddle_customer_id/paddle_subscription_id` (service-role-write-only). `pages/api/webhooks/
  paddle.js` (signature verify, idempotent upsert). `/pricing` page (3 SKUs, hero 6-month, PPP via
  Paddle localized pricing), Paddle.js overlay with `users.id` in customData, premium bypass in the
  quota RPC, ad-free surfaces for premium. Navbar + paywall modal link to /pricing.
- **Gate:** Ship after waitlist signals demand (e.g. 100+ waitlist emails) or ~50k visits/mo.

### 5.6 Ad placement strategy (P2, S/M)
- **What:** Currently auto-ads only, zero placement control. Add explicit in-content units on blog
  posts and section landing pages; exclude ads from scoring/results/dashboard/auth surfaces (both
  for UX and future premium ad-free perk). Monitor AdSense for thin-page flags on templated pages.

---

## Phase 6 — Tech debt & hardening

### 6.1 Dependency + dead-code purge (P1, S)
- **What:** Remove from `package.json`: `@chakra-ui/react`, `@chakra-ui/icons`, `@emotion/react`,
  `@emotion/styled`, `framer-motion`, `firebase`, `web-vitals`, `@testing-library/*` (zero runtime
  imports remain; firebase only used by the finished one-shot migration script — note that in the
  script header before removing, or move script to its own package.json). Delete CRA corpses:
  `src/App.css`, `src/App.test.js`, `src/index.css`, `src/logo.svg`, `src/reportWebVitals.js`,
  `src/setupTests.js`, `src/components/Navbar.css`, `src/components/Toggle.js`,
  `src/components/ShareButton.js` (duplicate of inline one). Fix stale preflight comment in
  `src/styles/globals.css:9-12`; remove vestigial `.tw-root` wrapper + class usages. Dynamic-import
  `canvas-confetti`.
- **Done when:** `npm run build` passes; bundle unchanged or smaller; `npm install` visibly leaner.

### 6.2 Restore linting + first tests (P1, M)
- **What:** Replace CRA `eslintConfig` with `eslint-config-next`; remove
  `eslint.ignoreDuringBuilds` from `next.config.js:136` once clean. Add vitest + tests for
  `src/components/question/grade.js` (275 lines of grading logic incl. spelling canonicalisation —
  highest regression risk; `__fixtures__` dir already exists), `src/components/dashboard/utils.js`,
  `lib/sanitize.js`.

### 6.3 CSP enforcement + operational hygiene (P2, S/M)
- **What:** (a) CSP is still Report-Only (`next.config.js:131`) with NO report endpoint — add
  `report-to` (or a simple `/api/csp-report`), watch a week, flip to enforced. (b) `rate_limits`
  rows never purged — cleanup cron/RPC. (c) `speaking-uploads` recordings are never deleted —
  unbounded storage + privacy liability; delete post-scoring or add 30-day lifecycle. (d) Escape
  `<` as `<` in JSON-LD `JSON.stringify` blocks. (e) Slug-based URLs for the 31 legacy
  space-in-ID passages (`/readingquestion/Advantages%20of%20Public%20Transport`) with 301s from
  legacy IDs — do this AFTER 1.2 so redirects chain once at most.

### 6.4 Listening/speaking audio UX polish (P3, S)
- **What:** `preload="metadata"` + loading indicator on listening audio; loading state for
  examiner-audio taps in SpeakingQuestion (first tap currently has invisible latency).

---

## Suggested execution order (sprint-sized chunks)

| Sprint | Tasks | Theme |
|---|---|---|
| 1 | 1.1, 1.3, 1.4, 3.1, 3.2 | Stop the bleeding: security, trust, eyes on |
| 2 | 2.1, 2.2, 2.6, 5.3 | Learning value + first conversion CTAs |
| 3 | 2.3, 2.4, 2.7, 3.3, 5.1, 5.2 | Practice UX + quotas/waitlist |
| 4 | 4.1, 4.2, 4.3, 5.4, 6.1, 6.2 | Content depth + hygiene |
| 5 | 2.5, 2.8, 3.4, 3.5, 4.4, 4.5 | Mock tests, dashboards, anonymous telemetry |
| 6 | 5.5 (if validated), 5.6, 6.3, 6.4, 4.6 | Monetization build-out + hardening |

Human-only items (not for Codex): 1.2 www/apex canonical resolution (Vercel domain settings);
1.5 key rotation; GA4 console custom-dimension registration (names in 3.1); ESP choice in 5.4;
Paddle account setup for 5.5; confirm sitemap in Google Search Console.
