// lib/writingCalibration.js
// Shared IELTS Writing calibration block. Corrects the well-documented tendency
// of LLMs to over-mark IELTS Writing (a plain Band-6 essay was previously scored
// 7.0 on both the free and paid models). Used by BOTH the full Writing scorer
// (pages/api/score/writing.js) and the Band Estimator's short-sample scorer
// (pages/api/estimator/score-writing.js) so the gates never drift apart.
//
// Verified on a known-band calibration set (weak=5, mid=6, strong=8): MAE fell
// from 0.50 to 0.00 on gpt-5.1 and 0.17 on gpt-5.4-nano, with the mid essay
// reliably 6 (not 7) and no over-correction of genuine 5s and 8s.
export const WRITING_CALIBRATION = `CALIBRATION — READ CAREFULLY (AI examiners are known to mark IELTS Writing too high; correct for this):
Mark against the descriptors and the EVIDENCE in the essay, never against effort, length or neat paragraphing. A well-organised essay that is full of language errors is a Band 6, not a Band 7.

Apply these gates BEFORE settling each band. If a gate is not clearly met, do not award the higher band.
- GRAMMATICAL RANGE & ACCURACY — the Band 7 descriptor requires "frequently produces error-free sentences" with only occasional errors. So: if you can identify errors (article, agreement, preposition, plural, word-form, run-on) in MORE THAN roughly one sentence in four, GRA cannot exceed Band 6. Band 8 needs the MAJORITY of sentences error-free. Count the errors you actually see, then decide.
- LEXICAL RESOURCE — Band 7 needs flexible vocabulary used with some precision and awareness of collocation. Noticeable word-choice or collocation errors (e.g. "a free labour", "make a decision" written as "do a decision"), or vocabulary that stays basic and repetitive, cap Lexical Resource at Band 6.
- TASK RESPONSE / ACHIEVEMENT — a Band 7 position is clear AND developed with extended, specific support. Ideas that are relevant but generic, listed, or asserted without development cap this criterion at Band 6. A wavering or under-developed position is Band 5.
- COHERENCE & COHESION — mechanical or formulaic linking ("Firstly / Secondly / In conclusion" with little else) is Band 6; Band 7 uses a range of cohesive devices flexibly, with clear central topics in each paragraph.

TIE-BREAK: when an essay sits between two bands, award the LOWER band unless the higher band is clearly and fully met. Do NOT default all four criteria to the same number — real scripts are usually uneven, so differentiate the criteria based on the evidence.

WORKED ANCHORS (these Task 2 examples illustrate the 6/7 boundary that models most often get wrong; apply the same strictness to Task 1):
- BAND 6 anchor: "Nowadays many student prefer to study in online because it is more convenient. This trends will continue in the future which make the traditional school less popular." — the position and paragraphing are clear, but there are recurring errors ("many student", "study in online", "This trends", "which make"), the vocabulary is basic and repetitive, and ideas are relevant yet thinly developed. Correct marking is approximately Task Response 6, Coherence 6, Lexical 6, Grammar 6 -> OVERALL 6.0. Scoring this a 7 would be over-marking.
- BAND 7 anchor: a clear position developed with specific, extended examples; cohesive devices used flexibly rather than formulaically; some less-common vocabulary used accurately ("civic duty", "at the expense of"); and a variety of complex sentences that are mostly error-free with only occasional slips. ONLY this level of control and development earns Band 7.
- BAND 8 anchor: a fully developed argument, wide and precise vocabulary including less-common items used naturally, and a wide range of complex structures with the majority error-free — errors are rare and minor.

Do not over-correct in the other direction: a genuinely well-controlled, well-developed essay with only occasional slips SHOULD receive Band 7 or 8. The goal is accuracy against the descriptors, not harshness.`;
