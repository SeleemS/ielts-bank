# 30: Technical SEO changes (Sep 23, 2026)

Owner: tech-SEO engineer. Branch: `worktree-agent-ae8bcc3705af32bd2`, based on `growth/sep23` (= origin/main at `2fe6217`). Nothing has been pushed.
Inputs: `00-DATA-BRIEF.md`, `10-SEO-STRATEGY.md` (PM asked me to prioritise its §1, §4, §5 and §6), a full crawl of the 634 live sitemap URLs on Sep 23, and a crawl of the production build of this branch that follows `<a href>` links only (no JS).

## Result

| Metric | Live site (Sep 23) | This branch (production build) |
|---|---|---|
| Sitemap URLs | 634 in one `urlset` | 589 across a sitemap index plus 6 child sitemaps |
| Sitemap `lastmod` | 83 static URLs stamped with *today* on every request; 450 question URLs undated | Real content dates only; static pages undated; no invented dates |
| Sitemap URLs reachable from `/` via `<a href>` | 121 unreachable, 82 at depth 4–5 | **All 589 at depth ≤ 2** (45 at depth 1) |
| Sitemap URLs with 0 inbound links | 70 (67 Writing questions) | **0**. Writing questions now have 7 to 10 inbound links each |
| Broken internal links (404) | 1 (`/ielts-writing-task-2-topics`) | **0** out of 608 crawled pages |
| Internal links that land on a redirect or an alternate URL | ~190 (slug links to legacy-canonical pages) | **0** |
| Duplicate URL pairs (legacy id and slug, both 200) | 50 | 0: legacy URLs now 308 to the slug |
| Pages in the sitemap that are noindex | 0 | 0 (verified on all 589) |
| Invalid JSON-LD blocks | 0 | 0 (all 589 parsed) |
| References to the apex domain in HTML | 0 | 0 |

## Apex → www check

- `https://ielts-bank.com/<path>` returns **308** to `https://www.ielts-bank.com/<path>` and keeps the query string. Confirmed on `/`, `/blog`, `/readingquestion/abc?x=1`.
- `http://ielts-bank.com/` returns 308 to `https://ielts-bank.com/`, then 308 to www. That is two hops. Vercel adds the HTTPS upgrade before the domain redirect and our code cannot change it. It is harmless: both hops are permanent.
- `http://www…` returns 308 to `https://www…`, and a trailing slash returns 308 to the no-slash URL.
- Every canonical, `og:url`, sitemap `<loc>` and JSON-LD URL uses `https://www.ielts-bank.com` (`lib/site.js`). A crawl of all 589 pages found no apex reference. There are no hreflang tags because the site is English only, which is correct.
- The apex clicks in GSC (64) are users arriving from old links or bookmarks. Google has the www URL as canonical, so no action is needed.

## Commits

1. `2b74b4d` **Canonicalise question URLs to clean slugs and spread related links.** Adds `lib/questionUrls.js`. Legacy URLs 308 to the slug, three duplicate prompts are retired, the Task 2 404 is fixed, and related practice now uses a ring.
2. `e06caf2` **Noindex thin mock, topic-hub and fallback-month pages.** Adds `lib/indexability.js`.
3. `15ec222` **Split the sitemap into per-type sitemaps with real lastmod.** Adds `lib/sitemap.js`, `lib/sitemapData.js` and `pages/sitemap-*.xml.js`.
4. `f023b40` **Merge 23 hub-duplicating blog posts into their hubs.** Adds `lib/blogMerges.json` and the redirects in `next.config.js`. `/index` now 308s to `/`.
5. `788be1f` **Name the AdSense crawlers in robots.txt.**
6. `75c0603` **Keep the sitemap renderer out of page modules.** This fixes a client-bundle `fs` build error introduced by commit 3.
7. `5f3ac67` **Put every indexable page within two clicks of the home page.** Covers the footer directory, full hub lists, the home directory, question breadcrumbs and context links.
8. `6a13f76` **Add related guides and breadcrumbs to blog posts.**
9. `d6ebfa1` **Describe the writing checker as a WebApplication; load logo eagerly.**
10. `4fab924` **Ping IndexNow with changed URLs after each production deploy.**

Tests: 1,774 passed and 2 skipped across 170 files (1,724 before). 50 tests are new, in 9 new test files and 4 extended ones. `npm run lint` passes with one warning that already existed in `pages/speaking-examiner.js`. `npx next build` passes.

---

## 1. Crawl findings and fixes at source

| Finding (live) | Fix |
|---|---|
| `/ielts-writing-task-2-topics` linked `/writingquestion/should-university-education-be-free-for-everyone-p5ttxn`, which is a **404**. The curated slug was missing its `ielts-writing-task-2-` prefix. | Corrected the slug. A new test checks that every curated slug on that page exists in `lib/task2Prompts.js`. |
| 50 passages had two live URLs: the legacy Firestore id (`/writingquestion/Computer%20Games%20vs%20Sports`, `/readingquestion/IXAmkcfLtFLibCSJjZLv`) and the slug. Reading slugs were canonicalised to the legacy URL. **Writing had two self-canonical duplicates**, because the canonical used the raw route param. Internal links (related cards, Task 2 pages) pointed at the slug, while the sitemap and canonical pointed at the legacy URL. This caused GSC's "Alternate page with proper canonical tag" count of 50. | Per strategy §4: **the slug is canonical everywhere**, and the legacy URL **308s** to it from `getStaticProps`. This works for any legacy id without a hard-coded list. Only slugs are pre-rendered. Every link builder goes through `questionPath()`. Full mapping in the appendix. |
| 3 Writing prompt pairs were exact duplicates, with identical prompt text confirmed in the DB. | The retired twin 308s to the kept one and is left out of hubs, related links, month pages and the sitemap. See the table below. |
| `/index` returned 200 as a duplicate of `/`. | It now 308s to `/`. |
| The sitemap stamped 83 static URLs with today's date on every fetch and gave question pages no lastmod. | See §3. |
| No 5xx responses on any sitemap URL. Every sitemap URL returned 200, with TTFB 43–334 ms (edge HIT). | GSC's "3 × 5xx" and "4 × 404" are older URLs that no longer appear in the sitemap or in links. See the GSC follow-ups. |

### Retired duplicate prompts (`lib/questionUrls.js` `RETIRED_DUPLICATE_QUESTIONS`)

| Retired (308) | Kept |
|---|---|
| `/writingquestion/learning-a-language-xbqoua` (+ legacy `Learning%20a%20Language`) | `/writingquestion/learning-a-foreign-language-19xpmz` |
| `/writingquestion/opportunity-of-wealth-54ayk6` (+ `Opportunity%20of%20Wealth`) | `/writingquestion/the-purpose-of-wealth-1i3c20` |
| `/writingquestion/recycling-at-home-1hqf94` (+ `Recycling%20at%20Home`) | `/writingquestion/recycling-regulation-192dud` (its title matches the prompt, which is about laws) |

Do **not** archive these rows in the database unless you also add static redirects. The redirect runs after the passage lookup, and an archived row is invisible to the anon key, so its URL would return 404 instead of 308.

## 2. Crawl budget and thin content (every decision)

Rules live in `lib/indexability.js`. The pages and the sitemap both call the same functions, so they cannot disagree. Every noindexed page uses `noindex, follow`, stays linked from its hub, and returns to the index automatically once its data changes.

| Template | URLs | Evidence | Decision |
|---|---|---|---|
| `/mock/<slug>` | 7 | 24–29 visible words: a Premium shell with a title, one line and a skeleton. The 7 pages are near-identical. | **noindex** and removed from the sitemap. `/mock-test` (the hub) stays indexed. |
| `/speaking/topics/<family>` with fewer than 3 cue cards | 12: objects (2), technology (2), travel (2), events, activities, work-study, food, money, culture (1 each), nature, health, future-plans (0) | A heading, a stock paragraph and 0–2 links | **noindex** and removed from the sitemap until the family has at least 3 cards. The strategist's list of 12 matched this rule exactly. |
| `/speaking/topics/<family>` with 3 or more cards | 4: people (10), experiences (10), places (4), media (3) | Real collections | Kept |
| `/ielts-writing-task-2-topics/<month>` in "recent" fallback (no prompts added that month) | 0 today | A near-copy of the previous month | **noindex** for *past* months only. **Deviation from strategy §6:** the *current* month stays indexable even in fallback, because `/…/september-2026` earned 17 GSC clicks (one of the top 5 pages) and the page fills up as prompts are added. When October starts, September will drop out automatically if it is still "recent". |
| 23 blog posts that duplicate a hub (strategy §B3) | 23 | Each competed with the hub that targets the same query | **308 to the hub** and the post file is removed. Table below. Links to them inside other posts are rewritten to the hub at render time. The post sources are unchanged, and a test guards that. |
| 2 essay-bank posts (`ielts-essay-bank-guide`, `ielts-writing-bank-tips`) | 2 | | **Left alone**, per the PM. The essay-bank agent redirects them to `/ielts-essay-bank`. |
| `/speaking-examiner` (193 words), `/contactus` (55), listening questions (216–379) | | Thin in HTML, but a product page, a trust page, and pages another agent is enriching with transcripts and answers | Kept as they are |
| Speaking topic hubs 118–223 words (my first crawl) | | The first counter stripped `<header>`, where these pages put their H1 and answer capsule. Re-counted at 218+ words | No extra change beyond the card-count rule |

### Blog merges (`lib/blogMerges.json`)

| Post slug (308) | Merged into |
|---|---|
| ielts-reading-true-false-not-given | /reading/true-false-not-given |
| ielts-reading-yes-no-not-given | /reading/yes-no-not-given |
| ielts-reading-matching-headings | /reading/matching-headings |
| ielts-reading-matching-information | /reading/matching-information |
| ielts-reading-matching-features | /reading/matching-features |
| ielts-reading-multiple-choice | /reading/multiple-choice |
| ielts-reading-short-answer-questions | /reading/short-answer |
| ielts-reading-sentence-completion | /reading/sentence-completion |
| ielts-reading-matching-sentence-endings | /reading/matching-sentence-endings |
| ielts-reading-flow-chart-completion | /reading/flow-chart-completion |
| ielts-reading-summary-note-table-completion | /reading/summary-completion |
| ielts-listening-section-1-strategy … -4-strategy | /listening/part-1 … /listening/part-4 |
| ielts-speaking-part-1-answers | /speaking/part-1 |
| ielts-speaking-part-2-cue-card | /speaking/part-2 |
| ielts-speaking-part-3-discussion | /speaking/part-3 |
| ielts-writing-band-descriptors, ielts-speaking-band-descriptors | /ielts-band-descriptors |
| ielts-score-requirements-uk-universities | /ielts-score-requirements/united-kingdom |
| ielts-score-requirements-canadian-universities | /ielts-score-requirements/canada |
| ielts-band-score-calculation | /band-calculator |

**Content follow-up (not done here):** the strategist suggested moving each post's worked examples into its hub. The removed posts are still in git history (`git show f023b40^:content/posts/<slug>.md`). Also point the daily blog routine away from these slugs so it does not recreate them. A test fails if a merged slug is published again.

## 3. Sitemap

- `/sitemap.xml` is now a **sitemap index** of `/sitemap-guides.xml`, `-blog`, `-reading`, `-writing`, `-listening` and `-speaking` (strategy §5). Each `<sitemap>` carries the newest real lastmod of its URLs. On this build that is 26 + 79 + 181 + 158 + 51 + 94 = 589 URLs.
- **lastmod sources:** question pages use the passage row's `updated_at`. Blog posts use `updated || date`. Skill hubs use their newest item's `created_at`. Speaking part and topic hubs use their newest card. Month pages use the roundup's `dateModified`. Static pages and type hubs have **no lastmod**, which is honest, where a fake date teaches Google to ignore the field. Dates are clamped so they are never in the future.
  - Caveat: the `attempts` band-stats trigger also bumps `passages.updated_at` when someone submits an answer. A popular passage can therefore show a newer lastmod than its content. This is minor and self-limiting. A clean fix needs a `content_updated_at` column, which would be a DB migration, so it is not done here.
- Only canonical www slug URLs are listed. Noindex pages, retired duplicates, merged posts and mock tests are excluded, and duplicates are merged. Responses are edge-cached (`s-maxage=3600, stale-while-revalidate=86400`).
- **For other agents adding URLs:** a new static page is **one line in `STATIC_ROUTES`** (`pages/sitemap.xml.js`, left in place so additive edits merge cleanly). `sitemapSectionFor()` routes it by path, and `/ielts-essay-bank*` already maps to the writing sitemap. A new *data-driven* page type gets a loader in `SECTION_LOADERS` (`lib/sitemapData.js`). New pages also belong in the footer or home directory (`src/components/Footer.jsx`, `lib/siteDirectory.js`) and, if they should not show ads, in the AdSense exclusion regex (`src/lib/adPolicy.js`). I added no new HTML routes. The new `/sitemap-*.xml` routes return XML, not app pages.

## 4. Internal linking

- **Footer site directory on every page:** Practice (4 skills, mock tests, new cue cards), Tools (estimator, checker, calculator, speaking examiner, pricing), Guides (test format, band descriptors, score requirements, Task 2 topics, IELTS vs TOEFL/PTE/Duolingo, checker accuracy, blog), Resources, Legal, and a row of the 7 Listening and Speaking part guides. The link list is hard-coded, so no guide content ships in the shared bundle. **Reading, Writing and Listening question pages had no footer before**, which is why they had only 12 links each.
- **Section hubs** (`/readingquestion`, `/writingquestion`, `/listeningquestion`): a server-rendered "All N … practice questions (A–Z)" list of every item sits below the paginated table (strategy §1). It is inside `<details>`, but every `<a href>` is in the initial HTML. The Listening hub gained Part 1–4 chips and the Writing hub gained guide and tool chips. `/speakingquestion` already listed everything.
- **Home:** a "Browse the question bank" directory with every Reading question-type hub, Listening and Speaking parts, the Writing hubs and the guides (strategy §1). It is built in `getStaticProps` (`lib/siteDirectory.js`) so the large guide modules stay server-side. Result: 45 URLs at depth 1.
- **Question pages** (all 4 skills): visible breadcrumbs (Home › IELTS Reading › title), which match the existing BreadcrumbList JSON-LD. There is also a **"Guides and tools"** block of 4–6 contextual links: the passage's question-type guides, its Listening part, the band calculator, the checker, band descriptors and the hub. **Related practice** now shows 6 items, chosen as the ring of items that follow the current one in its type list. It used to show the alphabetically first 3, so one composting passage had about 160 inbound links while 67 Writing pages had none. Every question now has at least 4 inbound links.
- **Blog posts:** Home › Blog › post breadcrumbs with BreadcrumbList JSON-LD, plus "Related guides": the 5 most similar posts (shared tags, then same skill, then title overlap) and the post's skill practice hub.
- **Cue cards:** these already had part and family links. They now also get breadcrumbs, 6 related items and context links.

## 5. Structured data audit (all 589 pages parsed; 0 invalid)

| Template | Types | Change |
|---|---|---|
| `/` | Organization (logo) + WebSite | Already fine. No `SearchAction`, because there is no site search. |
| `/blog/*` | Article + **BreadcrumbList** (+ FAQPage when the post has visible FAQs) | BreadcrumbList added |
| `/ielts-writing-checker` | FAQPage + **WebApplication** (SoftwareApplication subtype: category, features, free-sample `Offer`) | Added. **No `aggregateRating`**, because we have no genuine ratings. Google's software-app rich result needs a rating, so this is for entity understanding, not a rich result. |
| Question pages | LearningResource + BreadcrumbList | Unchanged. **Quiz schema deliberately not added:** answers are hidden until submit, and Quiz markup must describe visible Q&A. Revisit once the answers agent ships visible answers (strategy §3). |
| Hubs, guides, calculators | FAQPage / CollectionPage / TechArticle, all mirroring visible content | Unchanged |

## 6. IndexNow

It was already set up on Aug 2 (key file `public/01984fdbff8e84fd2dcbf3a29275d300.txt` and the manual `scripts/indexnow-ping.mjs`, which pings the whole sitemap), but there was **no automatic ping**. New:

- `scripts/seo/indexnow-submit.mjs` submits only changed URLs. It combines (a) files in a git range (posts, static pages, blog-merge redirects) and (b) sitemap URLs whose `lastmod` is on or after a date. Source (b) covers database content that never appears in git.
  ```bash
  node scripts/seo/indexnow-submit.mjs --dry-run                         # default: --git-range HEAD~1..HEAD --since yesterday
  node scripts/seo/indexnow-submit.mjs --since 2026-09-01 --dry-run      # bulk content change
  node scripts/seo/indexnow-submit.mjs /ielts-essay-bank /blog/new-post  # explicit URLs
  node scripts/seo/indexnow-submit.mjs --all                             # full resubmit (rarely)
  ```
- `.github/workflows/indexnow.yml` runs it on every **successful Vercel Production `deployment_status`** event. It needs no secrets because the key is public. **Founder:** after merging, check the Actions tab once after the next deploy. If Vercel's GitHub deployment events are turned off, run the script by hand instead. Google ignores IndexNow; for Google, use the GSC steps below.
- **Run once after this branch deploys:** `node scripts/seo/indexnow-submit.mjs --all`, because every URL's canonical, links or status changed.

## 7. Core Web Vitals sanity (home, writing checker, reading question, blog post)

- The PageSpeed Insights API quota was exhausted (shared keyless quota), so there is no lab or field score. Checked by hand instead:
  - TTFB 43–334 ms, and every template is ISR or SSG with edge HIT.
  - One CSS file and self-hosted Inter (`display: swap`, preloaded), so no render-blocking third-party resources. GA and AdSense load only after consent.
  - LCP element on home is the H1 text. No image LCP on any of the 4 templates.
  - CLS measured 0 in the browser on home and the reading page (desktop, before ads).
- Fixed: the navbar logo, which is always above the fold, now loads eagerly instead of lazily.
- **Follow-ups (not "obvious wins", left alone):**
  - (a) `AdUnit` renders nothing until the plan check resolves, then inserts a `min-h-[100px]` block. Once AdSense is approved, that is a CLS source wherever an ad sits inside the first viewport. Reserve the slot for anonymous users when ads go live.
  - (b) Shared first-load JS is 177 kB (Supabase auth client in `_app`). Worth a bundle review.
  - (c) Re-run PSI after the quota resets: `https://pagespeed.web.dev/analysis?url=https://www.ielts-bank.com/`.

## 8. robots.txt

Added an explicit `User-agent: Mediapartners-Google` / `Google-Display-Ads-Bot` → `Allow: /` group. Both were already allowed through `*`, which blocks only `/dashboard`, `/api/` and `/auth/`, but the explicit group means no future wildcard rule can block the AdSense review. `Sitemap:` still points to `/sitemap.xml` (now the index).

---

## GSC follow-ups for the founder (after deploy)

1. **Sitemaps:** resubmit `https://www.ielts-bank.com/sitemap.xml` (now an index). Also submit each child (`/sitemap-guides.xml`, `-blog`, `-reading`, `-writing`, `-listening`, `-speaking`) so the Pages report can be filtered per sitemap. That per-sitemap filter is how to measure indexing by type (strategy targets 103 → 350 → 450).
2. **Page indexing → "Not found (404)"** (4): open the list. The known one (Task 2 topics link) is fixed. Any merged blog slug should now 308. Press **Validate fix**.
3. **"Server error (5xx)"** (3): no sitemap URL returns 5xx today. Inspect the 3 URLs. If they are old or transient, press **Validate fix**.
4. **"Alternate page with proper canonical tag"** (50) and **"Page with redirect"** (9): these are informational. The 50 legacy and slug pairs will move into "Page with redirect" (the legacy URLs) while the slug URLs get indexed. No action beyond **Validate fix** on "Duplicate…" or "Alternate…" if GSC offers it.
5. **"Discovered – currently not indexed"** (534) and **"Crawled – currently not indexed"** (5): press **Validate fix** about a week after deploy, once Google has recrawled the hubs. Then use **URL Inspection → Request indexing** for about 10 URLs a day, hubs first: `/writingquestion`, `/readingquestion`, `/listeningquestion`, `/speakingquestion`, `/reading/*`, `/listening/part-*`, `/ielts-writing-task-2-topics`, then a handful of Writing questions.
6. **Excluded by 'noindex' tag** will newly show 7 mock pages and 12 topic hubs. This is expected; do not "fix" it.
7. **Bing Webmaster Tools** (open since Aug 2): verify, import from GSC and submit the sitemap index. Then run `node scripts/seo/indexnow-submit.mjs --all` once.

## Deviations from `10-SEO-STRATEGY.md`, and items outside my lane

- The current Task 2 month stays indexable even in fallback, because it earns clicks (see §2).
- The topic-hub threshold is "3 or more cards" (it catches exactly the 12 listed). Hysteresis ("noindex at ≤2, re-index at ≥5") would need stored state.
- Redirects are 308 (Next.js `permanent`), not 301. Google treats both as permanent.
- **Not done, owned by other agents:**
  - `/ielts-essay-bank` and the redirects of its two posts
  - answers and transcripts in server HTML (§3)
  - retitling Writing pages as "sample essay"
  - splitting the checker into 3 pages (§7)
  - the cue-card 2026 hub (§9)
  - retargeting the blog routine (§8)
- **Integration notes:**
  - Link to questions with `questionPath()`.
  - Add static pages to `STATIC_ROUTES`.
  - Link new hubs from `lib/siteDirectory.js` or `Footer.jsx`.
  - If `/ielts-essay-bank` lands, add it to the Writing group in `buildHomeDirectory()` and to the Writing hub chips (`pages/writingquestion/index.js`).

## Appendix: legacy URL → canonical slug (all 308)

| Old URL (now 308) | Canonical URL |
|---|---|
| `/readingquestion/36OHsmd2oOOcJogXY4zB` | `/readingquestion/endless-harvest-d60dm4` |
| `/readingquestion/3GK1OmYHR9Nx9GU0Zxvi` | `/readingquestion/findings-of-a-neuroscientist-o67c8z` |
| `/readingquestion/Advantages%20of%20Public%20Transport` | `/readingquestion/advantages-of-public-transport-1nhtlt` |
| `/readingquestion/Australia's%20Sporting%20Success` | `/readingquestion/australia-s-sporting-success-118w87` |
| `/readingquestion/Coal%20and%20Pollution` | `/readingquestion/coal-and-pollution-1kkkl2` |
| `/readingquestion/Early%20Childhood%20Education` | `/readingquestion/early-childhood-education-12v4mw` |
| `/readingquestion/HlHsFKo7d1ETyvj5Sld3` | `/readingquestion/how-much-higher-how-much-faster-1hbz8z` |
| `/readingquestion/IeBaPIVrYck0Ur8NtGzU` | `/readingquestion/aphantasia-a-life-without-mental-images-146btn` |
| `/readingquestion/Intercity%20Sleeper%20London-Scotland` | `/readingquestion/intercity-sleeper-london-scotland-bb1w8n` |
| `/readingquestion/IXAmkcfLtFLibCSJjZLv` | `/readingquestion/biological-control-of-pests-pz6u0v` |
| `/readingquestion/jjVDg420HMrxIlGTvrV3` | `/readingquestion/collecting-ant-specimens-1m88y4` |
| `/readingquestion/KppJmGCwMFDuqSyUMjb8` | `/readingquestion/william-henry-perkin-elcxir` |
| `/readingquestion/m8CJDVueDSJXNIeUxSRw` | `/readingquestion/is-there-anybody-out-there-1icc8d` |
| `/readingquestion/MttkTBm9e6duwkI2Rm0L` | `/readingquestion/venus-in-transit-1v2mtl` |
| `/readingquestion/Nature%20or%20Nurture%3F` | `/readingquestion/nature-or-nurture-1emhxx` |
| `/readingquestion/Numeration` | `/readingquestion/numeration-h0t1fd` |
| `/readingquestion/RHOCmrixZzPKuhe8Ejuw` | `/readingquestion/the-evolution-of-a-kiss-wl5wiz` |
| `/readingquestion/Some%20Places%20to%20Visit` | `/readingquestion/some-places-to-visit-1p61ub` |
| `/readingquestion/sxVInbzCDXNxbOUN22tK` | `/readingquestion/auditory-challenges-in-the-classroom-1r7oav` |
| `/readingquestion/The%20Effect%20of%20Light%20on%20Plant%20and%20Animal%20Species` | `/readingquestion/the-effect-of-light-on-plants-and-animals-dbqxot` |
| `/readingquestion/The%20Problem%20of%20Scarce%20Resources` | `/readingquestion/the-problem-of-scarce-resources-1b3tvj` |
| `/readingquestion/The%20Return%20of%20Artificial%20Intelligence` | `/readingquestion/the-return-of-artificial-intelligence-dwfe6k` |
| `/readingquestion/Tragedy%20in%20Uppark` | `/readingquestion/tragedy-in-uppark-1901d9` |
| `/readingquestion/v8cGj2rmUDUYuiOoBWnF` | `/readingquestion/air-traffic-control-in-the-usa-1r6i0t` |
| `/readingquestion/WANMfQn64LLHn2dDeQHF` | `/readingquestion/land-of-the-rising-sun-1gock7` |
| `/readingquestion/West%20Thames%20College` | `/readingquestion/west-thames-college-mo48rh` |
| `/readingquestion/West%20Thames%20College%20II` | `/readingquestion/west-thames-college-ii-1075on` |
| `/writingquestion/Agricultural%20Advancement` | `/writingquestion/agricultural-advancement-18pnrw` |
| `/writingquestion/Animal%20Experimentation` | `/writingquestion/animal-experimentation-1cjym7` |
| `/writingquestion/Building%20Restoration` | `/writingquestion/building-restoration-1usshs` |
| `/writingquestion/Computer%20Games%20vs%20Sports` | `/writingquestion/computer-games-vs-sports-7279qb` |
| `/writingquestion/Government%20vs%20Individual%20Responsibility` | `/writingquestion/government-vs-individual-responsibility-d3pzkg` |
| `/writingquestion/Growing%20Populations` | `/writingquestion/growing-populations-1s2zw3` |
| `/writingquestion/Learning%20a%20Foreign%20Language` | `/writingquestion/learning-a-foreign-language-19xpmz` |
| `/writingquestion/Learning%20a%20Language` | `/writingquestion/learning-a-language-xbqoua` |
| `/writingquestion/Leisure%20Time` | `/writingquestion/leisure-time-1wu380` |
| `/writingquestion/Local%20vs%20Imported%20Foods` | `/writingquestion/local-vs-imported-foods-e72ffk` |
| `/writingquestion/Oil%20and%20Gas` | `/writingquestion/oil-and-gas-c8bzyp` |
| `/writingquestion/Older%20Parents` | `/writingquestion/older-parents-1gnbo3` |
| `/writingquestion/Opportunity%20of%20Wealth` | `/writingquestion/opportunity-of-wealth-54ayk6` |
| `/writingquestion/Reading%20and%20Imagination` | `/writingquestion/reading-and-imagination-9hvcxw` |
| `/writingquestion/Recycling%20at%20Home` | `/writingquestion/recycling-at-home-1hqf94` |
| `/writingquestion/Recycling%20Regulation` | `/writingquestion/recycling-regulation-192dud` |
| `/writingquestion/Relevance%20of%20the%20Arts` | `/writingquestion/relevance-of-the-arts-gag20w` |
| `/writingquestion/School%20Subjects` | `/writingquestion/school-subjects-x2muqm` |
| `/writingquestion/Societal%20Positive%20or%20Negative%3F` | `/writingquestion/societal-positive-or-negative-835ltx` |
| `/writingquestion/The%20Effect%20of%20Humanity` | `/writingquestion/the-effect-of-humanity-spoo1l` |
| `/writingquestion/The%20Purpose%20of%20Wealth` | `/writingquestion/the-purpose-of-wealth-1i3c20` |
| `/writingquestion/Tourists%20and%20Museums` | `/writingquestion/tourists-and-museums-d22uqy` |
| `/writingquestion/TV%20Advertising` | `/writingquestion/tv-advertising-txie0d` |
