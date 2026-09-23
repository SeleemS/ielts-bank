# IELTS-Bank growth sprint — shared data brief (Sep 23, 2026)

Site: https://www.ielts-bank.com (canonical = www; apex redirects). Next.js 15 pages router on Vercel,
Supabase (Postgres) backend, Stripe billing, OpenAI for AI scoring. Repo: SeleemS/ielts-react, `main` auto-deploys to prod.
Integration branch for this sprint: `growth/sep23` in worktree /Users/seleemshaalan/Desktop/code/ielts/monetization-sep18.

## Traffic (GA4, Aug 26–Sep 22, 28 days)
- 2,292 sessions (~82/day), 972 engaged, avg engagement 5m54s/session. GA4 90-day: 4.6K active users, 36K views, 3 purchases.
- Channels: Organic Search 670 (60% engaged) · Direct 619 (26% engaged — bots likely) · Unassigned 606 · **AI Assistant 378 (67% engaged, best quality)** · Organic Social 19 · Referral 6.
- Top countries (GA4): Singapore, Hong Kong, US, India, Germany (SG/HK/US may include datacenter bots). Earlier first-party data: SG/CN/VN/BD/IN.
- Revenue: **$23.98 in 28 days** (GA4). Lifetime Stripe gross < $120. 1 new paying customer Sep 7–17 out of ~101 practising learners.

## Search (GSC, 90 days to ~Sep 21)
- 1.0K clicks, 10.3K impressions, avg pos 10.5. **~58% of clicks are brand** ("ielts bank" 485, "ieltsbank" 65, "ielts-bank" 30).
- **Indexing: only 103 pages indexed; 605 not indexed** — 534 "Discovered – currently not indexed", 50 alternate/canonical, 9 redirect, 4 404, 3 5xx, 5 crawled-not-indexed. This is the #1 SEO problem (authority + perceived quality).
- Non-brand opportunities with impressions but ~no clicks:
  - "ielts essay bank" 1,324 imp pos 6.2 (11 clicks); "essay bank" 720 imp pos 7.9; "ielts bank essay" 178; "ieltsessaybank" 101; "essay bank ielts" 47; "eassy bank" 61 → **people want an IELTS essay bank; we have no dedicated page.**
  - "ielts writing checker" 356 imp pos 23.7; /ielts-writing-checker page 1,418 imp pos 27.6 (1.4% CTR); "ielts essay checker" 52 pos 27.7; "ai ielts writing checker" 12; "writing task 1 checker"/"task 2 checker" pos 28–39.
  - "vitamins reading answers" 76 imp pos 8.2, "vitamins reading passage 3 answers" 21, "keeping an eye on shoppers ielts reading" 35 → **reading-answers queries for our passages.**
  - "ielts test bank" 81, "ielts database" 45, "ielts question bank" 33, "ielts megatest bank" 12, "band check" 13, "ielts summary completion practice" 18, "what to bring to ielts test" 24 (pos 25), Korean "아이엘츠 리스닝 족보" 16.
- Top pages by clicks: / (789), apex / (64), /band-estimator 29, /ielts-writing-checker 20, /ielts-writing-task-2-topics/september-2026 17, /listeningquestion 17, /blog 9.

## Monetization status
- **AdSense: ielts-bank.com status "Getting ready" (NOT approved) → $0 ad revenue.** Pub ca-pub-5189362957619937; zakatinvest.com is approved on the same account. ads.txt authorized.
- Stripe live: Pro monthly $8.99, annual $49.99, 30-day Exam Pass $14.99 one-time (PPP $3.99/$19.99/$5.99). Free: 1 writing + 1 speaking AI sample per account.
- Checkout abandonment is high (6 of 7 genuine checkouts expired unpaid Sep 7–17).
- No affiliate revenue of any kind.

## Content inventory (approx)
~101 blog posts (content/posts/*.md, one auto-published daily by a cloud routine), reading/listening/writing/speaking question pages, speaking cue cards + topic hubs, band estimator, band calculator, writing checker, mock tests, score-requirements by country, writing task 2 topics by month.

## Prior docs worth reading (docs/)
FULL-SITE-AUDIT-2026-08-02.md, MONETIZATION-AUDIT-2026-07-18.md, LLM-VISIBILITY-PLAN-2026-08-02.md, PRODUCT-AUDIT-2026-07-20.md, and ../ielts-react/.vercel/monetization-audit-2026-09-18/REPORT.md (Sep 18 funnel audit).

## Constraints
- Trademark: "IELTS" is a registered TM of British Council/IDP/Cambridge — use descriptively only, keep non-affiliation disclaimer, never imply official material, never rehost official Cambridge tests.
- Content must be original (no scraping competitor questions/essays).
- Do not run prod DB migrations or Stripe config changes — write them as scripts for the founder to run.

## Addendum (PM, Sep 23 afternoon)
- Stripe default payment-method configuration (pmc_1TuDiT2dmCzY4QBUMtJB89bt) ON: card, apple_pay, link, klarna, affirm, bancontact, blik, eps, mb_way, pix, satispay. **OFF: google_pay, paypal, alipay, wechat_pay, upi, ideal, sepa_debit, afterpay.** Audience is SG/HK/CN/VN/IN/BD, mostly Android → Google Pay off is a likely checkout-abandonment cause; Alipay/WeChat Pay (one-time Exam Pass) worth enabling. Changing this is a founder/Stripe-settings action.
- Vercel runtime errors (7d): /api/track duplicate client_event_id (34, harmless dedupe noise → should be ON CONFLICT DO NOTHING), /api/estimator/score-writing ai_usage_costs user_id NULL (8 — anonymous estimator cost rows dropped), /api/score/speaking Whisper 400 invalid format (2).
