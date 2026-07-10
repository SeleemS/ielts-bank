// pages/api/score/speaking.js
// Server-side IELTS Speaking scoring. Mirrors pages/api/score/writing.js but for
// audio: the client uploads a recording to the OWNER-ONLY `speaking-uploads`
// bucket, then POSTs the storage path here. This route (Node runtime, needs the
// secret OPENAI_API_KEY + Supabase service role):
//   * REQUIRES sign-in — verifies the Supabase bearer token and resolves the
//     user (product decision: speaking scoring is a signed-in feature);
//   * enforces per-user ownership of the audio path (the bucket is per-uid);
//   * rate-limits per user AND enforces a daily global circuit breaker via the
//     SAME Supabase check_rate_limit() RPC used by writing (service role);
//   * downloads the audio with the service role, caps its size;
//   * TRANSCRIBES with OpenAI Whisper (whisper-1);
//   * SCORES the transcript against the official IELTS Speaking band descriptors
//     on THREE transcript-assessable criteria only (Fluency & Coherence, Lexical
//     Resource, Grammatical Range & Accuracy) using Structured Outputs (strict
//     JSON schema). Pronunciation is deliberately NOT band-scored — a transcript
//     cannot assess phonemes/stress/intonation;
//   * persists a `scores` row (skill='speaking') exactly like writing so it shows
//     on the dashboard;
//   * never leaks the OpenAI key: upstream failures surface as generic 502s.
//
// pages/api/* run on the Node.js runtime by default, which is what we need
// (Whisper multipart upload + service-role secrets).
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
const MODEL = process.env.OPENAI_WRITING_MODEL || 'gpt-5.1';
const WHISPER_MODEL = 'whisper-1';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB hard cap
const MIN_TRANSCRIPT_WORDS = 15; // below this we cannot fairly score speech

// Per-user allowance and a hard global daily ceiling (cost circuit breaker),
// reusing the SAME check_rate_limit() RPC / rate_limits table as writing.
const PER_USER_WINDOW_SECONDS = 86400; // 1 day
const PER_USER_MAX = 10; // 10 scorings / day / user
const GLOBAL_WINDOW_SECONDS = 86400; // 1 day
const GLOBAL_MAX = 300; // hard daily ceiling across all users

const OPENAI_TIMEOUT_MS = 45000;

const PRONUNCIATION_NOTE =
  "Pronunciation (phonemes, stress, intonation) can't be assessed from a transcript. " +
  'Focus here on fluency, vocabulary and grammar; consider a human/tutor check for pronunciation.';

// Allowed browser origins. Missing Origin/Referer is tolerated in dev only.
const ALLOWED_ORIGINS = [
  'https://ielts-bank.com',
  'https://www.ielts-bank.com',
  'http://localhost:3000',
  'http://localhost:3025',
];

// ---------------------------------------------------------------------------
// Supabase service-role client (server-only; bypasses RLS for rate_limits,
// storage download, passage lookup and score persistence).
// ---------------------------------------------------------------------------
let _admin = null;
function getAdmin() {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-admin-not-configured');
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

function supabaseUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}

// Returns true if still within allowance, false if over the limit. On DB error
// we FAIL OPEN for availability but log it (the daily global cap is the real
// backstop; a transient RPC error should not take the feature down).
async function withinLimit(bucket, identifier, windowSeconds, max) {
  const { data, error } = await getAdmin().rpc('check_rate_limit', {
    p_bucket: bucket,
    p_identifier: identifier,
    p_window_seconds: windowSeconds,
    p_max: max,
  });
  if (error) {
    console.error('check_rate_limit error:', error.message);
    return true;
  }
  return data === true;
}

// ---------------------------------------------------------------------------
// REQUIRED auth: verify `Authorization: Bearer <access token>` and return the
// user id. Unlike writing (optional auth), speaking REQUIRES sign-in, so a null
// here is a 401 upstream. Uses the Supabase auth API via the admin client.
// ---------------------------------------------------------------------------
async function resolveUserId(req) {
  try {
    const authz = req.headers.authorization || req.headers.Authorization || '';
    const match = /^Bearer\s+(.+)$/i.exec(String(authz).trim());
    if (!match) return null;
    const token = match[1].trim();
    if (!token) return null;
    const { data, error } = await getAdmin().auth.getUser(token);
    if (error || !data || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

// Fetch the passage (+ speaking detail) by slug via the service role, so the
// model knows what the candidate was actually asked. Returns { id, contextText }
// or null. Never throws (scoring proceeds with minimal context on failure).
async function fetchPassageContext(passageSlug, part) {
  try {
    const admin = getAdmin();
    const { data, error } = await admin
      .from('passages')
      .select(
        'id, title, speaking_details ( part, part1_questions, cue_card, part3_followups )'
      )
      .eq('slug', passageSlug)
      .eq('skill', 'speaking')
      .maybeSingle();
    if (error || !data) {
      if (error) console.error('passage lookup failed:', error.message);
      return null;
    }
    const det = Array.isArray(data.speaking_details)
      ? data.speaking_details[0]
      : data.speaking_details;
    return { id: data.id, contextText: buildPassageContextText(data.title, det, part) };
  } catch (e) {
    console.error('fetchPassageContext error:', e.message);
    return null;
  }
}

// Turn the part-specific JSONB into a compact plain-text brief for the examiner
// prompt. Defensive: any missing shape just yields less context, never a throw.
function buildPassageContextText(title, det, part) {
  const lines = [];
  if (title) lines.push(`Topic: ${title}`);
  if (!det) return lines.join('\n');

  const listQuestions = (arr) =>
    (Array.isArray(arr) ? arr : [])
      .map((q) => (q && typeof q.text === 'string' ? `- ${q.text}` : null))
      .filter(Boolean)
      .join('\n');

  if (part === 1 && det.part1_questions) {
    const p = det.part1_questions;
    if (p.topic) lines.push(`Part 1 topic: ${p.topic}`);
    const qs = listQuestions(p.questions);
    if (qs) lines.push('Questions asked:\n' + qs);
  } else if (part === 2 && det.cue_card) {
    const c = det.cue_card;
    if (c.topic) lines.push(`Cue card: ${c.topic}`);
    if (Array.isArray(c.bullets) && c.bullets.length) {
      lines.push('You should say:\n' + c.bullets.map((b) => `- ${b}`).join('\n'));
    }
    if (c.explainLine) lines.push(c.explainLine);
  } else if (part === 3 && det.part3_followups) {
    const p = det.part3_followups;
    if (p.theme) lines.push(`Part 3 theme: ${p.theme}`);
    const qs = listQuestions(p.questions);
    if (qs) lines.push('Discussion questions:\n' + qs);
  }
  return lines.join('\n');
}

// Persist a completed speaking score. Because scores.attempt_id is NOT NULL
// (0004) and scores are service-role-write only (0005), we insert an `attempts`
// row first (skill='speaking') then the `scores` row referencing it, both via
// the service-role client (bypasses RLS). Fully fail-soft: a DB error is logged
// (message only, never keys) and never affects the scoring response.
async function saveSpeakingScore({
  userId,
  passageId,
  part,
  audioPath,
  transcript,
  overallBand,
  criteria,
  model,
}) {
  try {
    const admin = getAdmin();

    const { data: attempt, error: attemptErr } = await admin
      .from('attempts')
      .insert({
        user_id: userId,
        passage_id: passageId || null,
        skill: 'speaking',
        responses: { part, audioPath, transcript },
        band: overallBand,
        submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (attemptErr || !attempt) {
      console.error('speaking attempt insert failed:', attemptErr?.message || 'no row');
      return;
    }

    const { error: scoreErr } = await admin.from('scores').insert({
      attempt_id: attempt.id,
      user_id: userId,
      skill: 'speaking',
      overall_band: overallBand,
      criteria,
      model,
    });
    if (scoreErr) console.error('speaking score insert failed:', scoreErr.message);
  } catch (e) {
    console.error('saveSpeakingScore error:', e.message);
  }
}

function originAllowed(req) {
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  if (!origin && !referer) {
    return process.env.NODE_ENV !== 'production';
  }
  const candidate = origin || referer;
  return ALLOWED_ORIGINS.some((allowed) => candidate.startsWith(allowed));
}

function countWords(str) {
  return String(str || '')
    .split(/\s+/)
    .filter(Boolean).length;
}

// Average of the three criterion bands, rounded to the NEAREST 0.5.
function roundHalfBand(a, b, c) {
  const avg = (a + b + c) / 3;
  return Math.round(avg * 2) / 2;
}

function isBand(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 9;
}

// ---------------------------------------------------------------------------
// Examiner rubric (system prompt) — THREE transcript-assessable criteria only.
// ---------------------------------------------------------------------------
function buildSystemPrompt() {
  return `You are a certified, experienced IELTS Speaking examiner. You mark strictly and consistently against the official IELTS Speaking public band descriptors. Marking is fair and evidence-based: for every judgement you cite concrete evidence quoted or paraphrased from the candidate's transcribed answer.

IMPORTANT: you are scoring a TRANSCRIPT of the candidate's spoken answer (produced by automatic speech recognition). You therefore assess ONLY the THREE criteria that a transcript can support, each on the 0-9 band scale (halves allowed, e.g. 6.5):

1. Fluency and Coherence — the ability to talk at length coherently: flow and pace evident in the transcript, connected ideas, logical sequencing and topic development, use of cohesive devices and discourse markers, and self-correction/hesitation markers ("um", "you know", false starts, repetition) where visible. Do NOT penalise natural spoken features that would be normal in speech.
2. Lexical Resource — range and precision of vocabulary, ability to paraphrase, use of less common and idiomatic items, collocation, and appropriacy for the topic.
3. Grammatical Range and Accuracy — range of structures (simple vs. complex), the proportion of error-free clauses, and the communicative effect of errors.

You do NOT assess Pronunciation — it cannot be judged from a transcript. Do not mention a pronunciation band.

WHAT THE BANDS MEAN (apply the real Speaking descriptors):
- Band 9: speaks fluently with only very occasional repetition/self-correction; any hesitation is content- not language-related; fully coherent and appropriately developed; full and precise vocabulary with natural idiomatic control; full range of structures naturally and accurately, errors extremely rare.
- Band 8: fluent with only occasional repetition/self-correction; hesitation usually content-related; develops topics coherently; wide vocabulary to convey precise meaning, skilful paraphrase; wide range of structures flexibly, majority error-free, only occasional inappropriacies/basic errors.
- Band 7: speaks at length without noticeable effort (some loss of coherence from occasional repetition/self-correction/hesitation); flexible use of a range of connectives/discourse markers; vocabulary resource to discuss a variety of topics with some less common/idiomatic items (with occasional inaccuracies); a range of complex structures with frequent error-free sentences, though some grammatical errors persist.
- Band 6: willing to speak at length though may lose coherence at times due to occasional repetition/self-correction/hesitation; uses a range of connectives but not always appropriately; wide enough vocabulary to discuss topics at length and make meaning clear despite inappropriacies; a mix of simple and complex structures with limited flexibility; frequent errors in complex structures though these rarely impede communication.
- Band 5: usually maintains flow but with noticeable effort, repetition, self-correction and/or slow speech; over-uses certain connectives/discourse markers; manages to talk about familiar/unfamiliar topics but with limited flexibility and frequent inappropriate word choice; basic sentence forms with reasonable accuracy but limited range of complex structures, which usually contain errors and may cause comprehension problems.
- Band 4: cannot respond without noticeable pauses; may speak slowly with frequent repetition/self-correction; links only basic sentences with simple connectives, with repetitious use; able to talk about familiar topics only, conveying basic meaning; produces basic sentence forms and some correct simple sentences but subordinate structures are rare and errors are frequent.
- Below 4: long pauses before most words; little communication possible; only isolated words or memorised utterances; cannot produce basic sentence forms.

EVIDENCE FROM THE TRANSCRIPT: base every band on what is actually present. A short answer that shows little language cannot score highly on any criterion — say so and note the limited sample. Treat ASR artefacts charitably (do not penalise a plausible mishearing as a "grammar error" unless the transcript clearly shows a candidate error).

OVERALL BAND RULE: overallBand = the average of the THREE criterion bands, rounded to the NEAREST 0.5. Compute it exactly this way; do not eyeball it.

FEEDBACK STYLE: Be specific and constructive. In each criterion's feedback, name concrete strengths and weaknesses and quote or paraphrase actual phrases from the transcript as evidence. The summary should give an honest overall picture. improvements must be concrete, actionable next steps the candidate can practise.

Return ONLY the structured JSON object requested — no prose, no markdown, no HTML.`;
}

function buildJsonSchema() {
  const criterion = {
    type: 'object',
    additionalProperties: false,
    properties: {
      band: { type: 'number', description: 'Band 0-9, halves allowed' },
      feedback: {
        type: 'string',
        description: 'Evidence-based feedback citing the transcript',
      },
    },
    required: ['band', 'feedback'],
  };
  return {
    name: 'ielts_speaking_assessment',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        overallBand: {
          type: 'number',
          description: 'Average of the three criteria, rounded to nearest 0.5',
        },
        criteria: {
          type: 'object',
          additionalProperties: false,
          properties: {
            fluencyCoherence: criterion,
            lexicalResource: criterion,
            grammaticalRange: criterion,
          },
          required: ['fluencyCoherence', 'lexicalResource', 'grammaticalRange'],
        },
        summary: { type: 'string' },
        improvements: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['overallBand', 'criteria', 'summary', 'improvements'],
    },
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!originAllowed(req)) {
    return res
      .status(403)
      .json({ error: 'Requests from this origin are not allowed.' });
  }

  // --- 1. REQUIRED auth ----------------------------------------------------
  let userId;
  try {
    userId = await resolveUserId(req);
  } catch (e) {
    console.error('auth check failed:', e.message);
    return res
      .status(503)
      .json({ error: 'Scoring is temporarily unavailable. Please try again later.' });
  }
  if (!userId) {
    return res
      .status(401)
      .json({ error: 'Please sign in to get your speaking answer scored.' });
  }

  // --- Validate body -------------------------------------------------------
  const body = req.body || {};
  const passageSlug =
    typeof body.passageSlug === 'string' ? body.passageSlug.trim() : '';
  const part = body.part === 1 || body.part === 2 || body.part === 3
    ? body.part
    : Number(body.part) === 1 || Number(body.part) === 2 || Number(body.part) === 3
      ? Number(body.part)
      : null;
  const audioPath =
    typeof body.audioPath === 'string' ? body.audioPath.trim() : '';

  if (!passageSlug) {
    return res.status(400).json({ error: 'passageSlug is required.' });
  }
  if (!part) {
    return res.status(400).json({ error: 'part must be 1, 2 or 3.' });
  }
  if (!audioPath) {
    return res.status(400).json({ error: 'audioPath is required.' });
  }
  // No path traversal / absolute paths.
  if (audioPath.includes('..') || audioPath.startsWith('/')) {
    return res.status(400).json({ error: 'Invalid audioPath.' });
  }

  // --- 2. Ownership: the bucket is per-uid; the path MUST be under the user's
  // own folder. This is the primary IDOR guard (defence-in-depth over RLS).
  if (!audioPath.startsWith(`${userId}/`)) {
    return res
      .status(403)
      .json({ error: 'You can only score your own recordings.' });
  }

  // --- 3. Rate limit BEFORE any OpenAI spend -------------------------------
  try {
    const dayKey = new Date().toISOString().slice(0, 10);
    const globalOk = await withinLimit(
      'speaking-score-global',
      dayKey,
      GLOBAL_WINDOW_SECONDS,
      GLOBAL_MAX
    );
    if (!globalOk) {
      return res.status(429).json({
        error:
          'AI scoring is temporarily unavailable due to high demand. Please try again later.',
      });
    }

    const userOk = await withinLimit(
      'speaking-score',
      userId,
      PER_USER_WINDOW_SECONDS,
      PER_USER_MAX
    );
    if (!userOk) {
      return res.status(429).json({
        error: `You have reached the limit of ${PER_USER_MAX} speaking scorings per day. Please try again tomorrow.`,
      });
    }
  } catch (e) {
    console.error('rate-limit check failed:', e.message);
    return res
      .status(503)
      .json({ error: 'Scoring is temporarily unavailable. Please try again later.' });
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set');
    return res
      .status(502)
      .json({ error: 'Scoring is temporarily unavailable. Please try again later.' });
  }

  // --- 4. Download the audio via the SERVICE ROLE, capped at 10 MB ---------
  let audioBuffer;
  let audioContentType = 'audio/webm';
  try {
    const encodedPath = audioPath
      .split('/')
      .map(encodeURIComponent)
      .join('/');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const objRes = await fetch(
      `${supabaseUrl()}/storage/v1/object/speaking-uploads/${encodedPath}`,
      { headers: { Authorization: `Bearer ${key}`, apikey: key } }
    );
    if (objRes.status === 404 || objRes.status === 400) {
      return res
        .status(404)
        .json({ error: 'Recording not found. Please upload it again.' });
    }
    if (!objRes.ok) {
      console.error('storage download error', objRes.status);
      return res
        .status(502)
        .json({ error: 'Could not read your recording. Please try again.' });
    }
    const declaredLen = Number(objRes.headers.get('content-length') || 0);
    if (declaredLen && declaredLen > MAX_AUDIO_BYTES) {
      return res
        .status(413)
        .json({ error: 'Your recording is too large to score (max 10 MB).' });
    }
    audioContentType = objRes.headers.get('content-type') || audioContentType;
    const arrBuf = await objRes.arrayBuffer();
    audioBuffer = Buffer.from(arrBuf);
    if (audioBuffer.length > MAX_AUDIO_BYTES) {
      return res
        .status(413)
        .json({ error: 'Your recording is too large to score (max 10 MB).' });
    }
    if (audioBuffer.length === 0) {
      return res
        .status(422)
        .json({ error: 'Your recording appears to be empty. Please record again.' });
    }
  } catch (e) {
    console.error('audio download failed:', e.message);
    return res
      .status(502)
      .json({ error: 'Could not read your recording. Please try again.' });
  }

  // --- 5. TRANSCRIBE with Whisper ------------------------------------------
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  let transcript = '';
  try {
    const filename = audioPath.split('/').pop() || 'recording.webm';
    const form = new FormData();
    form.append('model', WHISPER_MODEL);
    form.append('response_format', 'json');
    form.append(
      'file',
      new Blob([audioBuffer], { type: audioContentType }),
      filename
    );

    const wRes = await fetch(OPENAI_TRANSCRIBE_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });

    if (!wRes.ok) {
      const detail = await wRes.text().catch(() => '');
      console.error('Whisper error', wRes.status, detail.slice(0, 500));
      clearTimeout(timeout);
      return res.status(502).json({
        error: 'We could not transcribe your recording. Please try again.',
      });
    }
    const wPayload = await wRes.json();
    transcript = typeof wPayload?.text === 'string' ? wPayload.text.trim() : '';
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      console.error('Whisper request timed out');
      return res
        .status(502)
        .json({ error: 'Transcription took too long. Please try again.' });
    }
    console.error('transcription failed:', e.message);
    return res
      .status(502)
      .json({ error: 'We could not transcribe your recording. Please try again.' });
  }

  const transcriptWords = countWords(transcript);
  if (transcriptWords < MIN_TRANSCRIPT_WORDS) {
    clearTimeout(timeout);
    return res.status(422).json({
      error:
        "We couldn't hear enough speech to score — please record again and speak for longer.",
    });
  }

  // --- 6. SCORE the transcript ---------------------------------------------
  // Fetch what the candidate was asked (best-effort; also gives us passage_id).
  const passage = await fetchPassageContext(passageSlug, part);
  const passageId = passage?.id || null;
  const contextText = passage?.contextText || '(question text unavailable)';

  try {
    const userContent = `IELTS SPEAKING — PART ${part}

WHAT THE CANDIDATE WAS ASKED:
${contextText}

CANDIDATE'S SPOKEN ANSWER (auto-transcribed, ${transcriptWords} words):
"""
${transcript}
"""

Assess this transcript as an IELTS Speaking examiner on the three transcript-assessable criteria and return the structured JSON.`;

    const openaiRes = await fetch(OPENAI_CHAT_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: userContent },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: buildJsonSchema(),
        },
      }),
    });

    if (!openaiRes.ok) {
      const detail = await openaiRes.text().catch(() => '');
      console.error('OpenAI error', openaiRes.status, detail.slice(0, 500));
      return res.status(502).json({
        error: 'The scoring service could not process your response. Please try again.',
      });
    }

    const payload = await openaiRes.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      console.error('OpenAI returned no content', JSON.stringify(payload).slice(0, 500));
      return res.status(502).json({
        error: 'The scoring service returned an empty result. Please try again.',
      });
    }

    let result;
    try {
      result = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse OpenAI JSON:', e.message);
      return res.status(502).json({
        error: 'The scoring service returned an invalid result. Please try again.',
      });
    }

    const c = result.criteria || {};
    const fc = c.fluencyCoherence || {};
    const lr = c.lexicalResource || {};
    const gr = c.grammaticalRange || {};
    if (!isBand(fc.band) || !isBand(lr.band) || !isBand(gr.band)) {
      console.error('OpenAI returned invalid bands', JSON.stringify(c).slice(0, 300));
      return res.status(502).json({
        error: 'The scoring service returned an invalid result. Please try again.',
      });
    }

    // Compute the overall server-side (never trust the model's arithmetic):
    // average of the three, rounded to nearest 0.5.
    const overallBand = roundHalfBand(fc.band, lr.band, gr.band);

    const criteria = {
      fluencyCoherence: { band: fc.band, feedback: fc.feedback || '' },
      lexicalResource: { band: lr.band, feedback: lr.feedback || '' },
      grammaticalRange: { band: gr.band, feedback: gr.feedback || '' },
    };

    // --- 7. Persist (mirrors writing). Never blocks the response. ----------
    await saveSpeakingScore({
      userId,
      passageId,
      part,
      audioPath,
      transcript,
      overallBand,
      criteria,
      model: MODEL,
    });

    // --- 8. Respond with the exact contract shape --------------------------
    return res.status(200).json({
      overallBand,
      criteria,
      pronunciation: { assessed: false, note: PRONUNCIATION_NOTE },
      summary: typeof result.summary === 'string' ? result.summary : '',
      improvements: Array.isArray(result.improvements) ? result.improvements : [],
      transcript,
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      console.error('OpenAI request timed out');
      return res.status(502).json({ error: 'Scoring took too long. Please try again.' });
    }
    console.error('Scoring failed:', e.message);
    return res.status(502).json({
      error: 'Scoring is temporarily unavailable. Please try again later.',
    });
  } finally {
    clearTimeout(timeout);
  }
}
