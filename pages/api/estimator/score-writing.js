// pages/api/estimator/score-writing.js
// Band Estimator's ANONYMOUS short-sample Writing scorer.
//   * No sign-in: a top-of-funnel tool. Identity is the client's anon_id (UUID).
//   * Scores a ~100-word paragraph with the cheap model, using a SHORT-SAMPLE
//     prompt (indicative band, NO 250-word under-length penalty) + the shared
//     WRITING_CALIBRATION gates so the band is not over-marked.
//   * The band is NEVER returned to the anonymous client — it is stored server
//     side keyed by anon_id and revealed only after sign-up (/api/estimator/
//     reveal). Gating a band client-side would be trivially bypassable.
//   * Hard-capped (per anon_id + per IP + a global daily circuit breaker) and
//     length-limited, because an anonymous endpoint that calls an LLM is a
//     spend/abuse magnet.
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { clientIp, originAllowed } from '../../../lib/apiSecurity';
import { chatCompletionWithFallback } from '../../../lib/openaiChat';
import { buildWritingScoreSchema } from '../../../lib/writingScoreSchema';
import { WRITING_CALIBRATION } from '../../../lib/writingCalibration';
import { overallBand as calculateOverallBand } from '../../../lib/bandTables';
import { chatUsageRow, recordAiUsage } from '../../../lib/aiCost';
import { WRITING_SAMPLE_TASK } from '../../../lib/estimatorConfig';

// Independently tunable from the free checker: set ESTIMATOR_MODEL to a stronger
// model (e.g. gpt-5.1) to trade cost for a sharper short-sample band without a
// code change. Defaults to the cheap free-tier model.
const MODEL = process.env.ESTIMATOR_MODEL || process.env.SCORING_MODEL_FREE || 'gpt-5.4-nano';

const MIN_WORDS = 40; // below this a short sample can't be judged
const MAX_WORDS = 180; // it's a ~100-word paragraph, not an essay
const MAX_CHARS = 1600;

// Fail-closed abuse controls.
const PER_ANON_WINDOW = 86400; // 1 day
const PER_ANON_MAX = 3; // a couple of retakes/day per visitor
const PER_IP_WINDOW = 3600; // 1 hour
const PER_IP_MAX = 8;
const GLOBAL_WINDOW = 86400;
const GLOBAL_MAX = 2000; // daily ceiling across all visitors (cost breaker)

const OPENAI_TIMEOUT_MS = 30000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let _admin = null;
function getAdmin() {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-admin-not-configured');
  _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _admin;
}

async function checkLimit(bucket, identifier, windowSeconds, max) {
  try {
    const { data, error } = await getAdmin().rpc('check_rate_limit', {
      p_bucket: bucket,
      p_identifier: identifier,
      p_window_seconds: windowSeconds,
      p_max: max,
    });
    if (error) return { allowed: false, error: true };
    return { allowed: data === true, error: false };
  } catch {
    return { allowed: false, error: true };
  }
}

function countWords(str) {
  return str.trim().split(/\s+/).filter(Boolean).length;
}

// Short-sample examiner prompt: an INDICATIVE band, not a full-essay mark.
function buildEstimatorPrompt() {
  return `You are a certified, experienced IELTS Writing examiner giving an INDICATIVE band for a SHORT writing sample of about 100 words — NOT a full Task 2 essay. This is a quick diagnostic.

RULES FOR A SHORT SAMPLE:
- DO NOT apply any under-length penalty and do not penalise the absence of a full introduction/body/conclusion. The candidate was asked for a short paragraph on purpose.
- A short sample is NOT a reason to mark generously. Frequent basic errors (missing or wrong articles, plurals, subject-verb agreement, word form) or simple, repetitive vocabulary STILL cap Grammatical Range and Lexical Resource at Band 5, exactly as they would in a full essay. The "no length penalty" applies ONLY to length and development — never to accuracy or vocabulary.
- Grammatical Range & Accuracy and Lexical Resource carry the most weight in a short sample and can be judged reliably from the language produced — judge them strictly. Judge Task Response and Coherence & Cohesion from how clearly and relevantly the paragraph answers, but do NOT award Band 7+ on these two on the strength of a single paragraph. Equally, do NOT floor them at 6: if the ideas are limited, repetitive, or only simply expressed, Task Response and Coherence can be Band 5 (or lower).
- SHORT-SAMPLE BAND 5 anchor: "I think technology is good for student because it help them to study and find information fast. Also they can talk with friend online and it make them more happy." — frequent basic errors ("student", "it help", "friend", "it make") and simple, repetitive vocabulary put Grammar and Lexical at Band 5 regardless of length.
- Give a band (0-9, halves allowed) for each of the four criteria, then the overall. Treat the result as an approximate indication of the writer's level.

${WRITING_CALIBRATION}

Keep every feedback bullet to one short sentence. Return ONLY the structured JSON object requested.`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!originAllowed(req)) {
    return res.status(403).json({ error: 'Requests from this origin are not allowed.' });
  }

  const body = req.body || {};
  const anonId = typeof body.anon_id === 'string' && UUID_RE.test(body.anon_id) ? body.anon_id : null;
  if (!anonId) return res.status(400).json({ error: 'A valid anonymous id is required.' });

  const essay = typeof body.essay === 'string' ? body.essay.trim() : '';
  if (!essay) return res.status(400).json({ error: 'Write a short response first.' });
  if (essay.length > MAX_CHARS) return res.status(400).json({ error: 'That is longer than this quick sample needs.' });
  const words = countWords(essay);
  if (words < MIN_WORDS) {
    return res.status(400).json({ error: `Write a little more — at least ${MIN_WORDS} words for an estimate (you wrote ${words}).`, code: 'too_short' });
  }
  if (words > MAX_WORDS) {
    return res.status(400).json({ error: `Keep it to a short paragraph — about 100 words (you wrote ${words}).`, code: 'too_long' });
  }

  // --- Abuse controls BEFORE calling OpenAI -------------------------------
  try {
    // Start at the narrowest identity. Each RPC increments its bucket, so a
    // locally blocked visitor must not burn IP or global availability.
    const anonLimit = await checkLimit('estimator-writing-anon', anonId, PER_ANON_WINDOW, PER_ANON_MAX);
    if (anonLimit.error) return res.status(503).json({ error: 'Scoring is temporarily unavailable. Please try again later.' });
    if (!anonLimit.allowed) {
      return res.status(429).json({ error: 'You have used your estimator writing checks for today. Create a free account to score more essays.', code: 'anon_daily_cap' });
    }

    const ip = clientIp(req);
    const ipLimit = await checkLimit('estimator-writing-ip', ip, PER_IP_WINDOW, PER_IP_MAX);
    if (ipLimit.error) return res.status(503).json({ error: 'Scoring is temporarily unavailable. Please try again later.' });
    if (!ipLimit.allowed) return res.status(429).json({ error: 'Too many attempts. Please wait a little and try again.' });

    const dayKey = new Date().toISOString().slice(0, 10);
    const global = await checkLimit('estimator-writing-global', dayKey, GLOBAL_WINDOW, GLOBAL_MAX);
    if (global.error) return res.status(503).json({ error: 'Scoring is temporarily unavailable. Please try again later.' });
    if (!global.allowed) return res.status(429).json({ error: 'The estimator is busy right now. Please try again later.' });
  } catch {
    return res.status(503).json({ error: 'Scoring is temporarily unavailable. Please try again later.' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(502).json({ error: 'Scoring is temporarily unavailable. Please try again later.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  try {
    const userContent = `TASK TYPE: Short Writing sample (diagnostic, ~100 words)

PROMPT / QUESTION:
${WRITING_SAMPLE_TASK.prompt}

CANDIDATE'S RESPONSE (${words} words):
"""
${essay}
"""

Give an INDICATIVE IELTS Writing band and return the structured JSON.`;

    const ai = await chatCompletionWithFallback({
      model: MODEL,
      fallbackModel: MODEL,
      signal: controller.signal,
      messages: [
        { role: 'system', content: buildEstimatorPrompt() },
        { role: 'user', content: userContent },
      ],
      responseFormat: { type: 'json_schema', json_schema: buildWritingScoreSchema(2) },
    });
    if (!ai.ok) {
      console.error('estimator writing score error', ai.status, (ai.detail || '').slice(0, 300));
      return res.status(502).json({ error: 'Could not score your writing. Please try again.' });
    }

    const content = ai.payload?.choices?.[0]?.message?.content;
    let result;
    try {
      result = JSON.parse(content);
    } catch {
      return res.status(502).json({ error: 'The scoring service returned an invalid result. Please try again.' });
    }
    const c = result?.criteria || {};
    const band = calculateOverallBand([
      c.taskResponse?.band,
      c.coherenceCohesion?.band,
      c.lexicalResource?.band,
      c.grammaticalRange?.band,
    ]);
    if (band === null) {
      return res.status(502).json({ error: 'The scoring service returned an invalid result. Please try again.' });
    }

    await recordAiUsage(
      getAdmin(),
      chatUsageRow({
        userId: null,
        skill: 'writing',
        feature: 'estimator_writing',
        operation: 'short_sample_score',
        model: ai.model,
        payload: ai.payload,
        metadata: { anon: true, word_count: words },
      })
    ).catch(() => {});

    // Store the band server-side keyed by anon_id. The band is deliberately
    // NOT in the response — the anonymous client only learns it was scored.
    try {
      const { error } = await getAdmin().from('estimator_writing_scores').insert({
        anon_id: anonId,
        essay,
        word_count: words,
        writing_band: band,
        result: { overallBand: band, ...result },
        model: ai.model,
      });
      if (error) throw error;
    } catch (e) {
      console.error('estimator writing store failed:', e.message);
      return res.status(503).json({ error: 'Could not save your result. Please try again.' });
    }

    return res.status(200).json({ scored: true, wordCount: words });
  } catch (e) {
    if (e.name === 'AbortError') {
      return res.status(502).json({ error: 'Scoring took too long. Please try again.' });
    }
    console.error('estimator writing score failed:', e.message);
    return res.status(502).json({ error: 'Could not score your writing. Please try again.' });
  } finally {
    clearTimeout(timeout);
  }
}
