# 10 — SEO Strategy: Indexing + Non-Brand Keyword Roadmap (Sep 23, 2026)

Owner: SEO strategist · Inputs: `00-DATA-BRIEF.md` (GSC/GA4), a full crawl of all 634 live sitemap URLs (Sep 23), code audit of `pages/`, `src/`, `lib/`, `content/posts/`, and competitor research on the SERPs. The search tool returned US results that look like Bing, so treat rank positions as directional. Every volume figure marked **(guess)** is an estimate from public signals, not keyword-tool data.

**Diagnosis in one line:** Google has indexed 103 of about 700 pages. The main reasons are that most practice pages are **not linked in crawlable HTML**, and they are **templated shells whose unique value (answers and explanations) is hidden in client-side state**. A few hundred near-duplicate blog, hub and month URLs make the site look lower quality. Meanwhile the one query cluster where we already rank on page 1 ("essay bank", about 2.4K impressions in 90 days) has no page built for it.

---

## Top 10 actions, ranked

| # | Action | Impact | Effort | Owner |
|---|---|---|---|---|
| 1 | **Make every practice page crawlable from its hub.** `/readingquestion`, `/writingquestion` and `/listeningquestion` render only **10** question links in server HTML (client-side `DataTable` pagination). **67 of 157 writing pages have zero internal links** in crawlable HTML, and the median writing page has 1 inbound link. Render the full list as `<a href>` in SSR (grouped by type/topic, or `?page=N` real links), and link the hubs from the homepage, which has 0 links to any question page. | **Very high**: the direct cause of most of the 534 "Discovered – not indexed" pages | S (1–2 days) | Engineer |
| 2 | **Launch `/ielts-essay-bank`**: a hub for the **157 Band 8–9 model essays we already have** (every writing page has a model answer plus a "Why this response works" rationale). Filter by Task 1 Academic / Task 1 GT letter / Task 2 frame / topic. Retitle writing pages "{Topic} – IELTS Task 2 Sample Essay (Band 8–9) + Free Check". 301 `blog/ielts-essay-bank-guide` and `blog/ielts-writing-bank-tips` into it. | **High**: "ielts essay bank" 1,324 imp at pos 6.2, "essay bank" 720 at 7.9, plus variants of about 2.4K imp in 90 days. We already rank; a dedicated page should take the top 3 | M (3–4 days) | Engineer + content |
| 3 | **Show the answers and explanations in server HTML** on reading (164) and listening (46) pages. `answerKey.accepted` and `explanation` already ship in `__NEXT_DATA__` but are invisible until the user submits. Add an "Answers & explanations" `<details>` block below the questions: answer, question type, paragraph location, evidence quote. Retitle pages "{Passage} – IELTS Reading Practice Test with Answers". For listening, also expose the transcript in `<details>`. | **High**: turns 210 thin shells into unique, citable pages and targets the "{passage} reading answers" long tail (we already get "vitamins reading answers" at pos 8.2 with no answers shown) | M (3 days) | Engineer |
| 4 | **Clean up URLs and canonicals.** 301 the 36 legacy `%20` URLs (e.g. `/writingquestion/Animal%20Experimentation`) and the 13 Firestore-ID URLs to their slug URLs, and make the slug canonical. Internal links already point at slugs that canonicalise *away* to the legacy URL (e.g. `/writingquestion/agricultural-advancement-18pnrw` is linked 156×), which produces the 50 "alternate with canonical" entries in GSC. Merge 3 duplicate prompt pairs: *Learning a Foreign Language / Learning a Language*, *Opportunity of Wealth / The Purpose of Wealth*, *Recycling at Home / Recycling Regulation*. | Medium-high: removes wasted crawl and consolidates signals | S | Engineer |
| 5 | **Fix the sitemap so it is trusted and can be diagnosed.** It currently stamps all static routes with *today's* `lastmod` on every request (so Google learns to ignore our lastmod) and gives question pages no lastmod at all. Use real `updated_at`. Split it into a sitemap index with `sitemap-reading.xml`, `-writing`, `-listening`, `-speaking`, `-blog`, `-guides`, so GSC reports indexing per page type. | Medium: needed to measure #1–#3 | S | Engineer |
| 6 | **Prune or noindex thin templates.** `/mock/*` (7 pages, about 43 words, premium shell) should be noindexed. Speaking topic hubs with ≤2 free cards should be noindexed until they reach 5 or more: `/speaking/topics/{events,activities,work-study,nature,food,health,money,culture,future-plans,objects,technology,travel}`; nature, health and future-plans have **0** free cards. Month pages that fall back to "No new Task 2 prompts were added in September 2026" should get new prompts or `noindex`. **Merge 25 blog posts that duplicate hubs** (table in §B3). | Medium-high: stops a wave of near-duplicates dragging down site quality | S–M | Engineer + content |
| 7 | **Split the writing checker into 3 landing pages** and publish an accuracy number. Pages: `/ielts-writing-checker` (Task 2), `/ielts-writing-checker/task-1-academic`, `/ielts-writing-checker/general-training-letter`. Competitors (engnovate, oneielts, LexiBot) all do one page per task, and "ielts task 1 checker" sits at pos 28–39. `/ielts-writing-checker-accuracy` currently says *"We do not have a published accuracy figure"* (`lib/calibrationStats.json` status: pending). Run `scripts/calibration/run.mjs` and publish the error in bands. ieltswritingchecker.com is cited by AI engines for exactly this kind of benchmark. | High: the checker cluster (guess 20–40K/mo globally) is where purchases come from | M | Engineer + founder |
| 8 | **Retarget the daily auto-blog** away from generic strategy posts that ieltsliz, ielts-simon and magoosh own. Replace them with 4 formats we can win: band-comparison essays, Task 2 topic sets with model essays, cue-card sets, and posts based on our own practice data. The queue has 40 titles (§C). Update the routine prompt at `~/.claude/scheduled-tasks/daily-ielts-blog-post/SKILL.md`, which is **stale**: it still edits `lib/posts.js`, but posts are now `content/posts/*.md`. Also update `scripts/content/blog-gap-topics.json`. | Medium, and it compounds | S to change, then ongoing | Content |
| 9 | **Build a "Cue cards September–December 2026" hub**, refreshed weekly. Reshape `/speaking/new-cue-cards` into `/ielts-speaking-cue-cards-2026`: 40+ cards grouped by family, each linking to its practice page with a model answer, Part 3 follow-ups and a free PDF download. Also add 3–5 cue cards per week to the database, starting with the 0–2-card families. | Medium-high and seasonal (guess 20–50K/mo cluster, peaks Jan/May/Sep, mostly India, Pakistan and Nepal) | M | Content + engineer |
| 10 | **Off-page work for AI citations and crawl priority.** (a) Verify Bing Webmaster Tools and import from GSC; this has been an open action since Aug 2, and ChatGPT and Copilot citations follow Bing's index. (b) Pitch 10 "best IELTS checker/practice" roundups that AI engines cite (§D). (c) Request indexing in GSC for 10 URLs a day (hubs first, then the essay bank). (d) Answer 3 r/IELTS threads a week, linking only where useful. | Medium-high: domain authority is the ceiling after the on-site fixes | Ongoing, about 2h/wk | Off-page |

**90-day targets** (baseline to target):
- Indexed pages: 103 → 350 by day 45, → 450 or more by day 90 (measured with the per-type sitemaps).
- Non-brand organic clicks: about 5/day → 25–40/day.
- "ielts essay bank": pos 6 → top 3.
- /ielts-writing-checker: pos 27 → 10–15.
- 20 or more passages ranking top 10 for "{passage} reading answers".

Suggested order: weeks 1–2 do #1, #4, #5 and #6 (engineering only, high confidence). Weeks 2–4 do #2 and #3. Weeks 3–6 do #7 and #9. #8 and #10 start now.

---

## A. Competitor / SERP evidence by opportunity term

| Term (our GSC) | Who ranks top 10 | Winning page type and depth | Volume | What we need |
|---|---|---|---|---|
| **ielts essay bank / essay bank** (1,324 imp pos 6.2; 720 imp pos 7.9) | Scribd PDFs (3×), writing9 topic pages, ieltsessaybank.com, totallyfreeielts, improvemyielts, **ielts-bank.com**, ieltsliz | List hubs of 10–50 essays with band labels. [writing9 topic pages](https://writing9.com/ielts-writing-task-2-topics/topic/bank) list 50 prompts each with answers filterable by band 6–9. Scribd wins on **downloadable PDFs** | Essay-bank terms <1K/mo; "band 9 essay" family 5–15K/mo (guess) | A `/ielts-essay-bank` hub with 157 essays, filters, and a free PDF of the Top 30 (email-gated optional). Later add band 6/7 versions of the same prompt (§C) |
| **ielts writing checker / ai … / task 1 checker** (356 imp pos 23.7; page 1,418 imp pos 27.6) | oneielts, LexiBot, ieltswritingchecker.com, ieltswritingpro, ai4ielts, deepielts, engnovate, cathoven; writing9 on brand terms | Tool above the fold. **One page per task variant**. "No login" promise, social proof counters, a sample report, FAQ, an **accuracy benchmark** | 20–40K/mo (guess) | Three checker pages; a published calibration number; a sample report (we have one); a real usage counter. Product decision to flag: every competitor offers at least one check without login, while ours requires signup first |
| **ielts reading practice test** | examenglish, British Council, ielts-up, ieltsonlinetests, ieltstrainingonline, engnovate ("1000+"), mini-ielts | Collection hubs with the count in the title ("315 TESTS") | 30–60K/mo (guess) | The head term is out of reach for our authority. Put "164 free passages" in the hub title and win on the long tail (next row) |
| **{passage} reading answers** ("vitamins reading answers" 76 imp pos 8.2; "keeping an eye on shoppers" 35 imp) | upgrad, ieltsfever, ieltsmaterial, kanan, yocket, ieltstrainingonline, practicepteonline | Best in class is [ieltsmaterial](https://ieltsmaterial.com/the-innovation-of-grocery-stores-ielts-reading-answer/): about 2,500 words, each answer with type, **paragraph/line location, evidence quote**, and a tip per type. The field is fragmented and mid-authority sites rank | 50–1,000/mo per passage (guess) | Action #3. **Caution:** several legacy passage titles match well-known Cambridge passage names (e.g. "Australia's Sporting Success", "Endless Harvest", "Numeration", "Is There Anybody Out There?"). Our text is original, so a searcher wanting the Cambridge answers will bounce. Do **not** add "answers" to those titles. Apply the answers treatment to our original-titled passages, and consider renaming the colliding ones (legal and trust risk) |
| **ielts speaking cue cards 2026 / cue card september 2026** | ieltsfever (weekly-updated Sep–Dec 2026 page), gradding (8K words, 141 topics), cathoven (56 cards with Part 3), ielts9.io, ieltsliz, IDP BD/NP | Dated hub updated weekly, plus one answer page per card. Makkar-style PDF demand | 20–50K/mo, seasonal (guess) | Action #9. We have 86 speaking pages with Band 8–9 model answers already. The gap is the dated hub, freshness, and families with 0–2 cards. Say "practice set", never "reported in the real test" |
| **ielts listening practice** | British Council, ieltsbuddy, ieltsonlinetests, ielts-up, engnovate, mini-ielts, ieltstrainingonline | Hubs; engnovate's per-section **answer pages with transcript + evidence** (about 4,500 words) | 20–40K/mo (guess) | The per-page transcript and answers from action #3. Skip the head term |
| **ielts band calculator** (our /band-calculator 29 clicks) | ieltsadvantage, ieltsbuddy, ieltsetc, oneielts, edubenchmark, ieltscalculator.com, engnovate | Small tool, about 1,200 words; ieltsbuddy has **no** tables | 10–25K/mo (guess) | We already have 3 full conversion tables and FAQ schema, so this page is at parity or better. It needs **links** (§D) and internal links from all 102 blog posts that mention bands |
| **ielts test bank / question bank / database** (81 + 33 + 45 imp) | studymind, Cambridge TestBank, **ieltsbank.com** (lookalike), **ielts-bank.com**, ieltsmate, paramountielts | Weak field; we already rank #4–5 (Bing-like results) | 1–3K/mo total (guess) | A `/ielts-question-bank` hub: counts by skill × question type, linking all hubs. Merge `blog/ielts-database-explained` into it (it also carries the "past papers" framing the legal audit flagged) |
| **what to bring to ielts test** (24 imp pos 25) | ielts.org, IDP, British Council, ielts.ca, Magoosh | Official FAQ pages dominate | 3–8K/mo (guess) | Low value. Refresh the existing `blog/ielts-test-day-what-to-bring-what-to-expect` with a printable checklist table (computer vs paper, UKVI ID edge cases). Don't build new pages |
| **ielts writing task 2 topics {month} 2026** (/…/september-2026 got 17 clicks) | magoosh, ieltsliz (100+ prompts, no answers), howtodoielts (dated "reported" lists), ieltspodcast | Dated lists; the winners link each prompt to a sample | 10–30K/mo, seasonal (guess) | Each month page needs 12+ **new** prompts, each with a model essay and a "check your essay" CTA. The September page currently says no new prompts were added. The content routine should feed it (§C) |

Size signals: engnovate reaches about 176K organic visits/mo at **DR 34** with about 2.9K templated pages (one answer page per test, several checkers, a big test library). That is the closest model for us: pages built from a template with genuinely unique content, not more blog posts.

---

## B. On-site audit: why Google won't index us

### B1. Live sitemap composition (634 URLs, crawled Sep 23)

| Type | URLs | Median visible words | Inbound internal links (median) | Verdict |
|---|---|---|---|---|
| `/readingquestion/*` | 165 | 1,313 (passage + questions) | 3 | Keep. Expose answers (#3) |
| `/writingquestion/*` | 157 | 529 | **1** (67 orphans) | Keep. Crawlable hub (#1) + essay bank (#2) |
| `/blog/*` | 102 | 1,136 | 2 | Merge 25, redirect the routine (#8) |
| `/speakingquestion/*` | 86 | 648 (includes model answer) | 4 | Keep. The only fully linked question type (its hub lists all 85) |
| `/listeningquestion/*` | 47 | **379** | 1 | Thin in HTML: expose transcript + answers (#3) |
| `/reading/{type}` | 16 | 330–1,525 | 17 | Keep. Absorb the matching blog posts |
| `/speaking/topics/{family}` | 16 | **252–475** | 24 | 12 of 16 have ≤2 free cards, so noindex until 5 or more |
| `/ielts-score-requirements/{country}` | 11 | about 1,150 | 10 | Keep |
| `/mock/*` | 7 | **39–46** | 1 | Noindex (premium shell) |
| `/ielts-writing-task-2-topics/{month}` | 3 (+ hub) | 450–1,013 | — | Recycled content when no new prompts. Fix via routine, or noindex |
| Static / guides | 22 | 200–1,700 | high | Keep. `/speaking-examiner` (208 words) and `/contactus` are thin but harmless |

Other findings:
- The 3 section hubs (`SectionLanding` → `DataTable`) show 10 items in SSR. The speaking hub, which is a custom page, lists all 85. This is why speaking is the only question type with no orphans.
- `RelatedPractice` always suggests the alphabetically first items (every reading page links "A Beginner's Guide to Home Composting", "A Brief History of Money", "A Short History of Tea"). It should pick siblings by question type, topic or difficulty, so internal links spread evenly.
- Titles are templated and generic ("{Title} | IELTS Writing Practice | IELTS-Bank"). None contain the words people search: *sample essay*, *model answer*, *with answers*, *cue card*.

### B2. Consolidate / noindex / enrich

| Action | URLs | Why |
|---|---|---|
| **301 legacy → slug**, canonical = slug | 36 `%20` + 13 Firestore-ID URLs (e.g. `/readingquestion/IeBaPIVrYck0Ur8NtGzU`) | Internal links already use slugs. The current canonical points the other way (50 alternate-canonical entries in GSC) |
| **Merge duplicate prompts** | `Learning%20a%20Foreign%20Language` + `Learning%20a%20Language`; `Opportunity%20of%20Wealth` + `The%20Purpose%20of%20Wealth`; `Recycling%20at%20Home` + `Recycling%20Regulation` | Identical meta descriptions |
| **Noindex** | `/mock/*` (7); `/speaking/topics/*` with fewer than 5 free cards (12); month pages whose `source` is "recent fallback" | Thin or duplicate. Keep them in navigation; drop them from the sitemap |
| **Enrich** | listening (47) and reading (165) with answers/explanations/transcripts in `<details>`; writing (157) retitled as sample essays; add a "Part 3 follow-ups" block to cue cards that lack one (only 23 of 86 show Part 3) | Makes each page unique and useful without JavaScript. AI crawlers execute no JS |

### B3. Blog posts that cannibalise hubs: merge (301) into the hub

| Blog post(s) | Merge into |
|---|---|
| `ielts-reading-true-false-not-given`, `-yes-no-not-given`, `-matching-headings`, `-matching-information`, `-matching-features`, `-multiple-choice`, `-short-answer-questions`, `-sentence-completion`, `-matching-sentence-endings`, `-flow-chart-completion`, `-summary-note-table-completion` (11) | `/reading/{type}`. Move the worked examples into the hub, which already has the practice list |
| `ielts-listening-section-1/2/3/4-strategy` (4) | `/listening/part-1…4` |
| `ielts-speaking-part-2-cue-card`, `ielts-speaking-part-3-discussion`, `ielts-speaking-part-1-answers` (3) | `/speaking/part-2`, `/part-3`, `/part-1` |
| `ielts-writing-band-descriptors`, `ielts-speaking-band-descriptors` (2) | `/ielts-band-descriptors` |
| `ielts-score-requirements-uk-universities`, `-canadian-universities` (2) | `/ielts-score-requirements/united-kingdom`, `/canada` |
| `ielts-band-score-calculation` (1) | `/band-calculator` |
| `ielts-essay-bank-guide`, `ielts-writing-bank-tips` (2) | `/ielts-essay-bank` (new) |

That is 25 URLs removed, each hub made stronger, and the "past papers" July-2025 legacy posts retired. Implement as permanent redirects in `next.config.js`, and remove the entries from `content/posts/`.

---

## C. Retargeting the daily auto-blog: 40 titles

**New rules for the routine.**
1. Every post must use an asset only we have: our 157 model essays, 86 cue cards, 210 passages, the checker, or aggregated practice data. Aggregated data must be real, queried and dated; never invent statistics (a lesson from the legal audit).
2. Each post must target a query with a visible modifier (*sample*, *band 7*, *topics*, *cue card*, *answers*, *vs*).
3. Each post must link to 3 or more practice pages and to the checker.
4. No new generic "how to do X question type" posts; improve the hub instead.
5. Mix: 2/week band-comparison essays, 2/week topic sets, 2/week cue-card sets, 1/week data or tool post.

Where noted, **Q** means the item should be a database question page with a model answer (added via `scripts/content/generate-*-model-answers.mjs`) rather than a blog post.

| # | Slug | Target query |
|---|---|---|
| 1 | `ielts-task-2-band-6-vs-band-7-vs-band-8-same-essay` | ielts essay band 6 vs band 7 |
| 2 | `band-7-ielts-essay-sample-technology` | band 7 ielts essay sample |
| 3 | `band-6-ielts-essay-sample-with-examiner-comments` | band 6 essay sample ielts |
| 4 | `band-9-ielts-essay-samples-task-2` | ielts band 9 essay sample |
| 5 | `ielts-opinion-essay-samples-agree-disagree` | agree or disagree essay sample ielts |
| 6 | `ielts-discussion-essay-samples-both-views` | discuss both views essay sample |
| 7 | `ielts-advantages-disadvantages-essay-samples` | advantages and disadvantages essay ielts sample |
| 8 | `ielts-problem-solution-essay-samples` | problem solution essay ielts sample |
| 9 | `ielts-writing-task-2-topics-october-2026` (feeds month page) | ielts writing task 2 topics october 2026 |
| 10 | `ielts-writing-task-2-topics-november-2026` | ielts writing task 2 topics november 2026 |
| 11 | `ielts-education-essay-topics-with-sample-answers` | ielts essay topics education |
| 12 | `ielts-environment-essay-topics-with-sample-answers` | ielts environment essay |
| 13 | `ielts-technology-essay-topics-with-sample-answers` | ielts technology essay topics |
| 14 | `ielts-crime-essay-topics-with-sample-answers` | ielts crime essay |
| 15 | `ielts-health-essay-topics-with-sample-answers` | ielts health essay topics |
| 16 | `ielts-work-and-employment-essay-topics-samples` | ielts work essay topics |
| 17 | `ielts-task-1-line-graph-sample-answer-band-8` | ielts line graph sample answer |
| 18 | `ielts-task-1-bar-chart-sample-answer-band-8` | ielts bar chart sample answer |
| 19 | `ielts-task-1-pie-chart-sample-answer-band-8` | ielts pie chart sample answer |
| 20 | `ielts-task-1-process-diagram-sample-answer` | ielts process diagram sample answer |
| 21 | `ielts-task-1-map-sample-answer-band-8` | ielts map sample answer |
| 22 | `ielts-general-training-letter-samples-formal-informal` | ielts letter sample general training |
| 23 | `ielts-cue-cards-october-2026-practice-set` | ielts cue card october 2026 |
| 24 | `ielts-cue-cards-september-december-2026` (hub, weekly refresh) | ielts cue cards september to december 2026 |
| 25 | **Q** `describe-a-person-who-helps-others-cue-card` | describe a person who helps others cue card |
| 26 | **Q** `describe-a-time-you-were-late-cue-card` | describe a time you were late cue card |
| 27 | **Q** `describe-a-place-you-would-like-to-visit-cue-card` | describe a place you want to visit cue card |
| 28 | **Q** `describe-a-healthy-habit-you-have-cue-card` (fills the health family, currently 0 cards) | describe a healthy habit cue card |
| 29 | **Q** `describe-a-plan-for-the-future-cue-card` (fills future-plans, currently 0) | describe a future plan cue card |
| 30 | **Q** `describe-a-natural-place-you-visited-cue-card` (fills nature, currently 0) | describe a natural place cue card |
| 31 | `ielts-speaking-part-3-questions-technology-with-answers` | ielts speaking part 3 technology questions |
| 32 | `ielts-speaking-part-1-topics-september-december-2026` | ielts speaking part 1 topics 2026 |
| 33 | `hardest-ielts-reading-question-types-our-data` (real aggregated accuracy) | hardest ielts reading question type |
| 34 | `most-common-ielts-writing-mistakes-from-scored-essays` (real aggregated checker data) | common ielts writing mistakes |
| 35 | `ielts-writing-checker-accuracy-tested-vs-human-scores` (after calibration) | ielts writing checker accuracy |
| 36 | `chatgpt-vs-ielts-writing-checker-same-essay` | can chatgpt check ielts writing |
| 37 | `ielts-question-bank-free-2500-questions` → hub `/ielts-question-bank` | ielts question bank / ielts test bank |
| 38 | `ielts-reading-practice-with-answers-and-explanations` (list of our original passages) | ielts reading practice with answers |
| 39 | `ielts-listening-practice-with-transcripts-and-answers` | ielts listening practice with answers |
| 40 | `ielts-writing-task-2-sample-answers-pdf` (free PDF of the top 30 essays) | ielts writing task 2 sample answers pdf |

Items 1–8 are the funnel into the checker: every sample ends with "paste your version, get a band" (writing drives purchases, per the analytics memory). Items 33–35 are the most citable by AI (original data).

---

## D. AI-search visibility (ChatGPT, Perplexity, Copilot: 378 sessions, 67% engaged)

**What gets cited** (evidence from the Aug 2 LLM-visibility plan plus this SERP pass):
1. **Third-party listicles and roundups.** For "best free IELTS writing checker", AI engines cite vendor roundups: smalltalk2.me, ieltsbiz, band9prep, band9ai, bandwritecoach, englishlanguagestudies, ieltsetc, alternativeto.net, careers360. **We are listed in none of them.**
2. **Original numbers.** ieltswritingchecker.com is cited for a single accuracy table (MAE 0.49 vs ChatGPT 0.86, engnovate 0.90, writing9 1.62, per their own claim). Our accuracy page publishes no number.
3. **Tables and direct-answer capsules** near the top of the page. We already have "Quick answer" capsules on the blog, hubs and cue cards, which is good.
4. **Bing index coverage.** ChatGPT citations overlap Bing's top results about 87%. Bing Webmaster Tools has still not been set up (an open user action since Aug 2).
5. **Server-rendered facts.** AI crawlers run no JS, so our hidden answers and transcripts (#3) are invisible to them today.

**Add:**
- (a) A published calibration number plus a head-to-head table: same 30 human-scored essays, our checker vs ChatGPT vs 2 competitors. This would be the most citable page we could publish.
- (b) Outreach to the 10 roundups above, offering the benchmark plus a free Pro account for review. Add listings on alternativeto.net as an alternative to writing9, LexiBot and IELTS Writing Pro.
- (c) An "IELTS writing checker comparison" page (honest, including where competitors win).
- (d) Essay-bank and answer pages in server HTML.
- (e) Weekly checks of the `/data` "Read by assistants" card to see which URLs ChatGPT-User fetches, then enrich those pages first. *I tried a read-only query of `crawler_hits` for this report; the permission classifier blocked it as a production read, so the founder should check the card.*

---

## E. Engineering spec pointers (for the build agent; nothing here was implemented)

- #1: `src/components/SectionLanding.js` → `DataTable`. Add an SSR `<ul>` of all `items` (title, type, difficulty) under a "Browse all N questions" heading. Keep the interactive table for users. Homepage (`src/pages/HomePage.js`): add a "Browse the bank" block linking the 4 hubs, `/ielts-essay-bank` and `/ielts-question-bank`.
- #2: new `pages/ielts-essay-bank/index.js` (+ `[task].js` for task-1-academic / task-1-general / task-2 / by-frame via `lib/task2Frames.js`). Source: `listPassages(SKILLS.writing)` + `passage.writing.modelAnswerHtml`. Schema: `CollectionPage` + `ItemList`.
- #3: `src/pages/ReadingQuestion.js`, `ListeningQuestion.js`. Render `groups[].questions[].answerKey.{accepted,explanation}` inside `<details>` after `QuestionEngine`. Add `Quiz` schema or keep `LearningResource`. Title pattern in the same files. Update `llms.txt` counts.
- #4/#5: `pages/sitemap.xml.js` (sitemap index + real lastmod), `next.config.js` redirects, and the canonical logic in `ReadingQuestion.js` / `WritingQuestion.js` (`legacyId || slug` becomes `slug`).
- #6: `pages/mock/[slug].js`, `pages/speaking/topics/[family].js` and `pages/ielts-writing-task-2-topics/[month].js` get a `noindex` condition, and are removed from `STATIC_ROUTES` when noindexed.
- `RelatedPractice`: choose siblings by `questionType`/topic, rotated by hash of the slug, not alphabetical order.
