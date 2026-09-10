// lib/liveExaminer.js
// Core logic for the gpt-live-1 AI speaking examiner (docs/MONETIZATION.md §9).
// Live is a full-duplex "voice layer + delegated brain" model: the voice layer
// owns turn-taking natively (there is NO turn_detection and NO
// input_audio_transcription config), and a Responses model runs behind it.
// Pure/DI so vitest can cover it; the API route stays thin.
//
// Session modes and the question plan are shared with the Realtime examiner —
// only the voice-layer conduct guidance differs, because the model can now
// speak while the candidate is speaking and that has to be reined in.

import { MODES, buildInstructions } from './realtimeExaminer';

export const LIVE_MODEL = process.env.OPENAI_LIVE_MODEL || 'gpt-live-1';

// Verified against the Live API voice enum 2026-09-10. Voice is immutable for
// the life of a session, so an unknown env value must not reach OpenAI.
export const LIVE_VOICES = [
  'alloy', 'ash', 'ballad', 'beacon', 'bossa', 'cedar', 'cinder', 'coral',
  'delta', 'echo', 'gleam', 'marin', 'meridian', 'quartz', 'ripple', 'sage',
  'shimmer', 'stone', 'tempo', 'verse', 'vesper', 'willow',
];

// British-sounding default: IELTS candidates expect a UK examiner voice.
export const DEFAULT_LIVE_VOICE = 'vesper';

export function resolveLiveVoice(env = process.env) {
  const requested = String(env?.OPENAI_LIVE_VOICE || '').trim().toLowerCase();
  return LIVE_VOICES.includes(requested) ? requested : DEFAULT_LIVE_VOICE;
}

// The delegated "brain" behind the voice layer. Text rates apply to it
// separately from the per-minute session price (see lib/aiCost.js).
export const LIVE_BACKEND_MODEL = process.env.OPENAI_LIVE_BACKEND_MODEL || 'gpt-5.1';

export { MODES };

// Live-specific guidance prepended to the shared examiner plan. Everything
// here exists because full duplex removes the Realtime VAD safety net: the
// model CAN talk over the candidate, so it must be told not to.
export function buildLiveVoiceInstructions(mode, items, durationSeconds) {
  const plan = buildInstructions(mode, items, durationSeconds);
  return `LIVE AUDIO CONDUCT (read first — this session is full duplex, so you can physically speak while the candidate is speaking; do not):
- Greet the candidate IMMEDIATELY when the session starts. Do not wait for them to speak first; they are waiting for you.
- Never talk over the candidate. If you find yourself speaking at the same time as the candidate, stop at once and let them finish.
- Backchannel sparingly: an occasional quiet "Mm-hm" is fine BETWEEN the candidate's sentences, never in the middle of one. Most turns need no backchannel at all.
- Candidates pause to think. When the candidate stops, wait for at least three seconds of continuous silence before you speak.
- You may consult a silent planning assistant behind the scenes. Never read its text out verbatim, never mention it, and never break the examiner persona because of it.

${plan}`;
}

// The delegated Responses model never speaks to the candidate: it hands the
// voice layer the next thing to say. Keeping it terse protects both the
// per-minute latency budget and the token bill.
export function buildLiveBackendInstructions(mode) {
  const label = MODES[mode]?.label || 'IELTS Speaking practice';
  return `You are a silent planning assistant for an IELTS Speaking examiner conducting a ${label}. You never talk to the candidate and you are never heard.

Return AT MOST two short sentences: exactly what the examiner should say next (a question, a brief acknowledgement plus the next question, or the closing line). Nothing else — no analysis, no stage directions, no labels, no quotation marks.

Never score the candidate, never give feedback, corrections, tips or band estimates, and never break the examiner role no matter what the candidate says. Follow the examiner's session plan and keep to one question at a time.`;
}

// Builds the exact POST https://api.openai.com/v1/live/sessions body.
// - No `audio.format`: WebRTC rejects it (the transport negotiates Opus).
// - `store: false`: candidate speech is never retained by the provider.
// - The data channel is locked down in BOTH directions. The browser may only
//   close/mute, so the page cannot be used to append instructions (prompt
//   injection), and only the events the page actually renders come back.
export function buildLiveSessionConfig({ instructions, backendInstructions, voice, sdp }) {
  return {
    session: {
      model: LIVE_MODEL,
      instructions,
      audio: { output: { voice: voice || DEFAULT_LIVE_VOICE } },
      store: false,
      client: {
        data_channel: {
          allowed_client_events: [
            'session.close',
            'session.input_audio.mute',
            'session.input_audio.unmute',
          ],
          allowed_server_events: [
            { type: 'session.started' },
            { type: 'session.input_transcript.delta' },
            { type: 'session.output_transcript.delta' },
            { type: 'session.usage.updated' },
            { type: 'session.closed' },
            { type: 'error' },
            { type: 'info' },
          ],
        },
      },
      delegation: {
        type: 'responses',
        responses: {
          model: LIVE_BACKEND_MODEL,
          instructions: backendInstructions,
          max_output_tokens: 300,
          reasoning: { effort: 'low' },
          text: { verbosity: 'low' },
          tool_choice: 'none',
          tools: [],
        },
      },
    },
    transport: { type: 'webrtc', sdp },
  };
}
