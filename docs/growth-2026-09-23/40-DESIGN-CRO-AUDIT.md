# 40 — Design and CRO audit (Sep 23, 2026)

Scope: the live site, www.ielts-bank.com, walked as an anonymous first-time visitor on desktop (1280px) and phone (375px). Path: homepage → Writing checker (essay pasted, submitted, stopped at the sign-up modal) → pricing → "Get 30-day Exam Pass" (stopped at the sign-up modal, before any account or payment step) → a Reading test, the Speaking examiner landing page, the Band estimator and a blog post. No accounts were created and nothing was submitted. The post-sample paywall cannot be reached without an account, so I read it in code and rendered it locally with a fixture.

Context from 00-DATA-BRIEF: about 82 sessions a day and 5m54s average engagement, but about $24 a month in revenue. About 1% of practising learners buy. The inline Exam Pass offer got 26 viewers and 0 clicks (Sep 7–17), and 6 of 7 genuine checkouts expired unpaid.

Screenshots are in `design-screens/`. Files starting `before-*` are live production. Files starting `after-*` are this branch on `next dev` (the round "N" in the bottom-left corner is the Next.js dev indicator, not part of the UI).

---

## Summary

People practise. The drop happens at three points:

1. **Before the essay.** Nobody can see what the free report contains or what Pro adds. The checker's "What your feedback looks like" sample showed an examiner summary that free users never get.
2. **At the free result.** The offer was generic ("Know what to improve in your next answer"). It had a soft CTA ("Compare feedback plans"). It showed two prices side by side, the recommended one the more expensive. It said nothing about the guarantee. A second accent button ("Score another draft") competed with it and only led to the paywall.
3. **At pricing.** Prices were below the first viewport. The page pushed only the Exam Pass whatever the buyer's timeline. Plan buttons said "Choose this plan". The sign-in step did not mention which plan was chosen or that checkout comes next.

Trust gaps also run through the site. A fake live counter was mounted sitewide. Nothing says who runs the site. The site uses "Premium" and "Pro" for the same thing. Two public "questions answered" numbers disagree.

---

## Ranked issues

Severity: **P0** = legal or trust risk, or a blocker on the money path. **P1** = strong conversion lever. **P2** = friction or polish. "Fixed" means fixed on this branch.

### P0-1. A simulated "N studying now" badge was mounted on every page. Fixed.
- **Evidence:** `src/components/StudyingNowBadge.jsx` with `src/lib/studyingNow.js`: a random walk between 10 and 50, seeded from the clock. No presence data behind it. On live it showed "14", "31", "48" and "41" on different page loads within minutes (see `before-home-mobile-fold.jpg`, `before-checker-mobile-fold.jpg`, `before-reading-mobile.jpg`). The Jul 20 legal audit flagged it as a fake-urgency / consumer-law risk. It also overlapped page content on the reading, pricing and checker pages (`before-reading-desktop.jpg`, top right).
- **Fix (7a22164):** deleted the component, the lib and their tests. The navbar test now asserts that no simulated counter renders.
- **Note:** the founder had re-styled the badge and kept it on purpose (commits bd696e2, 1d0453a, plus a test that enforced it). Tell the founder before this ships.

### P1-1. The post-sample paywall did not name what was locked, and it competed with another CTA. Fixed.
- **Evidence:** `before-paywall-free-result-mobile.jpg`. Old headline: "Know what to improve in your next answer". It showed Exam Pass and Monthly prices side by side, and the CTA was "Compare feedback plans". No guarantee was shown. On `/ielts-writing-checker` an accent "Score another draft (0 left)" button sat directly under the offer. For a free user, that button just redirects to the paywall. Result: 26 viewers, 0 clicks.
- **Fix (0b285a4, 1d60a84):** see `after-paywall-free-result-mobile.jpg`.
  - Eyebrow "Your free sample is done", headline "Get the full report on your next essay".
  - A checklist built from the real free payload: "Every corrected sentence — this essay had **4** more we held back", "A Band 8 rewrite of your weakest paragraph (one was written for this essay)", examiner summary and priority plan, and the scoring limits. It falls back to generic wording when the API sends no counts.
  - The price with plain per-day arithmetic (about $0.50 a day, or $0.20 for PPP), the 14-day money-back guarantee and "secure checkout by Stripe".
  - One primary CTA, "Continue to the Exam Pass". Same href and same events as before.
  - Monthly is mentioned in text only, and the copy states "Pro applies to the essays you score next — this free sample stays as it is".
  - On the checker, the competing button is replaced by a quiet "Keep practising" link when `result.free`. Paid results keep "Score another draft".
- **Measurement:** `OFFER_VERSION` is now `locked_value_v3` and is added to `scripts/report-paid-funnel.mjs`, so views and clicks can be read in sequence. `docs/exam-pass-rollout/MEASUREMENT.md` is updated.

### P1-2. No free-vs-Pro sample report, and the existing sample over-promised. Fixed.
- **Evidence:** the checker's sample (`before-checker-desktop.jpg`) rendered an "Examiner Summary", which the free report withholds. The homepage had no sample at all. The pricing sample had no Band 8 rewrite and no plan. Nothing told the visitor which parts are free.
- **Fix (ce711b7, 9b67798, 1d60a84, f28d0a1):** new `SampleReportPreview`. It is one fictional Task 2 report, labelled "not a real learner's result or a promised score", with every section tagged **Free sample** or **Pro**. The tags mirror `reduceForFree` in `pages/api/score/writing.js`: overall band, the four criterion bands with feedback, and one correction are free. The examiner summary, the priority plan, all corrections and the Band 8 paragraph rewrite are Pro. It now appears on the homepage (under the counters), the checker and pricing, each with its own CTA (`after-home-desktop.jpg`, `after-home-mobile-sample.jpg`).

### P1-3. The homepage hero value proposition was generic, and three actions competed. Fixed.
- **Evidence:** `before-home-desktop.jpg`. "Prepare for IELTS with feedback you can use", plus two outline buttons ("Free Reading practice", "Explore the 30-day Exam Pass") under the paste box. The paste box's own small print was one run-on sentence.
- **Fix (9b67798, 6492d54):** see `after-home-desktop-fold.jpg`. The headline is now "Know your IELTS Writing band **and exactly what to fix**". The subline says what happens to a pasted answer. Three proof points sit under the box: band on all four criteria, one corrected sentence, free account with no card. The box also links "See a sample report", and the secondary paths are one line of text links.

### P1-4. The header's primary CTA sent visitors to the Reading list. Fixed.
- **Evidence:** "Improve my IELTS band" → `/readingquestion` on every page. Writing is what drives purchases (brief), and Reading is already free.
- **Fix (9b67798):** it is now "Check my essay free" → `/ielts-writing-checker`. Question pages still swap it for "Create account".

### P1-5. Pricing: prices started below the fold, and the page led with one plan whatever the buyer's timeline. Fixed.
- **Evidence:** `before-pricing-desktop.jpg` and `before-pricing-mobile-fold.jpg`. Before the plans came a hero pitching only the Exam Pass (with model-name jargon, "gpt-live-1"), a Free strip and a cloud of six feature chips. At 1280×860 the prices sat at the very bottom edge. On a phone they were about two screens down. The buttons read "Choose this plan". No per-day framing was shown.
- **Fix (f28d0a1, 6492d54):** see `after-pricing-desktop-fold.jpg` and `after-pricing-mobile-fold.jpg`.
  - Headline "Full IELTS feedback until test day", then a **"When is your IELTS test?"** picker: within 30 days → Exam Pass, 1–3 months → Monthly, not booked or 3+ months → Annual. The picker highlights the matching card and says why. A saved exam date pre-selects it. Display-only: same prices, same card order, same checkout request. It fires a `pricing_timeline_select` event.
  - Plans come right after the picker. The chips and the Free strip move below the plans.
  - Each card shows "About $0.50 / $0.30 / $0.14 a day", worked out from the real list prices.
  - The buttons are "Get 30-day Exam Pass", "Start Monthly" and "Get Annual". Accessible names are unchanged.
  - The sign-in step restates the plan ("Create your account to get the Exam Pass") and says Stripe checkout with the 14-day guarantee comes next.

### P1-6. The checker didn't say how scoring works or how accurate it is. Fixed (honestly).
- **Evidence:** no explanation anywhere on the checker. `/ielts-writing-checker-accuracy` exists but was linked only from pricing, and only when calibration stats exist (they are still `pending`).
- **Fix (ce711b7, 1d60a84):** added a "How the scoring works" block with four factual statements: the four criteria and how the overall band is derived; the anti-over-marking calibration (`lib/writingCalibration.js`); estimate, not an official score; privacy. It links to the accuracy page. It makes **no numeric accuracy claim**, and a test enforces that.

### P2-1. The mobile checker had a long hero, and the action scrolled out of reach. Fixed.
- **Evidence:** `before-checker-mobile-fold.jpg`: the form started below the first screen. Once a visitor scrolls into the sample or the FAQ, no action is visible.
- **Fix (1d60a84, 6492d54):** a tighter mobile hero. A phone-only sticky bar, "Check my essay free" (or "Back to my essay" once text is entered), appears only when the form is off screen and hides while scoring, on a result, or in sign-in (`after-checker-mobile-sticky.jpg`).

### P2-2. A stale error stayed on screen after the essay was fixed. Fixed.
- **Evidence:** submit at 182 words, then add text until the count reads 263 / 250 in green. The red "must be at least 250 words… Current word count: 182" stayed on screen.
- **Fix (1d60a84):** the error clears as soon as the essay reaches the minimum. Test added.

### P2-3. "Premium" vs "Pro" naming, and an off-palette CTA on the Speaking examiner. Partly fixed.
- **Evidence:** the nav and pricing say "Pro". Report lock chips, the Speaking examiner gate ("The Live examiner is a Premium feature" / "Get Premium", navy button), the About page, the AI quota panel and billing management say "Premium".
- **Fix (0b285a4, 5768cba):** the Writing and Speaking lock chips now say "Pro". The examiner gate now reads "The live examiner is part of Pro", with an accent "See Pro plans" button → `/pricing?upgrade=speaking`, the guarantee, and a "Get one free Speaking sample score" try-first link.
- **Remaining:** "Premium" is still in `AiQuotaPanel`, `pages/billing/manage.jsx`, `src/pages/AboutUs.js`, `SpeakingQuestion` model-answer gate and the sign-in copy. Needs one sitewide copy pass.

### P2-4. Sign-up modal copy. Partly fixed.
- **Evidence:** from the checker, "Sign up to get your essay scored" asks for email and password, then a 6-digit code. From pricing, "Sign in to upgrade" did not mention the chosen plan.
- **Fix:** pricing now restates the plan (P1-5). The checker button reads "Get my free band score", with the line "Next you create a free account (email and password, no card)…".
- **Remaining:** see R-3 (defer the account until after the result, or offer Google sign-in).

---

## Found but not changed (recommendations)

| # | Issue and evidence | Recommendation | Why not done here |
|---|---|---|---|
| R-1 | **Exam Pass costs 67% more than Monthly for the same 30 days of the same Pro tier.** The only difference is no renewal. It is the highlighted plan, and it's also the priciest per day. The one recent buyer chose Monthly. | Either make the Pass clearly *better* for exam month (for example, extra live-examiner minutes, or a full mock plus a Writing report bundle, stated side by side with Monthly), bring its price to Monthly or near it, or stop featuring it by default and let the timeline picker decide. | Price and packaging decision. Prices were off-limits. |
| R-2 | **Checkout abandonment (6/7).** Stripe Checkout was not reached in this audit (it needs an account). Likely causes: an account plus a 6-digit code before payment; card-only payment for SG/HK/IN/VN/BD buyers; USD prices. | Turn on Link, Google Pay / Apple Pay and local methods (UPI for IN, PayNow for SG, GrabPay/Alipay, etc.) in the Stripe Dashboard, and show "USD" with an approximate local price. Consider guest checkout (Stripe collects the email; the account is created by the webhook). | Stripe config and checkout/auth logic are off-limits. |
| R-3 | **Account required before the first result.** Anonymous visitors must sign up (email, password, 6-digit code) to see a single band. | Test showing the overall band anonymously, with the criteria and correction unlocked by a free account. The server already supports gated reveals (Band Estimator pattern). Add "Continue with Google". | Auth logic is off-limits; it needs a product decision on abuse and cost. |
| R-4 | **The client blocks Task 2 under 250 words, but the page says "shorter answers are penalised".** The server accepts 50+ words (`MIN_WORDS = 50`). A 182-word draft gets a hard stop. | Allow 150–249 words with a clear "under-length answers lose Task Response marks" warning, or change the copy to "must be 250+ words to be scored". | This changes how the one lifetime free sample gets spent; it's a product decision. |
| R-5 | **Two public "questions answered" numbers.** Home says "73,000+" (a hard-coded `QUESTIONS_ANSWERED_BASELINE`, commit 6dd3ed1 "Raise questions answered credibility count"). Pricing shows the live RPC value, "15,173". | Show one number. If 73,000 can't be documented from historical logs, use the live figure everywhere. The same legal logic as the removed badge applies. | Can't verify the historical figure; flagged for the founder. |
| R-6 | **No one is behind it.** About has no names. The homepage says "Built by test-takers, for test-takers" with no evidence. No testimonials (correctly empty); no author bylines on the ~100 blog posts. | Add a founder name, photo and short bio (who you are, your IELTS/teaching experience, why you built it) to About and the footer, and a byline on blog posts. Start collecting real quotes (the `contactus?topic=feedback-story` loop exists) and show them only with permission. | Needs real facts from the founder; nothing invented. |
| R-7 | **Guarantee copy is slightly stronger than the Terms.** Pricing says "no forms and no questions" / "No forms to fill in". Terms §6 allows refusal for fraud, chargeback abuse or heavy live-examiner use. | Change to "Email us within 14 days for a refund — see the terms". | Legal wording; left for the founder, with this note. |
| R-8 | **"gpt-live-1" model jargon.** The homepage skill card, the Speaking promo, pricing chips and FAQ, and the examiner page all name the model, and some say "newly released". Learners buy outcomes, and the naming dates quickly. | Say "a live AI examiner that listens while it speaks" and keep the model name in one FAQ. | Left mostly untouched outside the pricing hero to limit scope. |
| R-9 | **Reading test timer starts on page load** (`before-reading-desktop.jpg`: 19:58 before any interaction). The header CTA there is "Create account" while other pages show a different CTA. | Start the timer on first interaction or with a "Start timer" button. The Reading and Listening result page should always carry the Writing bridge (it exists in `writingUpsell.js`; check that it renders for anonymous visitors). | Out of scope for this pass. |
| R-10 | **The blog post has one CTA, at the very end** (`before-blog-desktop.jpg`), and no byline or date prominence. | Add an inline "Check your essay free" card after the first H2 on Writing posts, plus a byline (R-6). | Content template change; worth a separate PR. |
| R-11 | **Design tokens and consistency.** Primary CTAs mix `bg-primary` (navy) and `accent` (green). Pricing uses `text-lg`/`sm:text-5xl` while the checker uses `md:text-5xl`. Pill badges come in three different styles. Raw colours (`text-emerald-300/400`, `bg-slate-950`) sit in the hero. | Agree one rule (accent = the one primary action per view; navy = secondary / informational), and add `heading-1/2` utilities and a `Pill` variant set. | A sweep across many files; low CRO value compared with the above. |
| R-12 | **Analytics audit** (`npm run audit:analytics`) reports one pre-existing uncaptured handler in `src/components/datadash/GlobeStage.jsx:476`. | Add `data-analytics-id` or ignore it. It's an internal dashboard. | Pre-existing; not touched. |

---

## What to watch after deploy

- `exam_pass_offer_view` → `exam_pass_offer_click` for `offer_version = locked_value_v3` against `feedback_value_v2` (sequential, not randomised; see MEASUREMENT.md).
- `pricing_timeline_select` distribution, and `plan_select` sku mix after the picker.
- `sample_report_cta_click` (homepage, checker) and `sticky_cta_click`.
- Header CTA: checker landings from non-question pages.
- Decision gate (the Sep 18 audit's rule): at least 28 stable days and 100 scored-offer learners before reading purchase-rate changes. With one sale a month, treat offer clicks as the leading indicator.

## Branch changes (commits)

| Commit | Change |
|---|---|
| 7a22164 | Remove the simulated "studying now" counter |
| ce711b7 | `SampleReportPreview`, `ScoringExplainer`, `StickyMobileCta` components and tests |
| 0b285a4 | Post-sample paywall: specific locked value, per-day cost, guarantee, one CTA; "Pro" lock chips; offer v3 |
| 1d60a84 | Writing checker: hero, Free/Pro sample, scoring explainer, single CTA under a free result, stale error fix, sticky mobile CTA |
| 9b67798 | Homepage hero and sample section; header CTA → Writing checker |
| f28d0a1 | Pricing: plans first, exam-timeline picker, per-day cost, clearer CTAs, plan-aware sign-in title |
| d0df61a | Test follow-ups (estimator copy, lint) |
| 5768cba | Speaking examiner gate: Pro naming, context link, free-sample path |
| 6492d54 | Mobile hero spacing, pricing H1, fix for sample tag overlap at 375px |

Not changed: prices, Stripe price IDs, `pages/api/billing/*`, the checkout request payload, auth logic, and scoring/entitlement logic. No testimonials, urgency or counters were added.
