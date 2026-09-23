# Affiliate setup (Sep 23, 2026)

Implements actions #7 (tutor CTA) and #9 ("next steps" on score-requirement pages), plus the Amazon books module (#10), from `20-MONETIZATION-PLAN.md`.

**Everything is off until you add a URL.** A program with no `AFFILIATE_URL_*` env var, or with a value that isn't an absolute `https://` URL, is disabled. `/go/<id>` returns 404 for it and no placement renders it.

## How it works

- **Registry:** `lib/affiliates.js` holds the id, label, disclosure text, allowed visitor countries and env var for each program.
- **Redirect:** `pages/go/[program].js` sends a 302 to the configured URL. Unknown or disabled programs return 404. Every response carries `X-Robots-Tag: noindex, nofollow` and `Cache-Control: private, no-store`. `/go/` is disallowed in `public/robots.txt`.
- **Links:** placements only link to `/go/<id>?placement=<placement>`. Links use `rel="sponsored nofollow noopener"` and open in a new tab. The real affiliate URL never appears in page HTML, so you can swap a program by changing one env var.
- **Enabled list for the browser:** at build time, `next.config.js` puts the list of configured program **ids** (never the URLs) into `process.env.AFFILIATE_PROGRAMS_ENABLED`. Client components read that list. **Adding or changing an env var takes effect only after a redeploy.**
- **Tracking:**
  - Clicking a link fires `affiliate_click` `{program, placement, page, …}` through `track()`. That is the existing consent-gated pipeline: `/api/track` → `activity_events`, plus GA4.
  - Each rendered unit fires `affiliate_impression` `{programs, placement, page}` once, so CTR can be measured per placement.
  - `/go` also writes one PII-free log line (`affiliate_redirect {"program","placement"}`) to Vercel runtime logs. It doesn't depend on consent, so it works as a backstop.
- **Who sees placements:** placements render only in the browser, only after auth **and** plan have loaded, and never for Pro users. Each placement has a path allowlist (`AFFILIATE_PLACEMENTS`). Nothing can render on practice, mock, pricing, billing, dashboard, checkout, estimator, writing-checker or examiner screens.
- **Disclosure:** every unit shows a one-line disclosure: "We may earn a commission if you sign up or buy through this link. It doesn't change what you pay." Amazon uses its required statement instead ("As an Amazon Associate we earn from qualifying purchases."). IDP and BC add a non-affiliation line.

## Env vars (Vercel → Project → Settings → Environment Variables, Production)

| Program | Env var | Where it appears | Visitor countries |
|---|---|---|---|
| Preply | `AFFILIATE_URL_PREPLY` | Tutor card on the free writing and speaking score reports (`/writingquestion/<id>`, `/speakingquestion/<id>`) | all |
| italki | `AFFILIATE_URL_ITALKI` | Same card. Shown only when Preply is **not** configured | all |
| Wise | `AFFILIATE_URL_WISE` | "Next steps after your score" box on all 10 `/ielts-score-requirements/<country>` pages | all |
| Amber | `AFFILIATE_URL_AMBER` | Same box, on the UK, AU, CA, US, IE and NZ pages only | all |
| Insubuy | `AFFILIATE_URL_INSUBUY` | Same box, on the US page only | all |
| Leverage Edu | `AFFILIATE_URL_LEVERAGE_EDU` | Same box, first position. Shown only to visitors in India, detected by the `ib_country` cookie that the middleware sets from `x-vercel-ip-country`. Hidden when geo is unknown | **IN only** |
| Amazon (Cambridge IELTS books) | `AFFILIATE_URL_AMAZON_CAMBRIDGE_BOOKS` | Books box on blog posts tagged `books` / `study-plan` / `resources` / `self-study`, or whose slug contains `study-plan`, `practice-resources`, `book(s)` or `cambridge-ielts`. Currently: the 7-day and 30-day study plans and the free-resources list | all |
| IDP test booking | `AFFILIATE_URL_IDP_BOOKING` | **Not placed yet.** `/go/idp-booking` works once set. Read the trademark caveat in the plan (item 6) before applying | all |
| British Council test booking | `AFFILIATE_URL_BC_BOOKING` | **Not placed yet.** Same as IDP | all |

Value format: the full tracking URL from the network, e.g. `https://preply.com/en/?pref=XXXX`. It must be `https://`. Leading and trailing whitespace is ignored.

### Placement rules (enforced in code)

- **Tutor card** (`src/components/affiliates/TutorCta.jsx`):
  - Free users only, overall band **< 6.5**.
  - Renders only on the free-preview report, **below** the Exam Pass/Pro offer (and, for writing, below the share row).
  - At most once per 7 days per browser (`localStorage` key `ib_aff_tutor_last`).
  - Not on the writing checker, the estimator or the pricing sample.
- **Next steps box** (`src/components/affiliates/ScoreNextSteps.jsx`):
  - Sits after the sourced tables and the estimator/calculator CTAs, before the FAQ.
  - Shows at most 3 links.
- **Books box** (`src/components/affiliates/CambridgeBooksBox.jsx`):
  - Sits below the article and the practice-feedback CTA.
  - One per post, never above the fold.
  - To add it to another post, add `tags: ["study-plan"]` (or `books`) to the post's frontmatter.

## Verify after adding a URL

1. Redeploy. Env changes only reach the client bundle on a new build.
2. `curl -sI https://www.ielts-bank.com/go/<id>` should return `302`, a `Location:` header with your URL, and `X-Robots-Tag: noindex, nofollow`. An unconfigured id returns `404`.
3. Open the surface in a private window, signed out:
   - Wise and Amber: `/ielts-score-requirements/united-kingdom`.
   - Insubuy: `/ielts-score-requirements/united-states`.
   - Books: `/blog/ielts-30-day-study-plan`.
   - Tutor: submit a writing or speaking answer on a free account and get a band < 6.5. The card appears under "Your next step".

   Check that each link's `href` is `/go/<id>?placement=…` and its `rel` is `sponsored nofollow noopener`.
4. Leverage Edu: visit a country page from India, or on a preview deployment set the `ib_country=IN` cookie in DevTools and reload.
5. Sign in as a Pro user. None of the units should render.
6. Click a link, then check the `/data` dashboard or `select * from activity_events where event in ('affiliate_click','affiliate_impression') order by created_at desc limit 20;`. Also check Vercel runtime logs for `affiliate_redirect`.
7. To switch a unit off, delete the env var and redeploy. `/go/<id>` returns 404 and the unit disappears.

## Measure (30 days after going live)

Compare `affiliate_click` by `placement` with the Pro `begin_checkout` rate on the writing and speaking reports, before vs after. If writing-report Pro checkouts drop by more than 1 a month, unset `AFFILIATE_URL_PREPLY` / `AFFILIATE_URL_ITALKI` (plan §3).

## Not done here

- **Grow by Mediavine (plan item 12): skipped.** It needs a site id from a founder signup, new CSP `script-src`/`connect-src`/`frame-src` entries for Grow's domains (not verified here), and its own consent gate alongside the AdSense loader. It's not trivial enough to ship blind. Add it once the founder has the Grow site id and the domain list from Grow's install page, using the same pattern as `syncAdSenseScript` in `src/lib/adsenseLoader.js`.
- **`/affiliate-disclosure` page and footer link (plan §2.3).** Every unit already carries an inline disclosure. Add a standalone page before applying to programs that ask for a disclosure URL.
- **Suppressing units for 24h after a user reaches checkout (plan §2.3).** Not implemented. Placements are already absent from pricing, billing, checkout and dashboard, and from all Pro users.
- **Test-booking (IDP/BC) placements.** Registry entries only, pending the founder's decision on trademark exposure.
