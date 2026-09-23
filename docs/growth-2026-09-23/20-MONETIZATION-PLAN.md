# 20: Monetization plan (Sep 23, 2026)

Owner: monetization lead. Inputs: `00-DATA-BRIEF.md`, the Sep 18 funnel audit (`ielts-react/.vercel/monetization-audit-2026-09-18/REPORT.md`), `docs/MONETIZATION-AUDIT-2026-07-18.md`, a code read of `pages/api/billing/checkout.js`, `lib/billing.js`, `src/lib/adPolicy.js` and `pages/_app.js`, live curl checks, and web research done Sep 23, 2026 (sources in §5).

**Bottom line.** We earn about $24/month on about 2,300 sessions/month, roughly **$10 per 1,000 sessions**. A well-monetized test-prep site at this traffic, with this geography, can realistically earn **$90–330/month**. That range comes from fixing checkout, getting AdSense approved, and adding a few affiliate links that suit our users. Traffic is the long-run limit, which matches the Sep 1 review. But two problems are ours to fix, and they cost money today:

1. **Checkout does not take the payment methods our buyers use.** Prices are USD-only and the card is the only realistic method, sold mostly as auto-renewing subscriptions to India, SEA and China. Six of seven checkouts expired unpaid. The one PPP renewal we have failed three times with `transaction_not_allowed` (evidence in §5.4).
2. **The AdSense crawler never sees our ad code.** `curl` of `/` and `/blog` returns **0** occurrences of `adsbygoogle`, `ca-pub-` or a `google-adsense-account` meta tag in the server HTML. The script is only injected client-side after consent state resolves (`pages/_app.js:109`, `src/lib/adsenseLoader.js`). "Ad code missing" is one of Google's listed reasons a site doesn't get approved.

Nothing below needs a login wall on content, fake urgency, or ad networks that damage the brand.

---

## 1. Ranked action list

$ ranges are incremental monthly gross over today's ~$24. "Now" means ~2,300 sessions/month (~12K pageviews). "5x" means ~11,500 sessions/month. These are estimates with wide error bars. One extra sale moves several rows, so read them for ranking, not forecasting.

| # | Action | Now $/mo | 5x $/mo | Effort | Who |
|---|---|---|---|---|---|
| 1 | **Fix payment coverage in Stripe (Dashboard only):** confirm a USD settlement account, turn on **Adaptive Pricing**, turn on **Link, Apple Pay, Google Pay, Alipay, WeChat Pay, UPI**, turn on the Stripe-hosted confirmation-link email. | $15–45 | $75–220 | 1–2 h | **Founder** (Stripe config; engineers don't touch it) |
| 2 | **Lead with the one-time pass for India/China/PPP buyers, and make it 45 days.** For PPP countries plus CN and HK, pricing puts the pass first as "no renewal, pay with UPI/Alipay"; the subscription goes second. Stretch the pass from 30 to 45 days at the same $14.99 / PPP $5.99, in line with ielts.international (8 weeks for $15) and IELTS Mocks (45 days for $25). | $10–35 | $50–175 | Engineer 1 day (copy + webhook entitlement length) + founder Stripe product text | Engineer + founder |
| 3 | **Checkout recovery.** Set `after_expiration.recovery.enabled` and `expires_at` to about 2h. Handle `checkout.session.expired`, match on `client_reference_id`, and send one email with the recovery link to the logged-in user. Add a "pay on your phone" hint for UPI/Alipay QR codes. | $5–20 | $25–100 | Engineer 1 day | Engineer (founder confirms CASL wording) |
| 4 | **Get AdSense approved (see §2.1).** Add a server-rendered `<meta name="google-adsense-account">`. Put the AdSense loader in server HTML on public content routes for non-EU visitors. Noindex thin templated pages. Put a human edit on the daily auto-blog. Add a Google-certified CMP for EEA/UK/CH. Then request review. | $15–35 | $75–170 | Engineer 0.5–1 day; founder clicks Request review and sets up Privacy & messaging | Engineer + founder |
| 5 | **Replace the single lifetime free score with a refilling one:** 1 AI writing + 1 speaking score **per week** for signed-in free users. Today we give the fewest free scores of any competitor we checked (Engnovate 2+2/mo, Cathoven 3/mo, Lexibot weekly credits). A weekly refill gives a free user a fresh reason to upgrade each week. AI cost is about $0.02–0.05 per score (my estimate from the gpt-5.1 rates in `lib/aiCost.js`: $1.25/M input, $10/M output), so the worst case is about $0.20/month per active free user. | $10–40 | $50–200 | Engineer 1 day (`consume_ai_score` window change = a migration script the founder runs) | Engineer + founder runs migration |
| 6 | **Official test-booking referral (IDP IELTS Referral Partner / British Council IELTS Affiliate Programme).** "Book your test" links on score-requirement, test-format and estimator result pages. The fee per booking isn't published; ask before you build. **Trademark caveat below.** | $0–40 | $0–200 | Founder applies (1 h); engineer 2 h once links arrive | **Founder**, then engineer |
| 7 | **Tutor marketplace CTA** (one program only: Preply first, italki as fallback). Show it after a writing or speaking score **below 6.5** and on speaking hubs. Placement rules in §3 keep it from taking Pro sales. | $5–20 | $25–100 | Founder applies; engineer 0.5 day | Founder, then engineer |
| 8 | **Paid human examiner review add-on:** $19 per essay (PPP $9), one-time Stripe payment, fulfilled by a contracted ex-examiner at about $8–10 per essay. The market price is $7–9 per task (ieltsanswers, ielts-up), and several providers have paused their service (TED IELTS, ielts-up, IELTS Liz), which leaves room for us. Offer it on the writing report. | $10–45 | $50–200 | Founder recruits a marker (1 week); engineer 1–1.5 days | Founder + engineer |
| 9 | **"Next steps" box on the 10 `/ielts-score-requirements/<country>` pages:** Wise for tuition and visa fees, Amber for UK/AU/IE housing, Insubuy on the US page, Leverage Edu only for visitors geolocated to India. | $2–15 | $10–75 | Founder applies to 3–4 programs; engineer 0.5 day | Founder, then engineer |
| 10 | **Amazon Associates for Cambridge IELTS books** on 2–3 book or strategy blog posts (US store 4.5% on books; .in store about 7%). | $0–5 | $2–25 | Founder applies; engineer 1 h | Founder |
| 11 | **Tutor/teacher seats (B2B), done manually first:** a "Teacher" plan at $29/month for up to 10 student seats, sold by hand to 20–30 independent IELTS tutors, with no engineering until 2 of them pay. One sale would more than double current MRR. | $0–60 | $0–120 | Founder outreach 4–6 h; engineer 2–3 days only after validation | **Founder** first |
| 12 | Grow.me script (free) to measure Tier-1 sessions toward Journey by Mediavine eligibility (1,000 Tier-1 sessions/month). | $0 | $0–60 once eligible | 1 h | Founder signs up, engineer adds script |
| — | **Do not do:** Adsterra/PropellerAds (popunders); Ezoic (250K users/month minimum since Feb 2026); Monumetric ($99 setup fee); Grammarly/QuillBot on writing pages (they compete with the writing checker and send the wrong signal); competitor course affiliates (E2, Magoosh, IELTS Advantage); newsletter sponsorship (no real list or sending cadence yet). | | | | |

**Totals if 1–10 ship:** about **$70–300/month now**, **$350–1,500/month at 5x** traffic. Items 1–3 are the fastest money because they fix checkouts we are already losing: about 19 genuine checkout sessions a month currently convert at about 14%.

**Sequence.** Week 1: items 1, 3 and the AdSense meta tag (4a), plus founder submissions for 6, 7 and 9 (approvals take 2 days to 2 weeks). Week 2: items 2 and 5. Week 3: the rest of 4, then items 6, 7 and 9 as approvals arrive. Item 8 once a marker is signed. Item 11 is founder outreach in parallel.

**Trademark caveat (item 6).** Our domain contains "IELTS". The legal audit (`docs/`, Jul 20) flags that as a UDRP risk. Applying to IDP or British Council puts the domain in front of the trademark owners. The upside is real, since every user must book a test and IELTS costs about US$250. Still, apply only after deciding whether you're comfortable with that exposure, and keep the non-affiliation disclaimer on every placement.

---

## 2. Implementation specs (engineer)

### 2.1 AdSense approval checklist
1. **Verification tag in server HTML.** Add `<meta name="google-adsense-account" content="ca-pub-5189362957619937">` to `pages/_document.js` `<Head>`. Google offers this meta tag as a verification method when you don't want ads on a page ([AdSense help 13996652](https://support.google.com/adsense/answer/13996652?hl=en)). It collects no personal data, so it has no consent implications.
2. **Crawler-visible ad code.** The loader currently runs only after the client reads `optionalConsent`. Google says the AdSense crawler only visits pages carrying the ad tag and shares a cache with Googlebot, refreshing in 1–2 weeks ([99376](https://support.google.com/adsense/answer/99376?hl=en)). Whether it executes JS is undocumented. Option: server-render the `adsbygoogle.js` `<script>` on public content routes when the edge middleware's geo is non-EU/UK/CH. That matches our opt-out-by-default policy there. Keep it client-gated in the EU.
3. **Ads on content pages only.** Keep `AD_FREE_ROUTE` as is (`src/lib/adPolicy.js:1`). It already excludes question, scoring, estimator, pricing, mock and dashboard screens. Google prohibits ads on screens with little publisher content or low-value content, including navigation and alert screens and auto-generated content ([publisher policy 11112688](https://support.google.com/publisherpolicies/answer/11112688?hl=en)).
4. **Quality signals (shared with the SEO lead).** Noindex and de-sitemap thin templated pages (534 URLs are "Discovered – currently not indexed"). Server-render 300+ words of explanatory text on indexable practice hubs. Put the daily auto-blog through human review, or reduce its cadence: Google treats mass AI pages "without adding value" as scaled content abuse ([spam policies](https://developers.google.com/search/docs/essentials/spam-policies)). Add author bylines.
5. **EEA/UK/CH.** Personalized ads there require a Google-certified CMP using IAB TCF ([13554116](https://support.google.com/adsense/answer/13554116?hl=en)). Our own banner isn't certified. Founder turns on AdSense **Privacy & messaging → European regulations** for those regions only; the non-EU flow stays unchanged.
6. Wait 2 weeks after the deploy. If the status moves to "Needs attention", fix what it lists and click **Request review**. "Getting ready" normally takes days, sometimes 2–4 weeks ([12170222](https://support.google.com/adsense/answer/12170222?hl=en)). robots.txt does not block Mediapartners-Google (checked live).
7. After approval: **manual units only**, one in-article unit on blog/guide pages (already `pages/blog/[slug].js:224`) and one on section lists (`DataTable.jsx:520`). No Auto ads, no vignettes/anchors, and no ads for Pro users.

### 2.2 Checkout changes (code) — see §5.4 for sources
- `checkout.js` `sessions.create`: add `after_expiration: { recovery: { enabled: true, allow_promotion_codes: true } }` and `expires_at: now + 2h`.
- Webhook: on `checkout.session.expired` with a recovery URL, look up the user by `client_reference_id` and send one Resend email ("Your IELTS-Bank checkout is saved, finish in 1 tap"). Send at most one per user per 7 days. Track `recovered_from` on completion.
- Optionally, two `payment_method_configuration`s: one-time (all local methods) and subscription (cards, Link, wallets).
- Pricing page: for PPP/CN/HK visitors, show the Exam Pass first, labelled "One payment · no auto-renewal · UPI / Alipay / cards", and show local-currency prices. Adaptive Pricing handles conversion in Checkout. For the pricing page, either fetch the Stripe-converted amount or show "≈ ₹" as an estimate.
- Exam Pass length 30 → 45 days: a webhook grant constant plus copy. Existing passes keep their windows.
- **Do not** add `payment_method_types` to the session create; it would override the Dashboard's dynamic methods.

### 2.3 Affiliate plumbing (one-time)
- `/go/[program]` redirect route (server) → 302 to the stored affiliate URL. Log `affiliate_click {program, placement, band?, country}` to `activity_events` and GA4. This lets us swap programs without a deploy and keeps affiliate URLs out of page HTML.
- Every outbound affiliate link: `rel="sponsored nofollow noopener"`, plus a one-line disclosure ("We may earn a commission; it doesn't change what you pay"). Add a `/affiliate-disclosure` page linked from the footer.
- Suppress all affiliate and ad placements for users who reached checkout in the last 24h, and on `/pricing`, `/billing/*` and `/dashboard` billing.
- CSP: redirects are server-side, so no new script-src entries are needed. Grow.me would need `script-src` for its domain.

---

## 3. Placement specs (without taking Pro sales)

Principle: **Pro is our highest-value outcome.** A Pro sale is worth $6–50. A tutor referral pays $6–32, and only if the user buys a lesson. Affiliates therefore go (a) where Pro can't help, (b) to users who already paid, or (c) **below** an offer the user has already seen and passed on.

| Surface | Placement | Who sees it | Program | Rule |
|---|---|---|---|---|
| Writing score report (`WritingScoreReport.jsx`) | Text card **below** `ExamPassOffer` and the share row: "Stuck below 6.5? A 30-min lesson with an IELTS tutor can fix Task Response faster." | Overall band **< 6.5**. Free users: only after `ExamPassOffer` rendered and not clicked. Pro users: always. | Preply (fallback italki) | One card, no image, never above the band. Frequency cap: once per 7 days. |
| Writing score report | "Get a human examiner to mark this essay, $19" button next to the report | All scored users; Pro sees "Pro price $15" | Own add-on (item 8) | Sold by us, so it adds to revenue instead of diverting Pro sales. |
| Speaking result + `/speaking` hubs | "Practise speaking live with a tutor" link at the foot of the result, and in the hub sidebar | Result band < 6.5, or hub visitors | Preply/italki | Never inside the examiner flow (`/speaking-examiner`). |
| `/ielts-score-requirements/<country>` | "Next steps for studying in <Country>" box **after** the sourced requirements table, before "Other countries" (~line 255 of `[country].js`) | Everyone | Book test (IDP/BC), Wise, Amber (UK/AU/IE), Insubuy (US), Leverage Edu (only when `x-vercel-ip-country=IN`) | At most 3 links, plus the disclosure line. Keep the existing estimator/calculator CTAs first: they feed Pro. |
| `/ielts-test-format`, estimator result, "how to book" blog posts | "Ready to book? Find a test date" link | Everyone; on the estimator, show when the estimated band ≥ the user's target | IDP / BC referral | Plain link, no banner. The estimator stays ad-free under the current policy, and a referral link is not an ad unit. |
| Blog posts | Existing single AdSense in-article unit, plus **contextual** affiliates only when the topic matches (books → Amazon; "study in UK" → Wise/Amber) | Free users | AdSense + contextual | At most 1 ad unit and 1 affiliate box per post; none above the fold. |
| Question/practice pages, writing checker, pricing, mock, dashboard | **Nothing** | — | — | Keep them clean. These are the Pro funnel and are already ad-free. |

Measure after 30 days: `affiliate_click` by placement, Pro `begin_checkout` rate on the same surfaces before and after (from GA4 ecommerce events), and affiliate network conversions. If writing-report Pro checkouts fall by more than 1 per month, remove the tutor card for free users.

---

## 4. Founder applications checklist

**What every program asks for.** Have these ready once:
- legal name or business entity and address (Canada)
- payout: PayPal and/or CAD/USD bank account
- tax form: **W-8BEN** as an individual or **W-8BEN-E** as an entity, for US-based networks (Impact, CJ, Amazon)
- site URL, and monthly traffic: ~2,300 sessions / ~4.6K users per 90 days, 60% organic plus AI assistants
- audience: international IELTS candidates in SG, HK, IN, VN, BD, CN, US
- promotion method: contextual links on score-requirement pages, score reports and blog
- the `/affiliate-disclosure` URL once it ships
- a line stating we're an independent practice site, not affiliated with IELTS partners

| # | Program | Sign-up URL | Extra info they want | Approval |
|---|---|---|---|---|
| 1 | **Stripe Dashboard** | Settings → Payment methods (review tool: dashboard/settings/payment_methods/review); Settings → Adaptive Pricing; Billing → Customer emails | Confirm a **USD bank or settlement account** exists first (Adaptive Pricing requires the price currency to be a settlement currency; not confirmed for CA accounts). Turn on Link, Apple Pay, Google Pay, Alipay, WeChat Pay, UPI. Turn on "Send a Stripe-hosted link for customers to confirm payments". | None |
| 2 | **AdSense** | adsense.google.com → Sites → ielts-bank.com → Request review (after §2.1 deploy); Privacy & messaging → European regulations | — | Google review, days to 4 weeks |
| 3 | **IDP IELTS Referral Partner** | https://partners.ielts.idp.com/ (also contact a local IDP test centre, per https://ielts.idp.com/article/article-idp-ielts-referral-partner-program) | "As much detail as possible about how you plan to promote IELTS"; countries; site | Reviewed within 48h (per IDP). **Read the trademark caveat first.** |
| 4 | **British Council IELTS Affiliate Programme** | https://takeielts.britishcouncil.org/ielts-partner-organisations/affiliate-programme (country example: https://www.britishcouncil.de/en/exam/ielts/schools-institutions/join-our-ielts-affiliate-programme) | Contact the BC business team in each target country (VN, IN, BD, SG, HK) | Per country; fee not published |
| 5 | **Preply** (Impact) | https://lp.preply.com/affiliate/ | Impact account, promo methods, W-8 | Approval required |
| 6 | **italki** (fallback) | https://www.italki.com/en/affiliates | italki account | Open |
| 7 | **Wise** (Partnerize) | https://signup.partnerize.com/signup/en/wise | Site, traffic; **no paid search on the brand** | Approval required |
| 8 | **Amber student housing** | https://amberstudent.com/partner (program reported on CJ, up to £60 per booking: **unverified**) | CJ publisher account | Approval required |
| 9 | **Insubuy** (Travelpayouts) | https://www.travelpayouts.com/en/offers/insubuy-affiliate-program | Travelpayouts account | Pre-approval, up to 2 weeks |
| 10 | **Leverage Edu** (India only) | https://leverageedu.com/affiliate-partner/ (portal https://ap.leverageedu.com) | Indian audience; lead quality | Portal signup |
| 11 | **Amazon Associates** | US https://affiliate-program.amazon.com/ ; India https://affiliate.amazon.in/ (separate account per store) | Site; needs 3 qualifying sales in 180 days or the account closes | Approval after first sales |
| 12 | **MPOWER Financing partner** (optional, US/CA-bound) | https://www.mpowerfinancing.com/become-a-partner or partnerships@mpowerfinancing.com | Organization partner route; commission not published | Manual |
| 13 | **Grow by Mediavine** (Journey later) | https://grow.me ; requirements https://www.mediavine.com/mediavine-requirements/ | Journey needs 1,000 **Tier-1** sessions in 30 days after Grow has run 30 days | Automatic check |
| 14 | **Human examiner marker** (item 8) | Post on Upwork or IELTS teacher groups | Ex-examiner credentials, 24–48h turnaround, $8–10 per essay, NDA, no claim of official status | Founder interviews |
| 15 | **Teacher seats outreach** (item 11) | Preply/italki IELTS tutor listings, LinkedIn "IELTS trainer" | 1-page offer: $29/mo, 10 student seats, AI marking + dashboard | Founder |

Skip: Ezoic, Monumetric, Raptive, Media.net (not eligible: traffic volume or US/UK/CA share), Adsterra and PropellerAds (brand damage), Carbon (developer audience), Duolingo English Test partner network (pays coupons, not cash), ApplyBoard (a licensed-agent program, not an affiliate program), Prodigy Finance (referral credits only for existing borrowers, and the current offer ends Sep 30, 2026).

---

## 5. Evidence

### 5.1 Ads
| Network | Minimum | Fit | Source |
|---|---|---|---|
| AdSense | none, site review | Only realistic option now | [12170222](https://support.google.com/adsense/answer/12170222?hl=en), [12176698](https://support.google.com/adsense/answer/12176698?hl=en) |
| Journey by Mediavine | 1,000 sessions/30 days **from Tier-1 countries**; Grow first; 70% share; $25 minimum, Net 65 | Not yet | [Mediavine requirements](https://www.mediavine.com/mediavine-requirements/), [Grow on non-WP](https://help.grow.me/hc/en-us/articles/23980633909659) |
| Ezoic | 250K monthly users for new sites (since Feb 19, 2026) | No | [Ezoic KB](https://support.ezoic.com/kb/article/getting-started-ezoics-requirements?id=getting-started-ezoics-requirements&lang=en-US) |
| Monumetric Propel | 10K–80K pageviews, $99 setup | No | [Monumetric](https://www.monumetric.com/propel-payment/) |
| Raptive | 25K pageviews, 50% Tier-1 | No | [SEJ](https://www.searchenginejournal.com/raptive-drops-traffic-requirement-by-75-to-25000-views/558780/) |
| Media.net | majority US/UK/CA traffic | No | [Publift](https://www.publift.com/blog/media-net-vs-adsense-vs-publift) |
| Newor Media Elevate | no minimum, exclusive, needs GAM | Maybe later | [Newor FAQ](https://newormedia.com/elevatefaqs) |
| Carbon | developer audience | No | [Carbon FAQ](https://www.carbonads.net/faq) |
| Adsterra / PropellerAds | none | Avoid (popunders) | [Adsterra](https://adsterra.com/blog/set-up-publishers-dashboard/), [MonetizePros](https://monetizepros.com/ad-network-reviews/propellerads/) |

**RPM.** Published RPM tables are inflated. Relative CPCs from [Partnerkin](https://partnerkin.com/en/blog/articles/adsense_rpm_rates_by_country): US $0.61, SG $0.27, DE $0.22, HK $0.13, CN $0.11, IN $0.07. Conservative page RPM: US $6–12; SG/HK/DE $2–5; IN/VN/BD/CN $0.30–1. For our mix, blended page RPM is **about $1.75–4**. About 70% of pageviews are ad-eligible (practice, Pro and EU-no-consent pages excluded). Result: **$15–34/month now, $75–170/month at 5x**. That equals roughly 2–4 Pro sales, so ads must never displace Pro placements.

Live check (Sep 23): `curl https://www.ielts-bank.com/` and `/blog` show 0 AdSense markers in server HTML. robots.txt allows all Google ad bots.

### 5.2 Affiliates / lead gen (verified Sep 23 unless marked)
| Program | Payout | Cookie | Network | Source |
|---|---|---|---|---|
| IDP IELTS Referral Partner | commission on bookings, rate unpublished; free; content creators and prep websites eligible | — | direct | [IDP article](https://ielts.idp.com/article/article-idp-ielts-referral-partner-program) |
| British Council IELTS Affiliate | referral fee per booking, unpublished | — | direct, per country | [BC](https://takeielts.britishcouncil.org/ielts-partner-organisations/affiliate-programme) |
| Preply | tiered per first paid lesson, $6.49 up to $32.49 (secondary) | 30d | Impact | [Preply](https://lp.preply.com/affiliate/), [getlasso](https://getlasso.co/affiliate/preply/) |
| italki | ≥$10 per new student's first purchase | 30d | direct | [italki](https://www.italki.com/en/affiliates) |
| Cambly Ambassador | $30 once the referral spends $50 | — | direct | [Cambly](https://www.cambly.com/ambassador) |
| Wise | about £10 per personal customer after first transfer (secondary) | 365d (secondary) | Partnerize | [Wise](https://wise.com/gb/affiliate-program/), [wecantrack](https://wecantrack.com/programs/wise-affiliate-program/) |
| Leverage Edu | ₹500 per submitted application, ₹20,000 per enrollment | — | direct, India | [Leverage Edu](https://leverageedu.com/affiliate-partner/) |
| Amber | up to £60 per booking (**unverified**, directory listing) | — | CJ | [postaffiliatepro listing](https://www.postaffiliatepro.com/affiliate-program-directory/amber-student-affiliate-program/) |
| University Living | friend referral £50 only; no website program found | — | — | [UL refer](https://www.universityliving.com/refer-and-earn) |
| Insubuy | up to $150 per purchase | 30d | Travelpayouts | [Travelpayouts](https://www.travelpayouts.com/en/offers/insubuy-affiliate-program) |
| Amazon Associates | US physical books 4.5%; .in about 7% (secondary); since Apr 2026, commission only on the exact linked product | 24h | direct | [rate table](https://affiliate-program.amazon.com/help/node/topic/GRXPHT8U84RAYDXZ) |
| Grammarly | active on Impact; **not recommended** (competes with the checker) | 90d | Impact | [Grammarly](https://www.grammarly.com/affiliates) |
| MPOWER | $300 friend referral; org partner program (unpublished) | — | direct | [MPOWER](https://www.mpowerfinancing.com/become-a-partner) |
| Airalo | up to 10% | — | Impact | [Airalo FAQ](https://www.airalo.com/blog/airalo-affiliate-program-faqs) |
| Prodigy Finance | borrower-only loan credits, offer ends Sep 30, 2026 | — | — | [terms](https://prodigyfinance.com/legal/referral-programme-terms-and-conditions/) |
| DET | Global Partner Network pays coupons, not cash | — | — | [GPN](https://gpn.duolingo.com/register-for-dets-global-partner-network) |
| ApplyBoard | licensed recruitment-agent program only | — | — | [ApplyBoard](https://www.applyboard.com/new_associate) |

Not verified this session: Studyportals, Edvoy (a "become a partner" page exists on [edvoy.com](https://edvoy.com/)), AECC, SI-UK, Casita, Student.com, Udemy, OSHC comparators.

**Market signal.** ieltsonlinetests.com, the largest free IELTS practice site, is owned by InterGreat Education Group and runs study-abroad lead forms ("Free 1-1 consultation") on its own pages ([IOT US study abroad](https://ieltsonlinetests.com/us-study-abroad)). Study-abroad leads are how scale players in this niche make money. At our volume, per-lead programs (Leverage Edu) are the only accessible version.

**$ per 1,000 relevant visitors** (my estimates, assuming 1–3% CTR): test booking $5–20 (fee unknown); Wise $2–10 on country pages; Preply/italki/Cambly $3–6 on writing/speaking results; Leverage Edu $2–10 per 1,000 Indian visitors; Amazon $0.5–2; Airalo $0.5–1. At 2,300 sessions/month, **all affiliate income combined is about $10–40/month**.

### 5.3 Pricing benchmark (live pages Sep 23 unless marked)
| Product | Entry | Monthly | Longer / one-time | Free | Guarantee |
|---|---|---|---|---|---|
| **ielts-bank** | $8.99/mo | $8.99 | $49.99/yr; pass $14.99 for 30d | 1 writing + 1 speaking, lifetime | none published |
| writing9 | $7.99/wk | $14.99 | $29.99/yr | demo only | refund if target missed |
| ielts.international | $2.99 starter (14d) / single essay | $5.99 | **Exam Pass 8 weeks $15** | 1 essay | 14-day refund |
| IELTS Mocks | $8/wk | $20 | passes $10/10d, $25/45d, $40/90d, "does not renew" | Test 1 of each section + full mock | none |
| Engnovate | $11.97/mo | — | 3/6/12 mo $25.97/$44.97/$61.97, all one-time | 2 writing + 2 speaking per month | no refunds |
| Lexibot | $2/mo (billed yearly) | — | all one-time | weekly credits | 7 days |
| IELTS 9 (ielts9.io) | $19.99/mo | $19.99 | $49.99/yr | 3-day trial | — |
| UpScore | $9.99/mo | $9.99 | — | 1 mock | — |
| IOT | $4.99 per AI writing evaluation | — | human marking $19.99 (snippet) | 100+ free tests (ad-funded) | no refund |
| Sprechify | $24.99/mo | $24.99 | $129 30-day, $199/yr; **INR/PKR/NGN/EGP/IDR prices** | none | 30-day |
| Magoosh | $109/1 mo | — | $129 for 6 mo; **accepts Alipay/PayPal** | 7-day trial | 7-day + score guarantee |
| E2 | $75.90 for 90 days | — | $185.90–394.90 | trial | on Bronze+ |
| Cathoven | $21/wk | $67.50 | — | 3/mo (snippet) | "score guarantee" |
| IELTS Science (VN) | ~$2.80/mo in VND | | | yes | 30 days |

Sources: writing9.com, ielts.international/pricing, ieltsmocks.com/pricing, engnovate.com/payment-plans, lexibot.me/pricing, ielts9.io/pricing, upscore.ai/pricing, ieltsonlinetests.com/ielts-writing-ai-examiner-evaluation, sprechify.com/pricing, ielts.magoosh.com/plans, e2language.com/pages/ielts-academic, cathoven.com/pricing, ieltsscience.fun. Human marking: [ieltsanswers](https://www.ieltsanswers.com/writing-correction-ielts.html) $7–9 per task; [ielts-up](https://ielts-up.com/ielts-writing-correction.html) $8.99 per essay (suspended); [TED IELTS](https://ted-ielts.com/writing-correction-service/) not taking bookings; [IELTS Liz](https://ieltsliz.com/ielts-essay-correction/) not offered.

**Takeaways.**
- Our monthly price is mid-market. Our annual price is fine.
- Our free tier is the stingiest we found, and our pass is short for the money (30 days vs 45–56 days at about $15).
- Pure-AI competitors lean toward **non-renewing passes**.
- RevenueCat's 2026 Education report: median monthly $9.99, annual $39.99; India/SEA pay about 45–50% of North American prices and convert at 1.4% vs 2.6% ([RevenueCat](https://www.revenuecat.com/state-of-subscription-apps-2026-education)).
- Guarantee lift evidence is weak, from vendor A/B posts only. Test a 7-day refund, don't assume it lifts conversion. Baymard: 13% of shoppers abandon over an unsatisfactory returns policy.

### 5.4 Why checkout abandons, and which Stripe methods to enable
Observed: 7 genuine sessions from Sep 7–17 produced 1 paid and 6 expired (4 monthly, 2 annual, 1 pass). The PPP $3.99 renewal declined `card_declined / transaction_not_allowed` on Sep 1, 4 and 7 (`stripe.json` → `recentFailedCharges`), which is the Indian recurring-card pattern. Checkout does not pass `payment_method_types`, so the Dashboard's dynamic methods apply (`checkout.js:392-404`). Every price is USD.

| Method | Canadian account? | Currency | Recurring? | Buyers | Action |
|---|---|---|---|---|---|
| Cards | yes | USD etc. | yes | all | baseline |
| Apple Pay / Google Pay | yes | most | yes | mobile, all | toggle |
| Link | yes | most | yes | all except India | toggle |
| **Alipay** | yes | CNY, CAD, **USD** | **no** | CN/HK/overseas Chinese | toggle → pass only |
| **WeChat Pay** | yes | CNY/CAD only (not USD) | no | CN | toggle + Adaptive Pricing |
| **UPI** | yes | **INR only** | UPI AutoPay (INR), but cross-border subscriptions under Adaptive Pricing are cards/Link/wallets only | IN | toggle + Adaptive Pricing, so pass-first for India |
| PayNow / GrabPay / FPX / PromptPay | **no** (local businesses only) | — | — | SG/MY/TH | not possible |
| PayPal via Stripe | **no** (EU/UK/CH businesses) | — | — | — | not possible |
| Korean cards / Kakao / Naver | no | — | — | KR | — |

Sources: [payment method support](https://docs.stripe.com/payments/payment-methods/payment-method-support), [Alipay](https://docs.stripe.com/payments/alipay), [WeChat Pay](https://docs.stripe.com/payments/wechat-pay), [UPI](https://docs.stripe.com/payments/upi), [UPI AutoPay](https://docs.stripe.com/payments/upi/upi-autopay), [PayNow](https://docs.stripe.com/payments/paynow), [PayPal](https://docs.stripe.com/payments/paypal).

**Adaptive Pricing** ([docs](https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing?payment-ui=stripe-hosted), [FAQ](https://support.stripe.com/questions/adaptive-pricing)):
- Local-currency prices in 150+ countries.
- The merchant pays 0%; the buyer pays a 2–4% FX spread.
- Off by default for Checkout.
- Cross-border subscriptions are GA.
- It is what unlocks UPI, WeChat Pay and similar methods for USD prices.
- Stripe's 1.5M-session subscription test: **+4.7% conversion, +1.9% authorization, +5.4% LTV per session** ([Stripe blog](https://stripe.com/blog/adaptive-pricing-for-subscriptions)).
- It is skipped for any currency already defined in a price's `currency_options`. Use that route only if we want exact PPP numbers such as ₹399.

**India recurring** ([Stripe India recurring](https://docs.stripe.com/india-recurring-payments?integration=subscriptions), [RBI FAQ](https://support.stripe.com/questions/rbi-e-mandate-regulations-faqs)):
- An e-mandate with 3DS at setup is required, plus a 24h pre-debit notice; Stripe charges 26h after the notice.
- **Renewals are attempted only once.**
- Issuers may not support non-INR mandates. Without a mandate, renewals decline.
- New Indian cards ship with international and online use off by default (RBI 2020, via [Business Standard](https://www.business-standard.com/amp/article/news-cm/rbi-to-allow-only-domestic-transactions-at-atms-and-pos-terminals-in-india-at-time-of-issuance-reissuance-of-card-120011600289_1.html)).
- Under RBI's authentication directions, from **Oct 1, 2026** issuers should validate extra authentication (AFA) on cross-border non-recurring payments ([Khaitan summary](https://www.khaitanco.com/thought-leadership/RBI-Authentication-Mechanisms-for-Digital-Payments-Transactions-Directions)). Leave 3DS/Radar defaults on.

Taken together, **one-time pass + UPI** is the Indian buyer's path of least resistance.

**China.** Alipay and WeChat hold over 94% of payment volume ([Fabrick](https://www.fabrick.com/en-gb/insights/blog/digital-payments-in-china/)). Card-only checkout largely fails for mainland buyers. Magoosh already takes Alipay.

**Abandonment benchmarks** ([Baymard](https://baymard.com/lists/cart-abandonment-rate)): 70% average. Of those who abandon (excluding browsers): 19% don't trust the site with card details, 10% had a card declined, 9% found too few payment methods.

**Recovery** ([abandoned carts](https://docs.stripe.com/payments/checkout/abandoned-carts?payment-ui=stripe-hosted), [promo consent](https://docs.stripe.com/payments/checkout/promotional-emails-consent?payment-ui=stripe-hosted)):
- The recovery URL is valid for 30 days, and we send the email ourselves.
- Stripe's `consent_collection.promotions` is US-business-only, so match `client_reference_id` to our own logged-in user instead.
- CASL treatment of a transactional "finish your checkout" email is unverified. Founder to confirm the wording.

**Merchant-of-record alternatives, later:**
- Stripe Managed Payments: +3.5%, UPI recurring supported, China restricted ([pricing](https://support.stripe.com/questions/managed-payments-pricing)).
- Paddle: about 5% + 50¢; Alipay, UPI, WeChat and PayPal, with subscriptions ([Paddle methods](https://developer.paddle.com/concepts/payment-methods/overview)).

Only worth considering if items 1–3 don't lift checkout completion above 35% within 28 days.

### 5.5 Other revenue: what's realistic at our scale
- **Human examiner review (item 8):** a proven price point ($7–20 per task, [IOT $19.99 snippet], ieltsanswers $7–9) with a supply gap, since several providers have paused. It is sold to our own users, so no traffic growth is needed. Risk: marker quality and turnaround. Start with one marker and a 48h SLA.
- **B2B tutor/school seats (item 11):** competitors (ielts.camp, UpScore, Speechful) sell school plans but don't publish prices ([ielts.camp](https://ielts.camp/)). It's realistic only as founder-led manual sales to independent tutors first. No engineering before 2 paying tutors.
- **Sponsored placements / newsletter sponsorship:** newsletters under 5K subscribers get $50–250 per placement, value-priced ([Paved](https://www.paved.com/blog/newsletter-sponsorship-rates/), [destinicopp](https://www.destinicopp.com/blog/what-to-charge-newsletter-sponsorship)). We have no regular send and an unknown list size. **Not now.** Revisit once the weekly progress email has 1,000+ engaged recipients. A sponsored study-abroad slot on the country pages is possible later, but at ~2.3K sessions/month no sponsor will pay a meaningful amount.

### 5.6 Assumptions and unknowns
- The test-booking referral fee is unknown. Ask IDP/BC before building.
- Whether a Canadian Stripe account has USD as a settlement currency (needed for Adaptive Pricing on USD prices) is unconfirmed. Founder checks Balances.
- Human share of "Direct"/SG/HK/US traffic is unknown (bots likely), so ad and Tier-1 estimates may be high.
- Affiliate $/1k figures are my estimates, not measured. Re-rank after 30 days of `affiliate_click` data.
- Do not change the PPP country list, prices, or Stripe config from code; the founder runs any Stripe or migration scripts.
