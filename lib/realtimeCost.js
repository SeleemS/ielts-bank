// USD / million tokens, verified against the GPT-Realtime-2.1 model page
// 2026-09-06. Audio input/output and text input/output have DIFFERENT rates.
export const REALTIME_PRICES = { audioInput: 32, audioOutput: 64, textInput: 4, textOutput: 24, cachedInput: 0.4 };

export function realtimeUsageRow({ userId, response, durationSeconds, mode }) {
  const usage = response?.usage;
  const input = usage?.input_token_details;
  const output = usage?.output_token_details;
  const cached = input?.cached_tokens_details;
  const valid = n => Number.isFinite(n) && n >= 0;
  const known = [usage?.input_tokens, usage?.output_tokens, input?.audio_tokens, input?.text_tokens,
    input?.cached_tokens, output?.audio_tokens, output?.text_tokens].every(valid)
    && (input.cached_tokens === 0 || [cached?.audio_tokens, cached?.text_tokens].every(valid));
  const cachedAudio = cached?.audio_tokens || 0;
  const cachedText = cached?.text_tokens || 0;
  const consistent = known && cachedAudio <= input.audio_tokens && cachedText <= input.text_tokens
    && cachedAudio + cachedText === input.cached_tokens
    && input.audio_tokens + input.text_tokens === usage.input_tokens
    && output.audio_tokens + output.text_tokens === usage.output_tokens;
  const cost = consistent ? ((input.audio_tokens - cachedAudio) * 32 + (input.text_tokens - cachedText) * 4
    + input.cached_tokens * 0.4 + output.audio_tokens * 64 + output.text_tokens * 24) / 1e6 : null;
  return { user_id: userId, skill: 'speaking', feature: 'speaking_realtime_audio_score', operation: 'rubric_score',
    provider: 'openai', model: 'gpt-realtime-2.1', provider_request_id: response?.id || null,
    input_tokens: usage?.input_tokens || 0, cached_input_tokens: input?.cached_tokens || 0,
    output_tokens: usage?.output_tokens || 0, audio_seconds: durationSeconds,
    cost_usd: cost, pricing_known: consistent, estimated: false, succeeded: true,
    input_rate_per_million: null, cached_input_rate_per_million: 0.4, output_rate_per_million: null,
    audio_rate_per_minute: null,
    metadata: { mode, token_details: usage || null, rates: REALTIME_PRICES, pricing_date: '2026-09-06' } };
}

// Planning only: base audio tokens, plus explicit context/text/reasoning
// budgets. Never label a minute estimate as a hard provider spend ceiling.
export function estimateSpeakingCost({ minutes, candidateShare = 0.6, examinerShare = 0.25,
  contextAndTextUsd = 0.15, assessmentTextUsd = 0.10 }) {
  if (![minutes, candidateShare, examinerShare, contextAndTextUsd, assessmentTextUsd].every(n => Number.isFinite(n) && n >= 0)
    || candidateShare + examinerShare > 1) throw new Error('invalid-cost-scenario');
  const liveAudio = minutes * (candidateShare * 600 * 32 + examinerShare * 1200 * 64) / 1e6;
  const transcription = minutes * candidateShare * 0.006;
  // Replay includes silence and examiner-time gaps from the mic recording;
  // budget the whole duration, rather than assuming silence will be free.
  const assessmentAudio = minutes * 600 * 32 / 1e6;
  return { liveAudio, transcription, assessmentAudio, contextAndTextUsd, assessmentTextUsd,
    total: liveAudio + transcription + assessmentAudio + contextAndTextUsd + assessmentTextUsd };
}

// Planning only, for the gpt-live-1 examiner: a flat $0.05 per session-minute
// billed per second. Silence, thinking time and the candidate's long turn all
// cost the same as speech — there is no token mix to optimise — so the voice
// line is simply minutes * rate. The delegated Responses model and the
// post-session assessment are billed separately at their own text rates.
export function estimateLiveSpeakingCost({ minutes, backendUsd = 0.10, assessmentUsd = 0.10 }) {
  if (![minutes, backendUsd, assessmentUsd].every(n => Number.isFinite(n) && n >= 0)) {
    throw new Error('invalid-cost-scenario');
  }
  const voice = minutes * 0.05;
  return { voice, backendUsd, assessmentUsd, total: voice + backendUsd + assessmentUsd,
    note: 'Live bills every session second, including silence; only close/hangup stops the meter.' };
}
