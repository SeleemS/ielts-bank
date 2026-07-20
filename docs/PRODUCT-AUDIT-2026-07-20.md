# IELTS-Bank — Board-Level Product Audit (2026-07-20)

**Method.** Live production audit of https://www.ielts-bank.com from the perspective of an experienced IELTS board, plus hands-on testing as a real **free/anonymous user**, a **signed-in free user**, and a **paid Premium user** (activated with a 100%-off promo through the real Stripe → webhook → premium path). Content accuracy was checked item-by-item against the live database (read-only). Two AI writing scores were run on a deliberately-calibrated essay (free model + premium model) to test band accuracy.

**Headline verdict.** The *content and the practice UX are genuinely good* — passages, question types, answer keys, and the split-screen exam UI are exam-authentic and better than most competitors. The two things that most undercut the product are **(1) the AI writing scorer over-scores by ~1 band on both tiers** — the exact failure the site markets against — and **(2) a cluster of data-integrity defects** (42 ungradeable live questions, a Task-1 answer leak, and mostly-empty answer explanations). Fixing scoring calibration + those data defects would move this from "good practice site" to "trustworthy exam-prep tool."

---

## 1. What's working well (keep / protect)

- **Reading passages are exam-authentic.** ~722-word academic expository prose on classic IELTS topics; TRUE/FALSE/NOT GIVEN sets are properly balanced (real NOT-GIVEN traps, not just easy FALSEs); MC distractors are tempting-but-defeatable; short-answer keys carry accepted variants ("Dutch / Dutch merchants", "Assam / the Assam region").
- **Answer keys are correct.** An independent re-derivation of 130+ items across all 14 live question types + 3 full listening transcripts found the stored key correct in **every case but one** (see §3). This is the hardest thing to get right and they've got it.
- **Reading review teaches.** Each question shows the correct answer **and a "Why:" evidence sentence** from the passage — the single most valuable "help me improve" feature, and better than many paid competitors.
- **Listening is real.** Genuine TTS audio from storage, solid player (seek / ±10s / speed), map/plan SVGs render with lettered markers, currency/number answer variants ("2.50 / £2.50 / two pounds fifty"), and a full transcript toggle. Honest disclaimer: "in the real exam you hear it once only."
- **Split-screen exam UI** with per-passage 20-min timer, question navigator, flagging, and an "unanswered — submit anyway?" guard. This *feels* like the real test.
- **Speaking practice is format-perfect.** Cue card ("You should say… and explain how…"), examiner audio, 1-min prep + notes, 2-min recording cap, rounding-off questions.
- **Premium dashboard is a real advancement engine** (see §5): band trajectory, question-type weakness analysis, revision queue, criterion trends, streaks, personalized "next moves."
- **Funnel is honest and well-built.** Anonymous users get 1 free scored attempt per skill, then a *free-signup* gate (not a paywall) with reassuring copy; the writing draft survives sign-in; the premium report is delivered in full as promised. Pricing page leads with a 14-day money-back guarantee and directly counter-positions against generic chatbots.

---

## 2. CRITICAL — AI Writing scorer over-scores by ~1 band (both tiers)

**This is the most important finding because it attacks the core value proposition.** The pricing page says: *"Generic chatbots can over-score IELTS essays… IELTS Bank anchors every score to the public band descriptors."* In testing, the product does the same thing it markets against.

**Test essay (submitted verbatim):** a deliberately-built **Band ~6.0** Task 2 with clear, countable errors — *"used as a free labour"*, *"This experiences also help"*, *"which make them become better citizens"*, *"have some points"*, *"more chance to be accepted"* — plus generic, under-developed examples and a weakly-committed both-sides structure on an agree/disagree prompt. A certified examiner marks this **6.0 (6.5 at the most generous)**; Grammar is a clear Band 6 ("frequent error-free sentences" is the Band-7 bar and this essay does not clear it).

| Criterion | Free model (`gpt-5.4-nano`) | Premium model (`gpt-5.1`) | Fair examiner |
|---|---|---|---|
| Task Response | 7.0 | 7.0 | 6.0 |
| Coherence & Cohesion | 7.0 | 7.0 | 6.5–7.0 |
| Lexical Resource | 7.0 | 7.0 | 6.0 |
| Grammatical Range & Accuracy | 7.0 | 6.5 | 6.0 |
| **Overall** | **7.0** | **7.0** | **6.0–6.5** |

**Why this matters most:**
- The over-scoring lands at exactly **Band 7.0** — the most consequential threshold (university/immigration cutoffs cluster at 6.5–7.0). A learner told "7.0" who then scores 6.0 on the real exam experiences the worst possible outcome and blames the product.
- The **free sample is the conversion hook** *and* uses the weakest, most lenient model. First impression = inflated score = fragile trust.
- The model **lists the errors but still rewards them**: premium LR feedback literally says "correct collocation errors like 'a free labour'" and "This experiences → These experiences", yet awards LR 7.0. This is the classic LLM-examiner halo (rewarding structure/effort over accuracy).

**Diagnosis (verified in code).** The *system prompt is good* — `pages/api/score/writing.js:buildSystemPrompt()` embeds the full Band 4–9 descriptors, task-specific rules, an under-length penalty, and an evidence-citation requirement; the overall band is computed server-side with correct rounding. So this is **not** a prompt-structure problem — it's a **calibration** problem the current prompt can't overcome, worse on the cheap free model.

**Recommended fixes (in priority order):**
1. **Add band-anchored few-shot calibration** to the system prompt — 3–4 short worked examples ("this exact essay = Band 6 because…") especially at the 6/7 boundary, and an explicit rule: *"A criterion cannot score 7 if you have cited more than one error of that type."*
2. **Raise the free-tier model** or route the free sample through the premium model for the *overall band only* — the free sample's job is to earn trust, so it must be the *most* accurate, not the least.
3. **Add a calibration harness**: score a fixed set of DREsS / publicly-benchmarked essays with known bands each time the model or prompt changes, and track mean absolute error vs the reference band. Ship a target (e.g. MAE ≤ 0.5).
4. Consider showing a **half-band range** ("6.0–6.5") rather than a false-precision single band, which both hedges honestly and reduces "you promised me 7" disputes.

*Note:* the *feedback content* (criterion bullets, corrected examples) on the premium model is genuinely excellent and specific. The problem is purely the number attached to it.

---

## 3. Content accuracy by question type (item-level, from the live DB)

Full detail in `scratchpad/content-accuracy-audit.md`. Summary:

**The good news:** intellectual quality is high. Keys, distractors, heading banks, word limits, and listening answers are exam-authentic. Only **one** key is defensibly wrong:
- `coal-and-pollution-1kkkl2` Y/N #11 — statement calls industrial gases *"the greatest threats to the environment"*; the passage never ranks them and is actually sceptical. Stored **YES**; should be **NOT GIVEN**. → review.

**The defects (data-integrity / delivery, not judgment):**

| # | Severity | Finding | Scale |
|---|---|---|---|
| 3.1 | **CRITICAL** | **42 ungradeable questions** — answer arrays empty and **6 groups have no options at all**, so the candidate sees unanswerable items the app can't mark. All in **published** passages: lithium-ion battery, coral reefs, suspension bridge, peat bogs, water cycle. Root cause: the generator saved the "why" text but never persisted options/gap-text/keys. | 10 groups · 5 passages |
| 3.2 | **HIGH** | **Academic Task 1 prompts leak the answer.** `prompt_html` appends a prose paragraph reciting all the chart data ("Country A: 3% agriculture, 22% industry, 75% services…"). Describing that data *is the task.* A polished Band 8–9 answer already exists separately in `model_answer_html`. → strip the paragraph (or move to SVG `<desc>`/alt). | ~31 items |
| 3.3 | **HIGH** | **Explanations mostly missing.** 47.5% of answer keys have **NULL** explanation; a further **91 NOT-GIVEN items show users the raw dev string "Why: ABSENT: not stated or contradicted."** Completion/matching types and **all listening** are ~100% unexplained — yet the UI renders a "Why:" affordance everywhere. This is exactly where TF/NG learners need reasoning most. | 1147 null + 91 templated / 2416 |
| 3.4 | **MEDIUM** | **12 multiple_choice groups are really matching_headings** (roman-numeral heading bank / "Section X" stems). Answers are correct but they render as per-question radios instead of a shared heading bank — wrong type/UX. | 12 groups · 64 Qs |
| 3.5 | **MEDIUM** | **TF/NG vs Y/N/NG misuse:** `medicine-passage-1l6ij5` uses YES/NO/NOT GIVEN on a factual text (should be TRUE/FALSE/NOT GIVEN). A few group instructions are non-standard or omit the response set entirely (`new-electricity-account-1njme8`). | ≥2 groups |
| 3.6 | **LOW** | Dev placeholder "Testing. Dec12-23." / "Is this working?" in archived passage `coming-soon-audio-files-wefvkj` (not user-facing but live data). | 1 group |

**Authenticity notes worth a product decision:**
- Per-question word-limit hints "(max 2 words)" on short-answer are a helpful *scaffold* but not exam-authentic (the real test gives one group-level limit). Consider a "study mode / exam mode" toggle.
- Listening defaults to **untimed with unlimited replay** (a "Switch to timed" toggle exists). Good for learning, but a true exam-condition mode should play once and lock the controls.
- Map-labelling supplies **text descriptions of each map marker** as the options (a hybrid) rather than pure read-the-letter-off-the-map. Slight scaffold; fine, but note it.
- Listening audio is short (~2:17 for 9 questions vs ~4–5 min/10 Q on the real test) — pacing is denser than the exam.

---

## 4. Auto-scored review UX (Reading & Listening)

- **Band from a single passage/section is a stretch.** A 13-question passage → "Estimated reading band ~4"; 0/9 listening → "Estimated listening band ~0". Real bands come from a 40-question test, and **IELTS bands floor at 1.0, not 0** ("0" means "did not attempt"). It's hedged ("Estimated ~"), but: (a) clamp the floor to 1, and (b) add a one-line tooltip that this is scaled from a single section.
- **Listening review is weaker than reading review.** Reading shows an inline "Why:" evidence sentence per question; listening shows only "Correct answer: X" plus a raw transcript to hunt through — **no per-answer evidence and no answer highlighting in the transcript.** Add "jump to / highlight in transcript" per question.
- **Instruction wording is inconsistent** between passages ("Write TRUE, FALSE or NOT GIVEN." vs the fuller "Write TRUE if the statement agrees, FALSE if it contradicts…"). Standardize.

---

## 5. Premium value & "help users advance"

**Strong.** The paid dashboard is the best "advancement" surface in the product:
- **Performance Lab** — band trajectory (last 10 per skill), average / personal best.
- **Skill Pulse** — per-skill status at a glance.
- **Accuracy Signals** — question-type mastery / weakness analysis (once you submit signed-in Reading/Listening).
- **Revision Queue** — mistakes worth revisiting (spaced-repetition seed).
- **AI Feedback Trends** — per-criterion deltas over time (correctly showed Grammar 6.5 = −0.5 between my two submissions).
- **Your Next Moves** — a concrete personalized plan; **Consistency** heatmap + streaks.
- **Mocks** (full 60-min 3-passage Reading, 4-part Listening) and the **Live AI Examiner** (3-part format + drills, per-period minutes meter) are real, differentiated premium features. Realtime examiner minutes are correctly seeded at checkout and re-seeded on renewal (`invoice.paid`).

**But two things break or undercut the paid experience:**

- **5.1 — HIGH / verify: the timed mock never starts.** `/mock/academic-reading-mock-1` stays on the loading skeleton indefinitely (reproduced across reloads, 6s+ each). The data is fine — `GET /api/mock/academic-reading-mock-1` returns **200 with the full mock payload** — so this is a **client-side render bug**: the component fetches data but never leaves the loading state. Mocks are a headline Premium feature; if this reproduces in a normal browser it means a paying user cannot sit a mock. **Please verify in a real browser and treat as P0 if confirmed.**
- **5.2 — MEDIUM: pre-login practice history is lost.** Reading/Listening practiced anonymously does **not** backfill after signup — the dashboard showed "Submissions 2" (both Writing) with Reading/Listening at "Start practising" despite completed anonymous attempts. New users lose their first sessions, weakening the "your progress is safe" promise the signup modal makes.
- **5.3 — LOW: dashboard metrics look off.** "Focused practice **6.0h** / 1 active day" for a same-day account with 2 submissions is implausible (likely a session-time aggregation bug). "**Estimated overall 7.0**" is derived from Writing alone — labeling a single-skill score as "overall" can mislead (subtext says "Best skill score"; make the headline honest).

---

## 6. Free / paid funnel & monetization observations

- **Writing checker hard-blocks scoring under 250 words** ("must be at least 250 to be scored"). Real IELTS *scores* an under-length essay with a Task-Achievement penalty. Blocking is defensible pedagogy but stricter than the exam, and a 240-word essay currently gets *nothing* — consider scoring it with an explicit length penalty instead.
- **6.1 — MEDIUM (paywall leak): the full premium writing report ships to free users.** The scoring API returns all four criteria + examiner summary + corrected examples to a free account (`writing.js` returns `{...result, free:isFreeScore}`); the client hides criteria 2–4 with **CSS `filter: blur(5px)` + `user-select:none`**. Anyone can read the entire "Premium" report via DevTools / view-source / scraping. Gate it **server-side**: for a free score, strip everything except overall band + the one unlocked criterion before responding.
- The consent banner, regional (PPP) pricing, and money-back guarantee are all handled well.

---

## 7. Prioritized action list

**P0 — trust & broken features**
1. **Fix writing-scorer calibration** (§2): band-anchored few-shots + "no 7 with cited errors" rule; put the free sample on an accurate model; add a calibration harness with an MAE target.
2. **Fix or de-publish the 42 ungradeable questions** (§3.1) — 5 live passages currently show unanswerable items.
3. **Verify & fix the stuck timed mock** (§5.1) — headline premium feature appears non-functional.

**P1 — content integrity & fairness**
4. **Strip the answer-leak paragraph from Academic Task 1 prompts** (§3.2).
5. **Server-side gate the free writing report** (§6.1).
6. **Replace the 91 "ABSENT" placeholders** and backfill NULL explanations, at least for TF/NG, Y/N/NG, MC (§3.3).
7. **Backfill anonymous practice history on signup** (§5.2).

**P2 — accuracy polish & advancement**
8. Re-type the 12 MC-as-headings groups; fix TF/NG-vs-Y/N/NG misuse; review the one questionable key (§3.4/3.5).
9. Clamp the section-band floor to 1.0 + tooltip; standardize instruction wording (§4).
10. Add per-answer evidence + transcript highlighting to Listening review (§4).
11. Add a "study mode / exam mode" toggle (per-question hints, replay, timing) (§3 notes).
12. Fix the dashboard "focused practice hours" metric and the "overall from one skill" label (§5.3).

**New value ideas to help users advance further**
- **Adaptive weakness loop:** feed the dashboard's question-type weakness analysis back into "practice more of your weakest type" one-tap sets (the data already exists; close the loop).
- **Spaced-repetition on the revision queue:** resurface missed items after 1/3/7 days.
- **Model-answer diffing for Writing:** show the learner's sentence next to a band-8 rewrite (the corrected-examples engine is already this good — expand it into a guided rewrite).
- **Predicted overall band** only once all four skills have a baseline, with a clear "based on N skills" caveat — turn the readiness gauge into a real target tracker.

---

## 8. Test rig created (for cleanup)

To test as a paid user I created, on your own live Stripe/Supabase:
- **QA account:** `sseleem1601+claudeqa@gmail.com` (email is a +tag of yours so you can see any lifecycle emails it triggers).
- **Stripe:** a 100%-off promo code `CLAUDEQA100` (off your existing `E2E100` coupon) — **now deactivated**; and an **active $0 monthly subscription** (`sub_1TvNvC2dmCzY4QBUayzSSQnv`) that made the account Premium.
- Two Writing scores + a handful of anonymous Reading/Listening attempts were recorded (they'll appear in today's daily report).

Cleanup options (say the word): cancel the subscription, delete the QA user, or leave it so you can log in and inspect Premium yourself. Your own `SELEEM100` promo code was left untouched.
