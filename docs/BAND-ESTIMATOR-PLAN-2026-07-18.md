# Band Estimator (Mini-Diagnostic) — Implementation Plan — 2026-07-18

**Goal:** a free, anonymous, 12–15 minute mini-diagnostic at `/band-estimator` that measures Reading & Listening from real bank questions, honestly estimates Writing & Speaking from self-assessment, and turns its results screen into the site's best bridge into the paid AI-scoring product.

**Strategy (from [MONETIZATION-AUDIT-2026-07-18.md](MONETIZATION-AUDIT-2026-07-18.md)):** the tool's job is to *manufacture the question the paid product answers* — "what's my real Writing/Speaking band?" It must deliver genuine standalone value first (a defensible estimate + a study direction), because trust earned here is what converts later. No login wall, no gated results, no fake precision.

**Dependencies / sequencing:** ships standalone, but two Action-Plan items multiply its value and should land first or alongside: QW1 (paid-conversion analytics event) and the free teased writing score (Action Plan "free-score restoration"). If the free score isn't live at launch, the Writing CTA points to the checker's current flow and the copy drops the word "free."

Sizing: **S** = hours, **M** = 1–2 days. Total ≈ 3–4 solo days.

---

## Phase 0 — Decisions (locked unless founder overrides)

- **Route:** `/band-estimator`. Title: "Free IELTS Band Estimator — 15-Minute Level Test". Targets "what is my IELTS band / IELTS level test online free / IELTS band estimator" — distinct intent from `/band-calculator` (raw-score conversion). The two pages cross-link and must not duplicate each other's content (no conversion tables on the estimator).
- **Test shape:** Reading = one passage, 2–3 whole question groups totaling **10 questions** (~7 min soft budget). Listening = one Part-1/2-style clip, whole groups totaling **10 questions** (~5–6 min). Writing & Speaking = 3-tap self-assessment each (~1 min). Whole groups only — group prompts/options and the `question.number` invariant stay intact.
- **Module framing:** estimator uses **Academic Reading** conversion, with one line noting GT differs and linking the calculator's GT table. (Offering both modules doubles curation for marginal v1 value.)
- **Anonymous, end to end.** Results always shown, never gated. Email capture and account save are optional extras on the results screen.
- **No ads on the estimator page** (consistent with existing exclusion of scoring/results surfaces; protects completion rate and AdSense hygiene).
- **No new tables, no new API routes, no LLM calls.** Client-side grading via the existing engine; telemetry via existing `track()`.
- **The anon free-submit gate does not apply here:** the estimator does NOT mount `QuestionEngine` (where the gate lives) and must NOT call `recordFreeSubmit`/`canUseFreeSubmit` (`src/lib/freeAttempts.js:28-34`) — a visitor's estimator run must never consume their one free practice submit per skill.

---

## Phase 1 — Content curation + config

### 1.1 Curate the fixed question sets (S/M)
- **What:** Pick the Reading passage + Listening item and the specific whole groups. Selection criteria: mixed question types (at least one boolean-family, one select/matching, one text-completion across the two sections — all render via `TYPE_CONFIG`, `src/components/question/grade.js:17-36`); mid difficulty; no `visual`-input groups (diagram/map/form) in v1; clean audio ≤4 min for the listening clip; prefer items NOT already featured on hub/landing pages (they're public regardless — answer keys are world-readable by design — but avoid the most-trafficked ones).
- **How:** small one-off script `scripts/content/pick-estimator-set.mjs` that lists candidate passages with group/type/count breakdowns from Supabase (read-only, anon key), founder picks from its output. Discrimination data (per-question correct rates from `attempts.per_question`) can refine the set later — v1 is editorial choice.
- **Where:** new script; output = the config in 1.2.
- **Done when:** exactly 10+10 questions chosen, types mixed per criteria, listening audio verified playable.

### 1.2 Estimator config module (S)
- **What:** `lib/estimatorConfig.js` exporting `{ reading: { slug, groupIds|groupIndexes }, listening: { slug, groupIds }, version: 'v1-2026-07' }` plus the Writing/Speaking self-assessment definitions: 3 questions per skill, each option mapping to points; total points → band **range** via an explicit lookup (e.g. `{min:5.0,max:6.0}`) with a deliberate ~1.0-band width. Also `SELF_ASSESSMENT_DISCLAIMER` copy string (reused on results + FAQ).
- **Why config-not-DB:** SSG-cacheable, versionable (stamp `version` on every analytics event so sets can rotate quarterly without corrupting comparisons).
- **Self-assessment questions (draft, founder may reword):**
  - Writing: essay-length stamina (250 words in 40 min: comfortably / with effort / can't yet), feedback history (had writing corrected by a teacher: often / sometimes / never), complex-sentence confidence.
  - Speaking: fluency under pressure (2 min on an unfamiliar topic: comfortably / with pauses / freeze), pause-to-translate frequency, past speaking-test or interview experience in English.
- **Done when:** config imported by the page; unit test asserts every self-assessment point total maps to a range and ranges are ≤1.0 wide.

### 1.3 getStaticProps wiring (S)
- **What:** in `pages/band-estimator.js`, `getStaticProps` calls `getStructuredPassage('reading', slug)` and `getStructuredPassage('listening', slug)` (`lib/supabase.js:373`), filters to the configured groups, and passes `{ readingGroups, listeningAudioUrl, listeningGroups }`. `revalidate: 3600` like question pages. Filter must preserve each group's own question numbering as delivered (grading is keyed by `question.number` — do not renumber).
- **Done when:** build succeeds; page props contain exactly the configured groups; no service-role usage.

---

## Phase 2 — The estimator flow (M)

### 2.1 Lightweight runner component (M)
- **What:** `src/components/estimator/EstimatorRunner.jsx` — a thin stepper that reuses **`QuestionItem`** (`src/components/question/QuestionItem.jsx:44`) for rendering/inputs and **`gradeAll`** (`grade.js:163`) for scoring, WITHOUT `QuestionEngine` (no timer persistence, no attempts writes, no free-submit gate, no results-review UI). Local state: `{ step, answers, startedAt }`.
- **Steps:** intro → reading (groups + soft 7:00 countdown, non-blocking — hitting 0 shows "time's up in the real test" nudge, never auto-submits) → listening (existing `AudioPlayer` component, play once encouraged but not enforced) → writing self-assessment → speaking self-assessment → results.
- **Progress bar** ("Step 2 of 5 · Listening") and a **"Skip this section"** affordance per measured section: skipped section renders its result as "Not measured — practice {skill} to find out" (protects completion rate; the skip itself is a data point).
- **Persistence:** answers + step in `localStorage['ielts-estimator:v1']` (debounced, same pattern as question-page resume), cleared on completion; final result stored in `localStorage['ielts-estimator-result']` `{bands, overall, target, version, completedAt}` so a returning visitor sees "Your last estimate: 6.0 overall on {date}" with a retake link.
- **Done when:** full run works anonymous on mobile 375px (respect the existing dvh/safe-area conventions); refresh mid-run resumes; no `attempts` rows, no free-submit consumption.

### 2.2 Scoring (S)
- **What:** `src/components/estimator/score.js` — pure functions, unit-tested:
  - `sectionBand(groups, answers, skill)` → `gradeAll` raw score → **`estimateBand(score, total, skill, 'academic')`** (`grade.js:182`, already scales any total to the /40 curves in `lib/bandTables.js`).
  - `selfAssessBand(answers, skillConfig)` → `{min, max}` range.
  - `overall(bands)` → mean of the four midpoints → official rounding rule — reuse the calculator's `overallBand` helper (imported at `pages/band-calculator.js:16`; extract to `lib/bandTables.js` if it lives in the page).
  - 10 questions ⇒ coarse bands; display R/L as "~6.5" with a "based on 10 questions" caption. Never show decimals beyond .5.
- **Done when:** vitest cases cover: all-correct, all-wrong, skip-one-section (overall from 3 skills, labeled), range math, rounding rule (6.25→6.5, 6.75→7.0).

---

## Phase 3 — Results screen = the monetization surface (M)

Order matters; value first, asks second.

### 3.1 Value block (S)
1. **Overall band hero** (reuse the band-hero visual language from `ScoreUI.jsx`) + one-line honest caption: "Estimated from 20 real test questions + your self-assessment. Not an official score."
2. **Per-skill cards:** Reading/Listening = measured point estimates with raw score ("7/10 correct"); Writing/Speaking = range bars ("likely 5.5–6.5") visually distinct (hatched/outlined, labeled "self-assessed") — the uncertainty styling is deliberate and must not look as authoritative as the measured cards.
3. **Target-band gap:** selector "What band do you need?" (reuse onboarding options, `SignInDialog.jsx:45`; default 7.0; prefill from `localStorage` prefs if present) → "You're ~1.0 band away. Biggest gap: Writing."
4. **One next-step per skill:** weakest measured skill → its hub/practice link; each card links onward (internal-linking win).

### 3.2 Conversion block (S/M)
- **Writing card CTA (primary):** "Self-ratings run about half a band optimistic. Get your real Writing band →" → `/ielts-writing-checker` (with the free first score once Action Plan item ships; until then copy says "AI Writing Checker — Premium"). Fire `estimator_cta_click{destination:'writing_checker'}`.
- **Speaking card CTA:** "Meet the AI examiner" → `/speaking-examiner`.
- **Mock-test CTA** under the overall hero: "Confirm this with a full 40-question mock" → `/mock-test`.
- **Account save (signed-out):** "Save this as your baseline — free account" → existing `SignInDialog` with `trigger='estimator_save'`; on sign-in, write one `attempts`-style baseline record OR (v1, simpler) keep it in localStorage and let the dashboard read `ielts-estimator-result` as a "Baseline estimate" card. Decide v1 = localStorage + dashboard card (S); DB persistence is a fast-follow.
- **Email capture (optional, last):** "Email me my results + a 4-week study plan" → existing `NewsletterSignup` with `source='band-estimator'`. NOTE: per the audit, no send pipeline exists yet — until Email v1 ships, the copy must promise only the newsletter ("practice tips weekly"), not a results email we can't send.
- **Done when:** every CTA fires a tracked event; no CTA blocks seeing results; premium users see practice CTAs but no upsell copy.

### 3.3 Dashboard hook (S)
- **What:** `pages/dashboard.js` Overview: if `ielts-estimator-result` exists (or user has a saved baseline), show "Baseline: {overall} on {date} — retake to track improvement"; if the user has no Writing/Speaking scores, the empty-trend nudge links to the estimator result's Writing CTA instead of the current dead-end copy (fixes audit finding §2.4/EmptyNudge).
- **Done when:** free user with an estimator run sees the baseline card.

---

## Phase 4 — Analytics (S)

All via `track()` (`src/lib/analytics.js:63`) so GA4 + `activity_events` + source attribution come free. Params everywhere: `{version, signed_in}`.

| Event | When | Params |
|---|---|---|
| `estimator_start` | intro CTA click | — |
| `estimator_section_complete` | each section | `skill, score, total, band` (or `skipped:true`) |
| `estimator_complete` | results rendered | `overall_band, reading_band, listening_band, writing_min/max, speaking_min/max, duration_seconds, sections_skipped` |
| `estimator_cta_click` | any results CTA | `destination` (writing_checker / speaking_examiner / mock_test / practice_{skill} / save_account / newsletter) |
| `estimator_retake` | retake click | — |

Funnel questions this must answer (weekly): start→complete rate (target ≥55%), complete→any-CTA rate, complete→`signup_verified{trigger:'estimator_save'}`, and — once QW1 ships — estimator-sourced `subscription_activated` (join `activity_events` anon_id/user_id paths).

**Done when:** full event chain visible in `activity_events` for one anonymous test run.

---

## Phase 5 — SEO + site integration (S/M)

- **On-page content (thin-page defense, per MONETIZATION.md §6.3):** below the tool, ~600 words of unique editorial: how the estimate works, what each band means (link band-descriptor blog posts), why Writing/Speaking are self-assessed and how to get them measured, FAQ (4–6 Qs) with `FAQPage` JSON-LD (reuse the `SectionLanding` FAQ pattern). Disclaimer: estimate ≠ official score; IELTS non-affiliation line.
- **Cross-links:** `/band-calculator` ↔ `/band-estimator` ("know your raw scores already?" / "haven't taken a test yet?"); footer Tools group; navbar under the same grouping as the calculator (don't crowd the top nav — footer + hubs + homepage are enough if nav is tight).
- **Homepage:** add the estimator as the "don't know where to start?" entry point near the hero ("Not sure of your level? Take the 15-minute estimator") — this also gives the homepage a second job beyond "Start practicing" (audit §2.1).
- **Sitemap:** add route to `pages/sitemap.xml.js` static list.
- **Blog:** one launch post ("How to estimate your IELTS band before booking the test") linking the tool; add the estimator to the blog generator's linkable-pages list (`scripts/content/generate-blog-post.mjs:25`) alongside the "never call paid features free" fix from the Action Plan.
- **OG card:** reuse `/api/og` with a `type=estimator` label so shared results links look intentional. (Sharing actual band results images = fast-follow, not v1.)
- **Done when:** page indexed-ready (canonical www, in sitemap, FAQ schema validates), zero conversion-table content duplicated from the calculator.

---

## Phase 6 — QA + launch gates (S)

1. `npm run lint`, `npm test` (new score.js + config tests), `npm run build`.
2. Mobile 375px full run (soft timer, audio, self-assessment taps, results) + keyboard-only pass on inputs (QuestionItem already carries the a11y work).
3. Verify: no `attempts` insert, no `recordFreeSubmit` call, no ad units mounted, anonymous run leaves only `activity_events` rows.
4. Live smoke after deploy: complete a run in production incognito; confirm event chain + Vercel/GA capture; confirm the reading/listening content renders from ISR without service-role env.
5. Rollback posture: page is additive — worst case, remove from sitemap/nav; no schema or API changes to revert.

---

## Measurement of success (30 days post-launch)

| Metric | Target | Source |
|---|---|---|
| Estimator starts / week | baseline — watch SEO ramp | `estimator_start` |
| Start → complete | ≥55% | section events |
| Complete → CTA click | ≥35% | `estimator_cta_click` |
| Complete → signup (trigger=estimator_save or subsequent) | ≥8% | `signup_verified` + stitching |
| Estimator-touched users → checkout_start | report only (needs QW1 for paid) | activity_events join |

If start→complete is <40%, first suspects: listening audio length, section skip affordance not visible, mobile timer anxiety — fix before touching the conversion block.

## Explicit non-goals (v1)
- No AI-scored writing/speaking inside the estimator (that's the checker/examiner's job — the estimator only creates the appetite).
- No results email until Email v1 exists (don't repeat the newsletter's broken promise).
- No GT module toggle, no question randomization, no per-question review screen (it's a diagnostic, not a lesson — review lives on practice pages; also keeps answer leakage of the fixed set low-value).
- No new DB tables. Baseline persistence beyond localStorage is a fast-follow only if the dashboard card proves used.
