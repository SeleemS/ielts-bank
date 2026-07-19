# Prompt: Monetization Audit + Action Plan for ielts-bank.com

> Run this in a fresh Claude Code session at the repo root (`ielts-react/`), with browser access enabled so the auditor can walk the live funnel on https://www.ielts-bank.com. Expect a long run; the deliverable is two documents (audit + action plan).

---

You are a skeptical monetization and growth consultant hired to audit **ielts-bank.com**, an IELTS practice product built by a solo founder. Your job is NOT to summarize what exists — it is to find why the monetization engine is weak and what to do about it, with evidence. Assume the founder's instinct is right: positioning, plans, upsells, conversion, and messaging are all suspect until proven otherwise. Be blunt. Every claim must cite evidence: a `file:line`, a screenshot of the live site, a competitor URL, or a named analytics event.

## Product context (verify, don't trust)

- **Stack:** Next.js (pages router) on Vercel, Supabase (auth + Postgres), Stripe billing (live since 2026-07-17), GA4 + Vercel Analytics, AdSense on free pages.
- **Business model (intended):** All Reading/Listening content free forever (SEO moat — this is non-negotiable, do not propose gating content). Paid product = AI scoring of Writing & Speaking, a realtime AI speaking examiner (metered minutes), progress analytics, ad-free, mock tests.
- **Free meter (intended):** anonymous users get 1 free AI score per skill; signed-in free users get 3 AI scores per rolling 30 days, enforced server-side via `user_quotas`.
- **SKUs:** $9.99/mo, $29.99/6mo (hero), $44.99/yr. PPP tiers (~55% off for India/MENA/SEA) are planned via geo-selected Stripe Prices — verify whether they actually exist.
- **Source-of-truth docs to read first:** `docs/MONETIZATION.md` (the blueprint), `docs/AUDIT-ACTION-PLAN-2026-07.md` (prior product audit), `docs/PROGRESS.md`.

The central question of this audit: **where does reality diverge from the blueprint, and where is the blueprint itself wrong?** Treat `MONETIZATION.md` as a hypothesis, not gospel — it was written by the founder, and the founder now believes conversion is weak.

## Key code surfaces (starting points, not an exhaustive list)

- Pricing & checkout: `pages/pricing.js`, `pages/api/billing/checkout.js`, `pages/api/billing/portal.js`, `pages/api/webhooks/stripe.js`, `lib/billing.js`
- Gating & quotas: `lib/premium.js`, `src/lib/usePlan.js`, `src/lib/freeAttempts.js`, `src/components/AiQuotaPanel.jsx`, `pages/api/score/writing.js`, `pages/api/score/speaking.js`, `pages/api/score/speaking-realtime.js`, `pages/api/realtime/session.js`
- Monetized features: `pages/ielts-writing-checker.js`, `pages/speaking-examiner.js`, `pages/mock-test.js`, `pages/mock/[slug].js`, question pages under `pages/writingquestion/`, `pages/speakingquestion/`
- Analytics: `src/lib/analytics.js`, `pages/api/track.js`, GA4 wiring in `pages/_app.js`
- Retention surfaces: `pages/dashboard.js`, `src/components/dashboard/`, newsletter (`src/components/NewsletterSignup.jsx`, `pages/api/newsletter/`), blog (`pages/blog/`)

## Audit scope — eight sections, each with a 1–10 score and evidence

### 1. What we monetize & why anyone would pay
- State precisely what the paid unit is and stress-test it: is "AI band scoring with rubric feedback" a strong enough differentiator to charge for in 2026, when ChatGPT/Gemini can score an IELTS essay for free? What is our answer to "I'll just paste my essay into ChatGPT"? If we don't have one in the product or copy, that's a P0 finding.
- Evaluate the value ladder: free auto-scored Reading/Listening → free AI score sample → paid unlimited. Does each rung create desire for the next, or are they disconnected?
- Competitive scan (web research): pricing, free tiers, and positioning of the top 5–8 direct competitors for "IELTS writing checker / AI IELTS scoring" (e.g. Writing9, IELTS Science, HiWriting, TrueScore, generic GPT wrappers, and whatever ranks today). Build a comparison table: price, free allowance, differentiators, proof/trust signals. Where do we sit and what do we uniquely claim?

### 2. Positioning & messaging
- Audit the actual copy on: homepage, `/pricing`, `/ielts-writing-checker`, `/speaking-examiner`, question pages, paywall/gate modals, auth modals, and post-signup emails (check Supabase email templates if accessible; otherwise flag as unaudited).
- For each surface, judge: does it sell an *outcome* ("reach Band 7 faster", "know your real band before test day") or a *feature list* ("unlimited AI scoring")? Is there any urgency, social proof, testimonial, score-improvement claim, or examiner-credibility signal anywhere? IELTS candidates are deadline-driven (booked test dates) — does any copy exploit that?
- Check headline/meta consistency: does the pricing page's promise match what the gates promise, and what the product delivers (e.g. "unlimited" marketing vs. daily abuse caps — is that framed honestly and safely)?
- Verdict on the word "Premium" and the brand framing itself: does "IELTS Bank Premium" mean anything to a candidate, or is it generic?

### 3. The user journey — walk it, don't infer it
Using the browser, walk these journeys end-to-end **as a real anonymous user in an incognito context**, screenshotting every monetization-relevant moment (gate, CTA, modal, empty state, error):
1. Land on a reading question from Google (simulate: direct-load a question page) → complete it → what happens next? Is there ANY bridge from the free auto-scored experience toward the paid Writing/Speaking product, or does the funnel dead-end?
2. Anonymous → writing checker → submit an essay → free score → what is the moment after the score is delivered? This is the single highest-intent moment in the product — grade it hard. Is the score itself the ad for Premium (locked criteria, blurred feedback, "your Band 6.5 essay has 3 fixable issues — unlock them")? Or does the paywall appear before value is felt?
3. Exhaust the free meter → observe the gate → sign up (OTP flow) → exhaust free tier → hit the paywall → click through to `/pricing` → start checkout (stop before payment). Note every point of friction, every generic message, every place the user could silently drop.
4. As a hypothetical premium user (read the code for this): what changes on day 1? Is there an activation moment, or does Premium feel identical to free until you hit a limit?
- Map the full funnel as a diagram: acquisition (SEO content) → activation (first score) → signup → meter exhaustion → paywall → checkout → subscribe → retain/churn. Mark each transition with the analytics event that measures it (or "UNMEASURED").

### 4. Plans, pricing & packaging
- Critique the 3-SKU structure: is the 6-month hero actually merchandised as the hero on `/pricing` (visual anchoring, default selection, savings framing)? Is $9.99/mo the right anchor or is it doing anchor damage?
- PPP: verify implementation status in `lib/billing.js` / checkout API. If not live, size the cost: what share of IELTS candidates are in India/MENA/SEA, and what does a US-only price do to conversion there?
- Missing mechanisms to evaluate explicitly (recommend for/against each, with reasoning for a deadline-driven exam product): free trial vs. free meter, one-time "score pack" (non-subscription purchase for commitment-phobic students weeks from their test), money-back guarantee, student-visible refund policy, exam-date-based plan recommendation ("test on Sept 12? The 6-month plan outlasts your prep"), win-back discounts.
- Sanity-check unit economics claims in MONETIZATION.md (COGS caps, margins) against the actual model calls in `pages/api/score/*` — are the caps enforced in code?

### 5. Upsell surfaces & gate inventory
- Enumerate EVERY gate and upgrade CTA in the codebase (grep for the gate/paywall components and the events `free_limit_gate`, `premium_gate`, `mock_paywall_shown`, `signin_gate_shown`, `paywall_redirect`, `paywall_upgrade_click`, `dashboard_teaser_cta_clicked`). Produce a table: surface, trigger condition, copy shown, destination, and a grade for whether it converts at the moment of highest motivation or interrupts at a moment of annoyance.
- Identify high-intent moments with NO upsell: post-score result pages, band calculator results, dashboard, blog posts, newsletter emails, mock-test completion. Every unexploited one is a finding.
- Check the free→paid "aha" mechanics: does the free score show a taste of what Premium adds (per-criterion breakdown teased, examiner comments locked), or is free simply "same thing, fewer times"? "Same thing, fewer times" is a weak upsell for a product used 2–3 times before a test — call it out if so.

### 6. Analytics, tracking & the conversion feedback loop
- Inventory the event taxonomy in `src/lib/analytics.js` and all `track(...)` call sites. Then answer: **can the founder currently compute a funnel conversion rate from landing → free score → signup → paywall view → checkout start → paid?** Specifically check:
  - Is there a server-side conversion event when a Stripe subscription actually activates (webhook → analytics), or does tracking stop at `checkout_start`? An unclosed loop here means conversion rate is literally unknowable — P0 if so.
  - Is revenue attributed to first-touch source (the attribution capture in `analytics.js` — does it survive to the Stripe customer/subscription metadata)?
  - Are gate impressions vs. gate clicks both tracked (so per-gate CTR is computable)?
  - GA4-only vs. a product analytics tool: is funnel analysis actually practical in the current setup for a solo founder? Recommend concretely (e.g. PostHog free tier) only if the current setup can't answer the core questions.
- List the 5–10 numbers the founder should look at weekly, and whether each is currently computable. For every "no", the action plan must contain the fix.

### 7. Retention, expansion & churn
- Audit what a subscriber gets over weeks 2–8: progress analytics depth, email touchpoints, streaks/goals, mock-test cadence, anything that justifies month 2. For an exam product, churn-at-test-date is structural — is there any post-test offramp (pause, "preparing for retake?", refer-a-friend) or graceful cancel flow?
- Check cancel/portal flow (`pages/api/billing/portal.js` + Stripe portal config): any save offer, downgrade path, or exit survey?
- Newsletter and blog: are they wired to monetization at all (segmented by free/paid, any upgrade path in emails), or purely SEO?

### 8. Leakage & enforcement
- Verify every gate is enforced server-side, not just in React: attempt to identify bypasses of the score APIs (missing auth/origin checks, quota checks that trust the client, premium checks done only in `usePlan`). The prior audit flagged an **API origin-bypass P0** — verify whether it's fixed, and whether free-meter enforcement (`user_quotas` transactional decrement) matches the blueprint.
- Check webhook robustness: does a Stripe webhook failure silently strand a paying user on the free plan (the pricing page shows a "activation can take a few minutes" message — is there reconciliation)?

## Deliverables

Produce two markdown files in `docs/`:

**1. `MONETIZATION-AUDIT-<date>.md`** — the audit:
- Executive summary: the 5 biggest reasons monetization is weak, one paragraph each, ranked by revenue impact.
- Scorecard table: the 8 sections above, each scored 1–10 with a one-line justification.
- Full findings per section. Every finding gets: severity (P0 = actively losing money/blocking conversion, P1 = significant lift available, P2 = polish), evidence (`file:line`, screenshot reference, or URL), and the specific user moment it affects.
- The funnel diagram with measurement gaps marked.
- The competitor comparison table.

**2. `MONETIZATION-ACTION-PLAN-<date>.md`** — the plan:
- **Week 1–2 quick wins:** highest impact-to-effort items a solo founder can ship (copy changes, gate repositioning, closing the analytics loop). Each with: what to change, exact file(s), expected mechanism of impact, and the metric/event that will prove it worked.
- **30/60/90-day roadmap:** sequenced by dependency (measure → fix funnel → then pricing experiments), not by theme.
- **3–5 concrete experiments:** hypothesis, change, success metric (named analytics event + threshold), duration, and minimum traffic needed to read a result at current volume (~check GA if accessible; otherwise state the assumption).
- Explicit **do-NOT-do list:** tempting changes that would damage the SEO moat, AdSense compliance, or trust (no login-walls on content, no fake urgency, no dark-pattern cancellation).
- A one-page "if you only do five things" summary at the top.

## Rules of engagement

- Evidence over opinion. If you can't verify something (e.g. Supabase email templates, Stripe dashboard config, GA4 data), say "UNVERIFIED — founder should check X" rather than guessing.
- The SEO content moat stays free. Any recommendation that gates content pages or degrades their crawlability is out of bounds.
- Solo founder, no team: every recommendation must be shippable by one person; prefer copy and flow changes over new feature builds; when you do propose a build, size it in days.
- Where MONETIZATION.md and reality disagree, document the drift and judge which one is right — sometimes the code is right and the doc is stale.
- Use subagents/parallel research where useful (competitor scan, code sweep, live-site walkthrough can run concurrently), but the final documents must be coherent single narratives, not stitched fragments.
