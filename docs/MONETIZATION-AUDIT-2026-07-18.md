# ielts-bank.com — Monetization Audit — 2026-07-18

**Auditor stance:** skeptical outside consultant. Every claim cites `file:line`, a live-site observation (browser walkthrough of https://www.ielts-bank.com on 2026-07-18, anonymous/incognito context), a competitor URL, or a named analytics event. Where something could not be verified it is marked **UNVERIFIED**.

**Method:** four parallel code sweeps (billing, gating/leakage, analytics, copy/retention), a live competitor pricing scan (17 products checked, 14 reachable), and a hands-on anonymous walkthrough of the production funnel (reading attempt → second-attempt gate → writing checker → paywall → /pricing → examiner and mock gates). Account creation and checkout were not completed live; post-signup behavior is verified from code and marked as such.

---

## Executive summary — the 5 biggest reasons monetization is weak, ranked by revenue impact

**1. You amputated the demo, and the funnel now asks for money before delivering any value.**
On 2026-07-18 (`supabase/migrations/20260718120000_premium_only_ai_scoring.sql:2-9`) AI scoring became Premium-only with **zero** free scores. Your own blueprint's conversion logic — "A prospect must feel the quality of the rubric-anchored feedback before paying. The free score is the demo." (`docs/MONETIZATION.md:35-36`) and "Deliver value fast (instant first score) so disputes are rarer" (`docs/MONETIZATION.md:333`) — is now dead in production. Verified live: an anonymous user who pastes a 456-word essay into `/ielts-writing-checker` gets "Sign up to get your essay scored — AI Writing scoring is a Premium feature," never having seen the product work on *their* writing. Worse, after a free user signs up and submits, the app **silently hard-redirects** them to a generic `/pricing` page: `router.push('/pricing?upgrade=writing')` (`src/pages/WritingQuestion.js:251`, `pages/ielts-writing-checker.js:299`, `src/pages/SpeakingQuestion.js:818`) — and `pages/pricing.js:69` reads only `router.query.checkout`, so the `?upgrade=` context is thrown away. The single highest-intent moment in the product (essay written, account just created, score expected) lands on a page that doesn't acknowledge the essay exists. In a market where multiple competitors give 1–2 genuinely free evaluations (UpScore, ieltswritingchecker.com, IELTS-GPT, IELTS Mocks) and MockIELTS gives unlimited free checks, "pay to find out if we're any good" is the single largest conversion suppressor in the product.

**2. You cannot measure conversion, so you cannot fix it.**
The funnel is instrumented from landing to `checkout_start` (`pages/pricing.js:84`) and then goes dark. The Stripe webhook writes plan columns and nothing else — no GA4 event, no `activity_events` insert, no `premium_since` timestamp (`pages/api/webhooks/stripe.js:57-68`, `lib/billing.js:166-239`). The success page renders a banner and fires nothing (`pages/pricing.js:156-161`); the `session_id` Stripe appends to the success URL is never read. Consequence: checkout→paid rate, time-to-convert, MRR by source, and churn are **unknowable from any data you own**. You are about to make pricing and funnel decisions (this audit is proof) with no way to detect whether they work. The first-party analytics foundation underneath is genuinely good — first-touch attribution persisted and stamped onto `users` (`src/lib/analytics.js:32-61`, `pages/api/track.js:42-57`), anon→user stitching (`pages/api/track.js:93`), a daily report cron — which makes the unclosed final loop the highest-leverage half-day of engineering available.

**3. The offer shape doesn't match how IELTS students buy.**
IELTS demand is exam-date-shaped: a candidate has a booked test 2–12 weeks out, prepares intensely, then leaves forever. The competitor scan shows the market has converged on mechanisms for exactly this buyer, all absent here: **one-time/time-boxed SKUs** (ielts.international $29/8-week Exam Pass; IELTS Mocks $8/$20/$30 passes; Sprechify $129/$199 one-time; SmallTalk2Me ~$10/test; My Speaking Score credit packs), **money-back guarantees** (Writing9, ielts.international, Sprechify, OpenIELTS, IELTS Science — it is table stakes), and **exam-date framing** ("30-Day Intensive", retake-fee anchoring: "$250 to retake vs $29 here"). ielts-bank sells three auto-renewing subscriptions with no guarantee, no refund policy anywhere in the codebase (repo-wide grep; ToS has no billing section at all — `src/pages/TermsOfService.js`), and captures exam date only as an optional Settings field that drives nothing but a countdown label (`src/components/dashboard/AccountSettings.js:87`, `pages/dashboard.js:156`). The annual SKU also has an optics problem: $44.99/yr sits next to Writing9's $29.99/yr in any comparison shop.

**4. There is no trust layer in a category where calibration claims are the currency.**
The competitive differentiation battleground is "is this score real?": Sprechify claims ±0.3-band accuracy and ex-Cambridge examiners; IELTS Mocks claims calibration on examiner-graded samples; Writing9 claims 47,684 students and a score guarantee; SmallTalk2Me claims examiner-graded training data. ielts-bank's pricing page has **zero** social proof, zero testimonials, no accuracy statement, no guarantee, no FAQ, and no answer to "why not just paste my essay into ChatGPT?" at the point of purchase (full read of `pages/pricing.js:1-271`; confirmed live). The only ChatGPT-adjacent argument on the site ("running a real examiner-grade model on every essay is expensive") lives in the checker FAQ (`pages/ielts-writing-checker.js:182`) and actually argues *against* paying — it explains your costs, not the student's benefit. Meanwhile the market's consensus attack line — free ChatGPT over-scores IELTS essays by 0.5–1.0 bands, so students walk in expecting 7 and get 6 (e.g. https://www.englishaidol.com/en/blog/can-chatgpt-grade-ielts-writing-accuracy-tested, ERIC study EJ1457168) — is sitting unused. It is the single best sales argument available to this product and it appears nowhere.

**5. Acquisition and monetization are two different websites.**
The SEO machine sells "free" while the product now sells "paid," and nothing bridges them. Blog posts — the top of the funnel — still say "paste your essay into our free IELTS Writing Checker" (`lib/posts.js:38, 197`): a literal bait-and-switch since 2026-07-18, and the daily blog cron's prompt can keep minting the claim (`scripts/content/generate-blog-post.mjs:25`). The footer lists the Writing Checker under "FREE TOOLS" (live observation). The homepage has **zero** links to /pricing and its hero routes everyone to free Reading (`src/pages/HomePage.js:225, 430`). The dashboard Overview — the highest-frequency signed-in surface — has no premium teaser (the only upsell is buried in the Settings tab, `src/components/dashboard/AccountSettings.js:168-173`). The newsletter promises "one useful email a week," accrues subscribers into a table, and has no sending mechanism whatsoever (`pages/api/newsletter/subscribe.js`; only Resend usage is the contact form and the admin daily report). And PPP pricing — the mechanism meant to convert the majority of the audience — is invisible until Stripe Checkout (`pages/pricing.js:2-4`), while the PPP country list gives 55% off to the high-income GCC (SA, AE, QA, KW, BH, OM at `lib/billing.js:27`), a direct revenue leak in one of the highest-willingness-to-pay IELTS markets (UAE/Saudi expat candidates).

---

## Scorecard

| # | Section | Score | One-line justification |
|---|---|---:|---|
| 1 | What we monetize & why anyone would pay | **5/10** | Right paid unit (speaking examiner is genuinely differentiated; bundle price is strong) but no calibration claim, no ChatGPT answer, and the writing checker is a commoditized category. |
| 2 | Positioning & messaging | **3/10** | Homepage sells the free product; pricing page is a bare feature list; stale/false "free" claims sitewide; zero proof elements anywhere. |
| 3 | User journey | **3/10** | Paywall before value; silent context-free redirect at the highest-intent moment; good work-preservation copy and the reading→writing bridge are the bright spots. |
| 4 | Plans, pricing & packaging | **5/10** | Sane 3-SKU ladder with real server-side PPP — but subscription-only, no guarantee, GCC in the PPP list, USD-only display, weak annual optics. |
| 5 | Upsell surfaces & gate inventory | **4/10** | Gates exist, fire at sensible triggers, and are mostly tracked — but free is "same thing, zero times," and dashboard/homepage/blog/newsletter are unexploited. |
| 6 | Analytics & conversion feedback loop | **5/10** | Excellent first-party foundation (attribution, stitching, daily report) fatally undermined by no paid-conversion event — the one number that matters is unknowable. |
| 7 | Retention, expansion & churn | **2/10** | Zero lifecycle email of any kind, exam date unused, bare Stripe portal cancel, and the "Progress tracking" perk is free for everyone. |
| 8 | Leakage & enforcement | **7/10** | Server-side enforcement is genuinely solid (prior P0s verified fixed); dinged for the unmetered realtime-scoring endpoint, client-only mock gate, and no webhook reconciliation. |

---

## Section 1 — What we monetize & why anyone would pay

**The paid unit today:** unlimited-with-caps AI Writing scoring (2/day), AI Speaking scoring (1/day), 60 min/mo realtime AI examiner, all mock tests, ad-free (`pages/pricing.js:50-58`; enforcement `supabase/migrations/20260718120000:84`, `lib/billing.js:35-36`). Since 2026-07-18, this is also the *only* way to get any AI score at all.

### Findings

**1.1 (P0) There is no answer to "I'll just paste my essay into ChatGPT" anywhere in product or copy.**
Evidence: full copy sweep of homepage, /pricing, checker, examiner, gates (§2 agent report); the only cost-side argument is `pages/ielts-writing-checker.js:182`. The market's standard counter (ChatGPT over-scores 0.5–1.0 bands; Task Response blindspot; examiner-calibrated corpora) is documented and academically supported (englishaidol.com test, ERIC EJ1457168) and used by essentially every paid competitor. **User moment affected:** the decision point on /pricing and the checker landing — where a deadline-driven student silently compares you to a free tab they already have open.
**Judgment:** "rubric-anchored scoring" (`docs/MONETIZATION.md:8`) is an engineering claim, not a buyer claim. Until the product states *why its band is closer to the real one* — ideally with a calibration page and a number — it is a GPT wrapper at $9.99 competing with a free GPT.

**1.2 (P1) The value ladder is broken in the middle.**
Intended: free auto-scored R/L → free AI score sample → paid unlimited (`docs/MONETIZATION.md:52-99`). Actual: free auto-scored R/L → **hard paywall** → paid. The middle rung was removed by `20260718120000` without replacing its function (the demo). The reading→writing bridge exists and is well-placed ("Ready for the next skill? Get your IELTS Writing scored by AI" — live observation on the post-submit results panel, wired at `src/components/question/QuestionEngine.jsx`), but it now leads to a wall, not a taste. The homepage feature card even still describes the old model: "Premium unlocks AI Writing and Speaking scoring" is accurate, but the checker's own hero ("get an instant estimated band score", `pages/ielts-writing-checker.js:469`) and meta description (`:432`) promise the old free behavior.
**Judgment on the drift:** the cost-control instinct wasn't wrong (free scores on gpt-5.1 at ~2¢ with no cheap-model split — `SCORING_MODEL_FREE` is dead config, `lib/openaiChat.js:10`, `pages/api/score/writing.js:393`), but the fix chosen (zero free) solves a COGS problem by creating a much larger conversion problem. A single cheap-model free score with a teased result costs ~0.1–0.3¢ (`docs/MONETIZATION.md:413`) — the blueprint was right and the code overcorrected.

**1.3 Competitive position (web scan, 2026-07-18).**

| Competitor | Price(s) | Free allowance | Paid product | Key claim | Trust signals | Model |
|---|---|---|---|---|---|---|
| **Writing9** (writing9.com) | $7.99/wk · $14.99/mo · $29.99/yr | Demo preview (exact free count UNVERIFIED) | Unlimited essay checks, per-criterion feedback | "Band 7 or higher" in 7 days | 47,684 students; testimonials; **100% money-back score guarantee** | Sub only |
| **ielts.international** | **$29 one-time 8-wk Exam Pass** · $2.99/essay · subs from $4.99/mo | Diagnostic + ~1 essay/wk basic (partially UNVERIFIED) | AI essays + speaking sessions + R/L | "Stuck at Band 6.0? … move up fast"; tutor/retake cost anchoring | 30-day MBG; 140+ countries | **Both** |
| **Sprechify** (speaking) | $129 one-time 30-day · $24.99/mo · $199/yr · **explicit PPP** (INR/PKR/NGN/EGP…) | None (MBG instead) | Live voice AI tutor, mock exams | "Pay once. Score Band 7+." | **±0.3 band accuracy**; ex-Cambridge examiners; +1.2 bands median | **Both** |
| **SmallTalk2Me** (speaking) | ~$10/mo; ~$10/test (UNVERIFIED exact) | Free speaking mock w/ band | Full simulator + grading | "Best AI Simulator for IELTS Speaking" | Examiner-graded training data claim | Both |
| **UpScore.ai** | $9.99/mo | 1 free mock | Unlimited mocks, quote-level feedback | "Top Accuracy… official Band Descriptors" | Public accuracy documentation page | Sub |
| **OpenIELTS** | $19/mo · 7-day trial | 5 tests + 5 writing/mo | Unlimited + analytics | All-in-one prep | 30-day MBG | Sub |
| **IELTS Mocks** | $8/7d · $20/30d · $30/60d passes | First test each section w/ AI feedback, no card | 88 tests, unlimited retakes | "Calibrated on real examiner-graded samples" | 50,000+ candidates | Time-boxed passes |
| **IELTS Science** (VN) | ~$2.90–$11.70/mo local currency | Free basic W/S scoring | Unlimited detailed scoring | Free-first + teacher workflow | 30-day MBG | Sub |
| **ieltswritingchecker.com** | $4.99/mo · $38.99/yr · **$5/essay human review** | 1 full free evaluation | Unlimited + human expert add-on | Openly "Powered by GPT-5" | 10,000+ essays | Sub + per-use |
| **MockIELTS** | $0 (loss-leader) | **Unlimited free checks** | — | "Examiner-level feedback — 100% free" | 50,000+ students claim | Free |
| HiWriting / TrueScore | — | — | — | — | — | **Both apparently defunct** |

Where ielts-bank sits: $9.99/mo for writing + speaking + realtime examiner undercuts every speaking specialist and beats single-skill tools on breadth — the *price* is right. What it uniquely could claim but doesn't: the only product with a 400+ passage free content library **plus** a realtime 3-part speaking examiner at this price. What it conspicuously lacks vs. this table: any free evaluation, any guarantee, any one-time SKU, any accuracy claim, any user-count/testimonial. (P0 in aggregate — see §2, §4.)

---

## Section 2 — Positioning & messaging

**2.1 (P1) The homepage sells the free product and never mentions money.**
Live + code: hero badge "Trusted free IELTS practice", H1 "Master IELTS with real, auto-scored practice" (`src/pages/HomePage.js:210-215`); both hero CTAs and the final CTA route to `/readingquestion` or `/blog` (`:225, 236, 430`); zero links to /pricing on the entire page; the only Premium mention is one clause inside a feature card (`:130-132`). For an SEO-moat page this is defensible for the *top* of the page — but a visitor who would happily pay never learns paying is possible. **Moment affected:** every homepage visit (the second-highest-traffic page type after question pages).

**2.2 (P0) Stale and false "free" claims across the acquisition surface.**
- Blog: "get instant feedback … with the free AI writing checker" (`lib/posts.js:38`), "paste your essay into our free IELTS Writing Checker for an instant band estimate" (`lib/posts.js:197`). False since 2026-07-18.
- Footer: Writing Checker listed under "FREE TOOLS" (live observation, sitewide footer).
- Checker hero/meta promise an unconditional instant score (`pages/ielts-writing-checker.js:432, 469`).
- About page: premium "unlocks higher AI-feedback limits" (`src/pages/AboutUs.js:68-70`) — wrong model description.
- Blog generator can perpetuate all of this (`scripts/content/generate-blog-post.mjs:25` — no rule against "free", no /pricing awareness).
**Moment affected:** the SEO visitor's first paywall contact — they arrive believing "free," hit "Premium feature," and the trust damage lands exactly at the conversion moment. This is a trust-sensitive category (§7 of MONETIZATION.md itself says so).

**2.3 (P0) The pricing page has no proof, no risk-reversal, no objection handling.**
Full read `pages/pricing.js:1-271` + live: headline is good ("Get your band score up with unlimited AI feedback" — outcome-framed), but below it: no testimonials, no user counts, no accuracy claim, no money-back guarantee, no FAQ, no free-vs-premium comparison table, no sample report (the checker has a great one — `SAMPLE_FEEDBACK`, `pages/ielts-writing-checker.js:194-221` — that never appears here). The page asks for $29.99 on the strength of seven bullet points.

**2.4 (P1) Internal contradictions on the sell side.**
- "All practice content stays free, forever" (`pages/pricing.js:150`) directly above the perk "All full-length timed mock tests" (`:54`) — mocks are assembled from that same content and are hard-locked (`pages/mock/[slug].js:111`).
- "Stronger scoring model + priority processing" (`:56`) differentiates against nothing — everyone gets the paid model (`pages/api/score/writing.js:27, 393`; `SCORING_MODEL_FREE` unread).
- "Progress tracking across attempts" (`:55`) is sold as a perk but delivered free to every signed-in user (`pages/dashboard.js` — no premium gating anywhere in the dashboard).
- Dashboard `EmptyNudge` tells free users to "Complete one Reading, Listening, Writing, and Speaking activity to unlock meaningful comparisons" — impossible without Premium (`src/components/dashboard/` per copy sweep).

**2.5 (P2) "Premium" branding.** "IELTS Bank Premium" exists only in the pricing meta title (`pages/pricing.js:19`); everywhere else it's generic "Premium" with four different CTA verbs (Get/Upgrade to/Explore/See plans). "Premium" says nothing to a candidate; competitors name outcomes ("Exam Pass", "30-Day Intensive"). Also brandmark inconsistency "IELTS-Bank" vs "IELTS Bank" (P2), and email sender is still `onboarding@resend.dev` (`pages/api/contact.js:73`) — an unprofessional trust signal if any user-facing mail ever ships.

**2.6 Urgency/deadline exploitation: absent.** The only exam-timeline copy on the sell side is "matches a full IELTS study cycle" (`pages/pricing.js:37`) and the mock gate's "before test day" (`pages/mock/[slug].js:65-67`). Exam date is not asked at onboarding (`src/components/auth/SignInDialog.jsx:40-45` asks goal + target band only). For the most deadline-driven audience in edtech, nothing in the funnel knows or uses the deadline. (P1)

**2.7 Supabase auth email templates: UNAUDITED** — they live in the Supabase dashboard, not the repo. Founder should check they exist, use `{{ .Token }}` (per project memory this was a known pending action), and carry any brand voice at all.

---

## Section 3 — The user journey (walked live, 2026-07-18)

### Journey 1: Google → reading question → complete → next?
Walked: `/readingquestion/a-brief-history-of-money-1gvate`, answered 9/13, submitted.
- Post-submit panel: score "2/13 · 15%", "Estimated reading band ~3", answer review with "Why" evidence quotes (excellent learning value), then: **"Ready for the next skill? Get your IELTS Writing scored by AI"** + inline newsletter + 3 "Keep practising" related passages (live observation).
- **Verdict: the bridge exists and is correctly placed, but it is a single small text link** — no band-framing ("Reading ~6.5 — Writing is where most candidates lose 0.5"), no visual weight, and it leads to a page that will wall the user (§Journey 2). No sign-in prompt at the results moment for progress-saving (the strongest free-account hook available). Grade: C+. **Events:** `attempt_submit` ✓, bridge click UNMEASURED (no event on the cross-sell link).

### Journey 1b: the anonymous second-attempt gate
Attempted a second reading passage anonymously: answers accepted, but submit triggers modal **"Sign up free to submit this reading question — Your answers are safe… Reading and listening practice stays free."** (live; `src/components/question/QuestionEngine.jsx:562-564`, event `free_limit_gate` at `:313`).
- **Verdict: this gate is well-executed** (fires after sunk effort, zero-risk copy, auto-resumes submission after signup) — the best-designed gate in the product. Note it gates *scoring interaction*, not content — crawlability is intact (content in static HTML; verified by page source). Two caveats: (a) it's localStorage-soft (`src/lib/freeAttempts.js:10-14`) — fine, it costs nothing; (b) the homepage promise "Open any question and start practising without an account" (`HomePage.js:130`) is now only true for the *first* question per skill. (P2 copy honesty)

### Journey 2: anonymous → writing checker → essay → the moment after
Walked: pasted a 456-word essay, clicked "Sign in & check my writing."
- Result: modal "Sign up to get your essay scored — AI Writing scoring is a Premium feature. Create your account first — your draft is saved to it, so nothing you've written is lost." (live; `pages/ielts-writing-checker.js:750-751`).
- The draft-preservation copy is genuinely good. But **the user never sees anything scored**. The page's sample report (band 6.5 breakdown, `:194-221`) is the only taste and it's generic, not theirs.
- From code (not walked — account creation out of scope): after signup, the free user's submit fires `premium_gate{stage:'upgrade'}` then `paywall_redirect` and **silently navigates to `/pricing?upgrade=writing`** (`ielts-writing-checker.js:287-300`); pricing ignores the param (`pricing.js:69`). Their essay *is* saved to the account first (good), but nothing on /pricing says so.
- **Verdict: F for the moment after.** The blueprint's design (score → feel quality → meter → paywall) scored the essay first. The live design converts the product's peak-desire moment into a generic pricing visit with no acknowledgment of the work just submitted. This is the #1 finding of the audit (Exec summary #1). **Events:** `writing_submit` ✓ → `premium_gate` ✓ → `paywall_redirect` ✓ → `checkout_start` ✓ → **paid: UNMEASURED**.

### Journey 3: meter exhaustion → paywall → checkout
The free meter no longer exists, so "exhaustion" is instant (Journey 2). Continued: /pricing live.
- Merchandising is correct mechanically: 6-month hero visually anchored, "Most popular" badge, filled CTA, /mo equivalents (live screenshot; `pages/pricing.js:200-234`).
- Missing at the decision point: everything in finding 2.3. Also no localized price hint for PPP-market visitors — a student in Lagos or Karachi sees $29.99 and must *start checkout* to discover $14.99 (`pages/pricing.js:2-4`); most won't click. (P1)
- Anonymous "Get Premium" correctly opens sign-in first (`pricing.js:79-82`). OTP signup flow itself: **UNVERIFIED live** (not executed); code shows email+password + 6-digit OTP confirm + 2-question onboarding (`SignInDialog.jsx:404-532`).
- Checkout session creation verified in code: server-resolved price by geo, `client_reference_id`, promo codes on (`pages/api/billing/checkout.js:72-113`). Stopped before payment per scope.

### Journey 4: premium day 1 (from code)
After paying, the user lands back on `/pricing?checkout=success` → banner "Payment received — your Premium access is being activated. It can take a few seconds; refresh this page if it doesn't appear" (`pricing.js:156-161`).
- No welcome email (no email infra at all), no dedicated success page, no onboarding to the flagship examiner feature, no "score the essay you wrote" prompt — even though the essay that triggered the upgrade is saved. The speaking flow alone has a recovery banner ("Your earlier recording is saved… Score my saved recording", `SpeakingQuestion.js:1048-1056`) — the writing flow has nothing equivalent on return. (P1)
- Day-1 delta: scoring works, mocks unlock, ads disappear, examiner minutes appear (`speaking-examiner.js:605-612`). Premium is real, but nobody tells the user what to do first. **Activation moment: absent.**

### The funnel, with measurement status

```
  SEO landing (question page / blog)
      │  page_view ✓ (GA4 + activity_events)   attribution captured ✓ (first-touch, localStorage→users)
      ▼
  Free practice attempt
      │  question_open ✓ · attempt_start ✓ · attempt_submit ✓
      ▼
  Anon 2nd-attempt signup gate ──── free_limit_gate ✓ → signin_gate_shown ✓ → signup_verified ✓
      │
      ▼
  Writing/Speaking submit (peak intent)
      │  writing_submit ✓ · premium_gate ✓ (stage signup|upgrade)
      ▼
  Paywall redirect → /pricing ───── paywall_redirect ✓ · pricing page_view ✓ (no dedicated paywall_view ✗)
      │                              gate CTR gaps: examiner-gate impression ✗ · quota-modal impression ✗ · mock-gate click ✗
      ▼
  Checkout start ─────────────────── checkout_start ✓ (sku)
      │
      ▼
  ██ SUBSCRIPTION ACTIVE ─────────── UNMEASURED ✗✗  (no webhook event, no success-page event, no premium_since)
      │
      ▼
  Retention weeks 2–8 ────────────── realtime_session_* ✓ · ai_score_result ✓ · WAU computable ✓
      │                              lifecycle email touchpoints: NONE ✗
      ▼
  Cancel / churn ─────────────────── UNMEASURED ✗ (plan_status overwritten in place; no cancel event)
```

---

## Section 4 — Plans, pricing & packaging

**4.1 The 3-SKU structure is mechanically well-merchandised** (hero anchoring verified live and at `pricing.js:200-234`) — but:
- **(P2) No savings anchoring:** no strikethrough "$59.94 → $29.99", no "Save 50%" badge; the /mo equivalents are doing all the work (`pricing.js:29-45`).
- **(P1) $9.99 anchor is fine; $44.99 annual is a positioning liability** next to Writing9's $29.99/yr (competitor table). The annual's job (cash upfront) is better done by a stronger 6-month hero; consider either dropping annual to $39.99 or repositioning it as "2 exam cycles."
- **(P1) A monthly-first buyer sees "Flexible — cancel anytime" as the *first* card** — the ladder reads left-to-right as cheap-commitment-first. Order and default-selection favor the hero visually but the monthly copy is the most reassuring on the page. Give the hero the reassurance copy too (guarantee) or it merchandises against itself.

**4.2 PPP: implemented and live server-side — with two real problems.**
Verified: lookup keys + `_ppp` suffix (`lib/billing.js:14-46`), geo from `x-vercel-ip-country` (`checkout.js:72-73`), server-side price resolution (never client-chosen). But:
- **(P0 — revenue leak) The PPP list includes the GCC** — SA, AE, QA, KW, BH, OM (`lib/billing.js:27`). The Gulf is one of the highest-volume, highest-income IELTS markets (work-visa candidates in UAE/KSA). These buyers would pay full price; the code gives them 55% off. Also SY/IR/SD are in the list — Stripe generally cannot settle there anyway; dead weight with sanctions-adjacent smell. Blueprint said "India/MENA/SEA" low-income markets (`docs/MONETIZATION.md:150-158`); its ambiguous "Gulf" mention (`:152`) likely caused this. **The code is wrong; fix the list.**
- **(P1) PPP is invisible pre-checkout** (`pricing.js:2-4`): the discount designed to convert price-sensitive markets is hidden from them at the decision point. Show localized prices (the geo header is available at request time, or an edge function / client IP-country lookup).
- **UNVERIFIED:** whether the 6 PPP Stripe Prices actually exist in the live Stripe account (code 500s if a lookup key is missing, `checkout.js:80-83`). **Founder: verify in Stripe dashboard.** Also `STRIPE_AUTOMATIC_TAX` is env-gated (`checkout.js:110`) vs blueprint's unconditional Stripe Tax (`MONETIZATION.md:236`) — **founder: confirm the env var is set in Vercel prod**, else no tax is being calculated (MoR compliance risk the blueprint explicitly accepted responsibility for).

**4.3 Missing mechanisms — explicit recommendations for a deadline-driven exam product:**

| Mechanism | Verdict | Reasoning |
|---|---|---|
| Free trial (card-gated) | **Against** | Card friction in PPP markets is severe; meter/tease achieves the same demo function without payment-method friction. |
| Free meter / first-score demo | **Strongly for (restore)** | The demo is the conversion engine for scoring products; 1 cheap-model score costs ~0.1–0.3¢ (`MONETIZATION.md:413`). Zero-free is the outlier position in the market (competitor table: 1–2 free is the norm, unlimited-free players exist). |
| One-time "Exam Pass" (e.g. $14.99 / 4 weeks, non-renewing) | **Strongly for** | Matches buyer psychology (subscription-averse students weeks from a test); market-proven (ielts.international $29/8wk, IELTS Mocks passes, Sprechify one-time). Cannibalization risk is limited: price it above the effective hero rate. |
| Money-back guarantee | **For** | Table stakes (5+ competitors); near-zero cost at current volume; also the honest answer to having no published refund policy at all today (§8 legal gap). 7- or 14-day unconditional. |
| Student-visible refund policy | **For (required)** | No refund/billing terms exist anywhere (`TermsOfService.js` — no subscription section). This is a chargeback-defense and Stripe-hygiene requirement, not just conversion. |
| Exam-date-based plan recommendation | **For** | Ask exam date at onboarding (one tap: "When is your test?"), then merchandise: "Test on Sept 12 → the 6-month plan covers your prep + one retake." Cheap to build; unique in the market scan. |
| Win-back discounts | **For, later** | Needs email infra first (§7); post-test-date "retaking?" offer is the natural IELTS win-back. |

**4.4 Unit economics vs. code:** caps enforced exactly as documented — writing 2/day, speaking 1/day (`20260718120000:84`), realtime 3600s/1800s PPP seeded and revoked by webhook (`lib/billing.js:35-36, 145-164`), decrement-before-mint on realtime (`pages/api/realtime/session.js:84-105`). Worst-case COGS ≈$4.50/user/mo (`MONETIZATION.md:19`) holds **except** for two enforcement gaps (§8: unmetered `speaking-realtime` scoring endpoint; browser-side session-duration cap). One margin note: free-tier COGS is now $0 by construction, so the *blended* margin is better than blueprint — bought at the price of the broken funnel.

---

## Section 5 — Upsell surfaces & gate inventory

Complete inventory (every gate/CTA found by event grep + `/pricing` link sweep; copy verbatim from code, live-verified where noted):

| Surface | Trigger | Copy (abridged) | Destination | Grade |
|---|---|---|---|---|
| Writing question, signed-out submit (`WritingQuestion.js:361-366`) | Submit w/ essay | "Sign up to get this response scored… nothing you've written is lost." | SignInDialog (stays on page) | **A-** — peak intent, loss-aversion handled |
| Writing question, free user submit (`WritingQuestion.js:247-252`) | Submit, `!isPremium` | **none — silent redirect** | `/pricing?upgrade=writing` (param dead) | **F** — peak intent wasted |
| Writing checker, signed-out (`ielts-writing-checker.js:411-415`) | Submit | "Sign up to get your essay scored…" + inline pre-warning | SignInDialog | **A-** (live-verified) |
| Writing checker, free user (`:287-300`) | Post-signup submit | **none — silent redirect** (essay saved first) | `/pricing?upgrade=writing` | **F** |
| Speaking question, signed-out (`SpeakingQuestion.js:881-884`) | Submit recording | "…your recording stays right here, ready to submit." | SignInDialog | **A-** |
| Speaking question, free user (`:801-819`) | Post-upload | **none — silent redirect**; recovery banner on return (`:1048-1056`) | `/pricing?upgrade=speaking` | **D** (banner redeems it) |
| Quota modal, non-premium (`AiQuotaPanel.jsx:24-53`) | 402/429 edge path | "Running examiner-grade AI… is expensive. Upgrade to unlock:" + "From $3.75/mo" | /pricing | **B** — good copy, edge-path only |
| Quota modal, premium at cap (`AiQuotaPanel.jsx:24-31`) | Daily cap | "You've hit today's fair-use limit… resets midnight UTC" | none | **A** — correct, no upsell to payers |
| Speaking-examiner gate (`speaking-examiner.js:587-601`) | Page load, `!isPremium` | "This is a Premium feature… 60 minutes… four full mock interviews" | "Get Premium" → /pricing | **C** — no taste of the product; impression untracked ✗ |
| Mock paywall (`mock/[slug].js:52-98`) | Page open | "Sit {title} under real exam conditions and see exactly where you stand **before test day**." | "See Premium plans" | **B+** copy (best on site); click untracked ✗; no free sample section |
| Reading/Listening anon gate (`QuestionEngine.jsx:562-564`) | 2nd submit/skill | "Sign up free… Reading and listening practice stays free." | SignInDialog, auto-resumes | **A** (live-verified) |
| Dashboard Settings card (`AccountSettings.js:168-173`) | Settings tab visit | "Free plan / Upgrade for unlimited AI feedback…" | "Explore Premium" | **C** — right copy, buried 2 clicks deep |
| Navbar "Premium" (`Navbar.js:35`) | always | "Premium" | /pricing | fine |
| Homepage dashboard teaser (`DashboardTeaser.jsx:226-295`) | scroll | "Create my free dashboard… No payment details required" | SignInDialog | **B** (free-account driver) |

**5.1 (P0) High-intent moments with NO upsell:**
- **Post-score result pages (premium users)** — no referral, no annual-upgrade nudge for monthly subscribers, fine for now. But for the *pre-premium* equivalents: reading/listening **results panel** has the writing bridge (good) yet no band-gap framing and no event on the link (UNMEASURED).
- **Band calculator results** (`pages/band-calculator.js`) — a user who just computed "I need 6.5W" sees no "get your Writing scored" CTA (newsletter only, per copy sweep).
- **Dashboard Overview** — free users with empty Writing/Speaking trend charts see no "unlock AI scoring to fill this in" (P1; the emptiness is itself the perfect ad and it's wasted).
- **Blog posts** — template has AdUnit + newsletter, zero product CTA (`pages/blog/[slug].js:123-124`).
- **Newsletter emails** — do not exist (§7).
- **Mock-test completion** (premium-only surface) — no "share your band" / referral moment. (P2)

**5.2 (P0) The free→paid "aha" mechanic is absent.**
Free is not "same thing, fewer times" — it is "nothing at all." There is no locked-preview experience: no blurred per-criterion feedback, no "your Band ~6.5 essay has 3 fixable issues — unlock them," no partial score. The one teasing asset (checker sample report, `ielts-writing-checker.js:194-221`) is generic and appears only on the checker page. The blueprint's own gate-able list (`MONETIZATION.md:41-47`) envisioned model-quality and depth tiers — none survive in the live product. **This is the mechanism to rebuild first** (see Action Plan #2).

---

## Section 6 — Analytics, tracking & the conversion feedback loop

**Foundation (credit where due):** dual-pipeline `track()` → GA4 (first-party proxied `/gt`, ad-blocker-resistant, `pages/_app.js:70-86`, `next.config.js:148-153`) + `/api/track` → `activity_events` with anon-id, country, and **retroactive anon→user stitching** (`pages/api/track.js:93`); first-touch attribution persisted and stamped first-write-wins onto `users.signup_source/utm` (`src/lib/analytics.js:32-61`, `20260717120000_user_analytics.sql:43-65`); a daily email report already aggregates visitors/signups by source (`pages/api/cron/daily-report.js:57-100`). This is better than most solo-founder stacks.

**6.1 (P0) The loop is unclosed at the exact point of revenue.** No server-side event when a subscription activates (`lib/billing.js:170-214` — DB writes only), no client event on `?checkout=success` (`pricing.js:156-161`), no `premium_since` column, `session_id` never read. **Checkout→paid conversion, MRR, cohorts, and time-to-convert are currently unknowable.** Fix is ~30 lines in `handleStripeEvent` + one column (Action Plan #1).

**6.2 (P1) Gate CTR is computable for some gates, not others:** missing examiner-gate impression (`speaking-examiner.js:587` renders untracked), quota-modal impression (`AiQuotaPanel.jsx:20`), mock-gate click (`mock/[slug].js:79-82` Link has no onClick). Free-limit and writing gates are fully instrumented (impression + trigger-tagged clicks). No dedicated `paywall_view{source}` on /pricing (page_view is the proxy; `?upgrade=` would have been the source tag — currently discarded).

**6.3 (P1) Revenue attribution stops at the users table.** `signup_source` reaches `users`, but checkout metadata carries only `{user_id, ppp}` (`checkout.js:107-109`) — no source in Stripe, no sku/amount on users. Revenue-by-source is a SQL join away *if* activation events existed; revenue *amounts* by source require storing the sku on the webhook (or reading Stripe exports).

**6.4 (P2)** Initial page_view deferred until auth resolution + 500ms (`_app.js:25-30`) — fast bounces invisible. `/api/track` isn't consent-gated (`analytics.js:94`) — compliance footnote. Server-side score event exists for writing only (`pages/api/score/writing.js:141-147`), not speaking/realtime.

**6.5 GA4-only vs product analytics — recommendation: do not add a tool.** The first-party pipeline + Supabase SQL can answer every core question once the P0 event lands; PostHog would add a third pipeline to maintain for a solo founder. Revisit only if funnel exploration in SQL becomes a time sink.

**6.6 The weekly numbers (and current computability):**

| # | Metric | Computable today? |
|---|---|---|
| 1 | Sessions/visitors by source | ✅ (activity_events + daily report) |
| 2 | Landing → first practice submit rate | ✅ (`attempt_submit`/visitors) |
| 3 | Signup rate by source | ✅ (`users.signup_source`) |
| 4 | Writing/speaking submit → gate hit | ✅ (`writing_submit` → `premium_gate`) |
| 5 | Gate → pricing → checkout_start CTR | ⚠️ partial (missing impressions, §6.2) |
| 6 | **Checkout → paid rate** | ❌ P0 — no activation event |
| 7 | **MRR / new subs / by source** | ❌ Stripe dashboard only |
| 8 | **Churn / cancels per week** | ❌ status overwritten in place, no event |
| 9 | Premium activation (first score ≤24h after pay) | ❌ needs premium_since |
| 10 | Realtime minutes consumed / subscriber | ⚠️ metered in DB, not evented (`session.js:85`) |

---

## Section 7 — Retention, expansion & churn

**7.1 (P0) There is no lifecycle email infrastructure at all.** No welcome email, no onboarding drip, no weekly digest, no win-back, no dunning beyond Stripe's own. The newsletter capture promises "One useful email a week. No spam" (`NewsletterSignup.jsx:147-151`) and its success state says "check your inbox" — **no email is ever sent** (`pages/api/newsletter/subscribe.js` is capture-only; the only Resend calls are the contact-form relay and the admin daily report, `contact.js:65-87`, `daily-report.js:434-447`). Subscribers are accruing against a promise being silently broken. For retention weeks 2–8 the subscriber hears from the product exactly never.

**7.2 (P1) Exam date — captured, unused.** Optional Settings field (`AccountSettings.js:87`) → dashboard countdown label (`dashboard.js:156`). Not asked at onboarding (`SignInDialog.jsx:40-45`), drives no pacing, no mock cadence ("one mock per week until test day"), no plan recommendation, no post-test flow. Churn-at-test-date is structural in this business and the product doesn't know when test day is for most users.

**7.3 (P1) Cancel flow is a bare Stripe portal** (`portal.js:50-53` — no configuration, no flow_data, no cancellation_reason collection, no save offer/pause/downgrade). The "canceled but active until {date}" state is handled correctly (`pricing.js:177-178`, `lib/billing.js:99`). No exit survey → churn reasons unknown (compounding 6.6 #8). No pause option — the natural ask for "test done, might retake."

**7.4 (P1) What justifies month 2?** Dashboard analytics (streaks, band trends, practice plan — `StatsOverview.js`, `BandTrend.js`, `LearningInsights.js`) are the retention surface and they are **free for everyone**, while /pricing sells "Progress tracking" as a perk (`pricing.js:55`). For the hero SKU (6 months) this matters less (prepaid), but monthly churn has no counterweight: no new content cadence for premium, no weekly examiner-minutes reset ritual messaging, no goal mechanics tied to the subscription.

**7.5 (P2) No referral mechanism** anywhere (grep). IELTS candidates cluster in cohorts (classes, agents, Telegram groups) — cheap channel unexploited.

**7.6 Blog/newsletter monetization wiring: none.** Blog template: article → ad → newsletter box (`blog/[slug].js:123-124`) — no product CTA. Newsletter table has `source` tags but no free/paid segmentation and, again, no sends.

---

## Section 8 — Leakage & enforcement

**Overall: this is the strongest area of the codebase.** Prior audit's P0s are all VERIFIED FIXED in current code: exact-match origin allow-list (both `https://ielts-bank.com` and `https://www.ielts-bank.com` allowed — `lib/apiSecurity.js:1-4, 54`), bearer required on writing scorer (`writing.js:292-295` → 401), global rate buckets fail closed (`writing.js:342-348`, `speaking.js:405-411`, `session.js:78-80`). Quota RPCs are transactional with `FOR UPDATE` (`20260718120000:72`, `20260717130000:232`); billing columns are protected by a service-role-only trigger (`20260717130000:38-60`); clients cannot write `user_quotas` at all (`0005_rls_policies.sql:160-166`); checkout price selection is server-side geo, never client-chosen (`checkout.js:72-83`). The origin-bypass P0 from project memory is **fixed** — the memory note is stale.

**Remaining findings:**

**8.1 (P1) `pages/api/score/speaking-realtime.js` is the un-hardened endpoint.** No quota meter (by design), but also **no global daily circuit breaker and a per-IP limit that fails open** (`:145-153` — RPC error logs and proceeds), on an endpoint that accepts up to 60,000 chars of entirely client-supplied "transcript" (`:17, 157-172`) straight into gpt-5.1. One PPP-annual account ($19.99/yr) can hammer it 8×/hour/IP, more with IP rotation. Every other scoring route got the fail-closed global-bucket pattern; this one (newest) didn't. **Money at risk: bounded but real; fix is copying 10 lines from `speaking.js`.**

**8.2 (P1) Realtime session duration is enforced only by the browser timer.** The meter charges fixed mode-seconds before mint (`session.js:84-105`, good), but nothing server-side caps the actual session length — `expires_after` limits session *start*, not duration (`lib/realtimeExaminer.js:92`); the countdown that ends the call is client code (`speaking-examiner.js:471-472`). A modified client pays 5 metered minutes and talks until OpenAI's platform cap. **UNVERIFIED:** whether OpenAI's Realtime API supports a server-set max-duration on the session config today — founder/eng should check and set it if so.

**8.3 (P1) Mock tests — the paid feature is given away in page source.** Gate is React-only (`mock/[slug].js:111`); `getStaticProps` embeds every passage and question in `__NEXT_DATA__` (`:197-201`; RLS makes published mock content world-readable, `0005:116-127`). No LLM cost, but you are selling a SKU whose content ships free to anyone who opens dev tools — and more practically, the *band-scored experience* is the real product, so the leak is tolerable short-term. Fix eventually (server-gated fetch), don't burn week-1 time on it.

**8.4 (P1) Webhook failure strands paying customers — no reconciliation.** Confirmed: no success-page session verification (`session_id` unread), no cron sync, no on-login plan refresh from Stripe (`stripe.subscriptions.retrieve` appears only inside the webhook itself, `lib/billing.js:172-175`). The pricing banner's "can take a few seconds; refresh" (`pricing.js:158`) is the entire recovery story. Stripe retries cover transient failures; a secret rotation or endpoint misconfiguration (memory notes the webhook URL is www-only — with apex 307→www live, verify the configured URL matches exactly) silently creates paid-but-free users. **Founder: also UNVERIFIED — whether webhook deliveries are currently succeeding; check Stripe dashboard → Webhooks → recent deliveries.**

**8.5 (P2)** Quota consumed before the LLM call with no refund on failure — two transient OpenAI errors lock a premium user out of writing for the day (`writing.js:377` vs error paths `:433-484`; same for speaking's 1/day, `speaking.js:439` vs `:464+`). Bad premium UX masquerading as cost control; the realtime mint route already implements compensating refund (`session.js:107-130`) — copy the pattern.
**8.6 (P2)** `refundSeconds` race (non-transactional read-modify-write, `session.js:111-125`); newsletter per-IP limit fails open contradicting its own comment (`subscribe.js:49-53` vs `:94-98`); billing-column trigger protects an enumerated list only (`20260717130000:38-55`).

**8.7 Canonical/host status (checked live via curl, 2026-07-18):** `https://ielts-bank.com` → **307** → `https://www.ielts-bank.com` (200); canonicals and sitemap now consistently say **www** (verified on question page, /pricing, sitemap `<loc>`). The split-brain from the prior audit appears resolved in favor of www. Residual (P2): the apex redirect is a temporary 307 rather than permanent 308/301 — set the Vercel apex→www redirect to permanent. Memory's "www/apex canonical split open P0" is stale.

---

## Drift register (blueprint vs. reality — who is right)

| # | MONETIZATION.md says | Code/live does | Judgment |
|---|---|---|---|
| 1 | Free meter: 1 anon + 3/30d (`:18, 259-267`) | Zero free scores (`20260718120000`) | **Doc is right about the funnel, code right about COGS discipline.** Restore a cheap-model teased free score (Action Plan #2); then update the doc. |
| 2 | PPP = India/MENA/SEA low-income (`:150-158`) | List includes GCC + SY/IR/SD (`lib/billing.js:27`) | **Code wrong.** Remove GCC + sanctioned states. |
| 3 | Stripe Tax enabled (`:21, 236`) | Env-gated `STRIPE_AUTOMATIC_TAX` (`checkout.js:110`) | **Verify prod env**; doc overstates. |
| 4 | Clear refund policy as chargeback mitigation (`:333`) | None exists anywhere | **Doc right; ship it.** |
| 5 | Free tier on cheaper model (`:229-231`) | `SCORING_MODEL_FREE` dead; everyone on paid model | Moot until free restored; then implement the split for real. |
| 6 | "Marketed as unlimited" abuse caps (`:292`) | Pricing says "Unlimited … (fair use)" (`pricing.js:51-52`) | Honest enough; keep. |
| 7 | PROGRESS.md: billing "GATED — Paddle" (`PROGRESS.md:56`) | Stripe live since 07-17 | **PROGRESS.md stale — update or archive it.** |
| 8 | Project memory: API origin bypass open P0 | Fixed (`lib/apiSecurity.js:54`; PROGRESS.md 1.1 DONE) | Memory stale. |

---

*Companion document: [MONETIZATION-ACTION-PLAN-2026-07-18.md](MONETIZATION-ACTION-PLAN-2026-07-18.md)*
