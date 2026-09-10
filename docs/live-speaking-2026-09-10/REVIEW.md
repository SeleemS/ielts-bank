# IELTS Speaking: gpt-live-1 examiner pilot review

Prepared 10 September 2026. The implementation is local and disabled by default. No prices, customer
allowances or production settings were changed. The existing `gpt-realtime-2.1` examiner is untouched
and remains the shipped path.

## What is being piloted

A second examiner transport built on OpenAI's Live API and the `gpt-live-1` model, selected at build
time by `NEXT_PUBLIC_LIVE_EXAMINER`. When the flag is off the page behaves exactly as today and the
new API routes return 503.

## What GPT-Live is

[`gpt-live-1`](https://developers.openai.com/api/docs/models/gpt-live-1) is a two-layer speech model.
A low-latency voice layer holds the conversation; a delegated backend text model — configured here as
`gpt-5.1` via `delegation: { type: 'responses' }` — does the slower planning and is billed separately
at ordinary text rates. See the [Live guide](https://developers.openai.com/api/docs/guides/live) and
[Live conversations](https://developers.openai.com/api/docs/guides/live-conversations).

Differences from Realtime 2.1 that matter to this product:

- **Full duplex.** Audio flows in both directions continuously. There is no `turn_detection` setting
  and no VAD to tune; turn-taking is the model's own behaviour, steered only by instructions.
- **Native transcripts.** There is no `input_audio_transcription` config. The data channel emits
  `session.input_transcript.delta` and `session.output_transcript.delta` fragments with `start_ms` /
  `end_ms`. There is no "transcript done" event and no item ids, so turn grouping is ours.
- **No ephemeral client secret.** Unlike Realtime, the Live API has no client-token mint. The browser
  builds its WebRTC offer and posts the SDP to our server, which exchanges it with OpenAI using the
  server API key and returns the answer ([voice over WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc)).
  The browser never speaks to OpenAI's control plane.
- **Locked data channel.** `client.data_channel` whitelists exactly what the browser may send
  (`session.close`, `session.input_audio.mute`, `session.input_audio.unmute`) and receive
  (started, transcript deltas, usage, closed, error, info). Instruction-mutating client events are
  not permitted, which closes an obvious prompt-injection surface.
- **Server-side hangup as a trusted spend cap.** `POST /v1/live/sessions/{id}/hangup` ends a session
  from the server. Every session is persisted in `public.live_examiner_sessions` with a `deadline_at`
  (reserved duration plus a 45-second grace), and `/api/live/session/end` calls hangup when the
  candidate finishes. This is the control the 2026-09-06 review said was missing: browser-side
  termination was never a provider-enforced ceiling.
- **Cron sweep.** `/api/cron/live-hangup` runs every 10 minutes, picks up rows with `ended_at is null`
  and an expired deadline, and hangs them up. It retries up to five times before marking
  `hangup_failed`. This bounds the cost of a browser that crashes mid-interview.
- **Context.** 128k window with automatic compaction above 90%. Authoritative interview state stays
  in the app; instructions are kept compact.

## What changes for candidates

- **Turn-taking feels different.** The examiner starts speaking on its own when the session opens
  rather than waiting for a client-sent greeting trigger, and it can begin responding while the
  candidate is still finishing. Instructions ask it to wait at least three seconds of silence when a
  candidate pauses to think and to backchannel sparingly.
- **Interjections are possible.** Short acknowledgements ("Mm-hm") can overlap the candidate. Under
  Realtime 2.1 the examiner could only speak after a VAD-detected end of turn.
- **Voice.** The default is `vesper`, a British voice, chosen for exam plausibility. It is set at
  session creation and cannot be changed mid-session. `OPENAI_LIVE_VOICE` overrides it; an
  unrecognised value falls back to `vesper`.

## What does not change

- **Post-interview scoring.** The transcript still goes to `/api/score/speaking-realtime` on
  `gpt-5.1`. The examiner is not the grader.
- **The audio assessment pilot stays on `gpt-realtime-2.1`.** Candidate-audio pronunciation
  assessment, the assessment ticket, the upload path and the four-criterion rubric are unchanged and
  still gated by `NEXT_PUBLIC_REALTIME_AUDIO_ASSESSMENT`.
- **Entitlements.** Same premium gate, same 60/30-minute allowances, same per-IP and global mint
  limits, same refund-on-provider-failure behaviour.

## Cost model

Live is priced by wall-clock session time, not tokens: **$0.05 per session minute, billed per second
with no rounding**. Creating a WebRTC session bills 15 seconds up front, credited against the running
session; an abandoned session still costs that 15 seconds (~$0.0125). Muting the microphone does not
stop billing — only close or hangup does. The delegated backend model is billed separately at
`gpt-5.1` text rates. See [voice latency and cost](https://developers.openai.com/api/docs/guides/voice-latency-cost)
and the [Live session reference](https://developers.openai.com/api/reference/resources/live/primary-websocket).

Realtime figures below are the planning totals from `docs/realtime-speaking-2026-09-06/REVIEW.md`.
Live figures use $0.05/min voice, a $0.10 backend allowance and the same $0.10 assessment allowance.

| Component | Realtime 2.1 drill (5 min) | Live drill (5 min) | Realtime 2.1 mock (14 min) | Live mock (14 min) |
|---|---:|---:|---:|---:|
| Voice / live audio | $0.154 | $0.250 | $0.430 | $0.700 |
| Live context/text/reasoning | $0.150 | — | $0.150 | — |
| Backend (`gpt-5.1`) allowance | — | $0.100 | — | $0.100 |
| Candidate transcription | $0.018 | — | $0.050 | — |
| Recording replay for assessment | $0.096 | — | $0.269 | — |
| Assessment text/reasoning | $0.100 | $0.100 | $0.100 | $0.100 |
| **Planning total** | **$0.518** | **$0.450** | **$0.999** | **$0.900** |

Two caveats on that table. Live needs no separate transcription line because transcripts are native,
but if the audio-assessment pilot is enabled alongside Live the recording-replay and Whisper lines
from the 2026-09-06 model still apply on top ($0.114 for a drill, $0.319 for a mock), which puts Live
above Realtime for both shapes. And the Live column is far less sensitive to conversation shape: it
does not vary with turn count, prompt length, caching or response length.

The important structural change is that **silence is now billed at the same rate as speech**. Under
Realtime, a quiet candidate produced fewer audio tokens. Under Live, the Part 2 one-minute preparation
window costs $0.05 whether or not anyone speaks, as does every pause, every re-read of a cue card and
every hesitation. A drill where the candidate says almost nothing costs the same as one where they
speak throughout.

### Allowance implications

At $0.05 per minute, a fully used allowance has a hard voice floor before any backend, assessment or
scoring cost:

| Allowance | Voice floor | Plus backend at $0.10/session (4 mocks / 12 drills) |
|---|---:|---:|
| 60 minutes (global) | $3.00 | ~$3.40 / ~$4.20 |
| 30 minutes (PPP) | $1.50 | ~$1.70 / ~$2.10 |

Against a $4.17/month global annual plan and a $1.67/month discounted annual plan, the 30-minute PPP
allowance exceeds plan revenue at full utilisation on voice alone. This is not new — the 2026-09-06
review reached the same conclusion — but Live makes the floor deterministic rather than
usage-dependent, which is easier to forecast and harder to get lucky with. Do not raise allowances on
the strength of the flat rate looking tidy.

## Rollout gates

- `NEXT_PUBLIC_LIVE_EXAMINER=true` at build time. It is build-time, so a rebuild is required; the
  server route independently 503s unless it is `'true'`.
- `OPENAI_LIVE_MODEL=gpt-live-1`, `OPENAI_LIVE_VOICE=vesper`, `OPENAI_LIVE_BACKEND_MODEL=gpt-5.1`.
  `OPENAI_API_KEY` is now used for the SDP exchange as well as scoring.
- **Concurrency, not requests, is the provider limit.** Live rate-limits concurrent sessions: 25 at
  Tier 1. That is the real ceiling on simultaneous interviews, and it is lower than our daily mint
  budget implies. Confirm the account tier before any open enrolment.
- Migration `supabase/migrations/20260910120000_live_examiner_sessions.sql` must be applied. Without
  the session table the hangup path and the sweep have nothing to act on.
- `vercel.json` must carry the `/api/cron/live-hangup` entry at `*/10 * * * *`, and `CRON_SECRET`
  must be set. A deployment with the flag on and the cron missing has no backstop spend cap.

## Open risks

1. **Full duplex may interrupt candidates during Part 2.** The long-turn task requires two minutes of
   uninterrupted speech. There is no VAD threshold to raise — only instructions asking the model to
   wait. This needs human listening tests before any candidate sees it.
2. **Transcript turn grouping is heuristic.** Fragments carry timing but no turn boundaries, so turns
   are assembled by role change plus a 1.5-second gap. Overlapping speech, which full duplex makes
   more likely, can split or merge turns, and the scorer sees the assembled text.
3. **Maximum session duration is undocumented.** `expires_at` arrives in `session.started`, but no
   published ceiling exists. Our own deadline and sweep are the only durable bound.
4. **Client-reported usage seconds are not provider-verified.** `session.usage.updated` and
   `session.closed` are read in the browser and posted back to us. The ledger records them as
   estimates capped at reserved duration plus 30 seconds. Reconcile against provider billing exports
   before treating any Live cost figure as exact.
5. **Knowledge cutoff is July 2025.** Exam-format or policy details after that date must come from our
   instructions, not the model's own knowledge.
6. No live end-to-end interview has been conducted on `gpt-live-1` in this repository. Every cost and
   behaviour statement above is from the published documentation and the implementation, not from a
   measured session.

## Pre-launch checklist

- [ ] Run at least five full 14-minute mocks on real hardware and confirm the examiner does not
      interrupt Part 2 long turns; tune instructions and re-test.
- [ ] Verify the assembled transcript against a human listening pass on overlapping speech.
- [ ] Confirm hangup works: end a session normally, kill the browser tab mid-interview, and check the
      cron sweep closes the orphan within ten minutes.
- [ ] Confirm the account's concurrent-session limit and decide the enrolment cap from it.
- [ ] Apply the migration and the cron entry in the target environment before flipping the flag.
- [ ] Reconcile a day of Live sessions against the provider billing export; compare with the
      `speaking_live` ledger rows.
- [ ] Measure p50/p95 minutes per completed session, including abandoned sessions and their 15-second
      init charges.
- [ ] Confirm the voice default reads as an examiner to native and non-native listeners.
- [ ] Decide whether Live and the audio-assessment pilot may be enabled together, given the stacked
      cost noted above.
- [ ] Leave allowances unchanged until measured cost exists.

## Live check, 10 September 2026 (after model access was enabled)

A synthetic primary-WebSocket session using the exact mint-route session config (minus the WebRTC-only data-channel lockdown, which the API confirmed is rejected on WebSocket) was accepted by `gpt-live-1`: voice `vesper`, Responses delegation to `gpt-5.1`, examiner greeted unprompted ("Hello, I'm your examiner. This is…"), closed with `close_requested`. Raw result in `synthetic-session.json`. This confirms the contract, not the interview quality; a real microphone session is still required.
