// pages/speaking-examiner.js
// Live AI speaking examiner (Premium): a real-time voice interview over
// WebRTC with the OpenAI Realtime model, followed by a rubric-anchored
// transcript score from the standard scoring pass. docs/MONETIZATION.md §9.
import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { Mic, PhoneOff, Sparkles, Loader2, Clock, CheckCircle2 } from 'lucide-react';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';
import { Card, CardContent } from '../components/ui/card';
import SignInDialog from '../src/components/auth/SignInDialog';
import { useAuth } from '../src/lib/auth';
import { usePlan } from '../src/lib/usePlan';
import { useRealtimeMinutes } from '../src/lib/useRealtimeMinutes';
import { getSupabase } from '../lib/supabase';
import { track } from '../src/lib/analytics';

import { SITE_URL } from '../lib/site';
const PAGE_TITLE = 'Live AI IELTS Speaking Examiner – Real Mock Interview';
const PAGE_DESCRIPTION =
  'Take a live IELTS Speaking mock interview with an AI examiner: adaptive Part 1 questions, a timed Part 2 cue card, probing Part 3 follow-ups, and a band score with feedback at the end.';

const MODE_CARDS = [
  { mode: 'mock', title: 'Full mock interview', minutes: 14, blurb: 'Parts 1-3, exactly like the real test.' },
  { mode: 'part1', title: 'Part 1 drill', minutes: 5, blurb: 'Interview questions about familiar topics.' },
  { mode: 'part2', title: 'Part 2 drill', minutes: 5, blurb: 'Cue card, one minute prep, long turn.' },
  { mode: 'part3', title: 'Part 3 drill', minutes: 5, blurb: 'Abstract discussion questions.' },
];

function fmtTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function SpeakingExaminerPage() {
  const { user } = useAuth();
  const { isPremium, loading: planLoading } = usePlan();
  const minutes = useRealtimeMinutes();

  // phase: idle | connecting | live | scoring | done | error
  const [phase, setPhase] = React.useState('idle');
  const [error, setError] = React.useState('');
  const [signInOpen, setSignInOpen] = React.useState(false);
  const [captions, setCaptions] = React.useState([]); // [{role, text}]
  const [secondsLeft, setSecondsLeft] = React.useState(0);
  const [result, setResult] = React.useState(null);
  const [activeMode, setActiveMode] = React.useState(null);

  const pcRef = React.useRef(null);
  const micRef = React.useRef(null);
  const transcriptRef = React.useRef([]);
  const timerRef = React.useRef(null);
  const audioRef = React.useRef(null);
  const endedRef = React.useRef(false);
  const captionsBoxRef = React.useRef(null);
  // Greeting kick-off must fire exactly once per session — a re-opened data
  // channel or duplicate open event must never trigger a second greeting.
  const greetedRef = React.useRef(false);
  // Waveform visualizer: one shared AudioContext with an analyser per party.
  const audioCtxRef = React.useRef(null);
  const analyserExamRef = React.useRef(null);
  const analyserMicRef = React.useRef(null);
  const rafRef = React.useRef(0);
  const canvasRef = React.useRef(null);
  const speakingStateRef = React.useRef(null);
  const [speaking, setSpeaking] = React.useState(null); // 'examiner' | 'candidate' | null

  React.useEffect(() => {
    if (captionsBoxRef.current) {
      captionsBoxRef.current.scrollTop = captionsBoxRef.current.scrollHeight;
    }
  }, [captions]);

  React.useEffect(() => () => teardown(), []); // unmount cleanup

  function teardown() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    try {
      micRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    try {
      pcRef.current?.close();
    } catch {}
    try {
      audioCtxRef.current?.close();
    } catch {}
    micRef.current = null;
    pcRef.current = null;
    audioCtxRef.current = null;
    analyserExamRef.current = null;
    analyserMicRef.current = null;
    speakingStateRef.current = null;
  }

  // ---- waveform visualizer -------------------------------------------------
  function attachAnalyser(stream) {
    try {
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        audioCtxRef.current = new Ctx();
      }
      const analyser = audioCtxRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      audioCtxRef.current.createMediaStreamSource(stream).connect(analyser);
      return analyser;
    } catch {
      return null; // visualizer is progressive enhancement — never block audio
    }
  }

  function startVisualizer() {
    const BARS = 56;
    const read = (analyser, out) => {
      if (!analyser) return 0;
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const step = Math.max(1, Math.floor((data.length * 0.7) / BARS));
      let sum = 0;
      for (let i = 0; i < BARS; i += 1) {
        const v = data[i * step] / 255;
        out[i] = v;
        sum += v * v;
      }
      return Math.sqrt(sum / BARS);
    };
    const ex = new Array(BARS).fill(0);
    const me = new Array(BARS).fill(0);
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
      if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const exLevel = read(analyserExamRef.current, ex);
      const meLevel = read(analyserMicRef.current, me);
      const active =
        exLevel > 0.08 || meLevel > 0.08 ? (exLevel >= meLevel ? 'examiner' : 'candidate') : null;
      if (active !== speakingStateRef.current) {
        speakingStateRef.current = active;
        setSpeaking(active);
      }

      // Mirrored bars around the midline: examiner (navy) up, you (emerald) down.
      const mid = h / 2;
      const gap = 2;
      const bw = Math.max(2, (w - gap * (BARS - 1)) / BARS);
      for (let i = 0; i < BARS; i += 1) {
        const x = i * (bw + gap);
        const up = Math.max(1.5, ex[i] * (mid - 3));
        const dn = Math.max(1.5, me[i] * (mid - 3));
        ctx.fillStyle = 'hsla(215, 60%, 25%, 0.9)';
        ctx.fillRect(x, mid - up, bw, up);
        ctx.fillStyle = 'hsla(160, 84%, 39%, 0.9)';
        ctx.fillRect(x, mid + 1, bw, dn);
      }
    };
    if (!rafRef.current) rafRef.current = requestAnimationFrame(loop);
  }

  function pushTranscript(role, text) {
    if (!text || !text.trim()) return;
    transcriptRef.current = [...transcriptRef.current, { role, text: text.trim() }];
    setCaptions(transcriptRef.current);
  }

  async function authHeader() {
    const { data } = await getSupabase().auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : null;
  }

  async function startSession(mode) {
    setError('');
    if (!user) {
      setSignInOpen(true);
      return;
    }
    setPhase('connecting');
    setActiveMode(mode);
    transcriptRef.current = [];
    setCaptions([]);
    setResult(null);
    endedRef.current = false;
    track('realtime_session_start', { mode });

    try {
      const headers = await authHeader();
      if (!headers) {
        setSignInOpen(true);
        setPhase('idle');
        return;
      }

      // 1. Mic first — no point burning minutes if permission is denied.
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micRef.current = mic;
      greetedRef.current = false;
      analyserMicRef.current = attachAnalyser(mic);

      // 2. Mint the metered session token.
      const mintRes = await fetch('/api/realtime/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ mode }),
      });
      const mint = await mintRes.json().catch(() => ({}));
      if (!mintRes.ok) {
        teardown();
        setPhase('idle');
        setError(mint.error || 'Could not start the session.');
        minutes.refresh();
        return;
      }

      // 3. WebRTC to OpenAI Realtime.
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      pc.ontrack = (e) => {
        if (audioRef.current) audioRef.current.srcObject = e.streams[0];
        analyserExamRef.current = attachAnalyser(e.streams[0]);
      };
      pc.addTrack(mic.getTracks()[0], mic);

      const dc = pc.createDataChannel('oai-events');
      dc.onopen = () => {
        // Kick off the examiner's greeting EXACTLY once per session.
        if (greetedRef.current) return;
        greetedRef.current = true;
        dc.send(JSON.stringify({ type: 'response.create' }));
      };
      dc.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data);
          if (
            ev.type === 'conversation.item.input_audio_transcription.completed' ||
            ev.type === 'conversation.item.audio_transcription.completed'
          ) {
            pushTranscript('candidate', ev.transcript);
          } else if (
            ev.type === 'response.output_audio_transcript.done' ||
            ev.type === 'response.audio_transcript.done'
          ) {
            pushTranscript('examiner', ev.transcript);
          } else if (ev.type === 'error') {
            console.error('realtime event error:', ev.error?.message || ev);
          }
        } catch {}
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpRes = await fetch(
        `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(mint.model)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${mint.clientSecret}`,
            'Content-Type': 'application/sdp',
          },
          body: offer.sdp,
        }
      );
      if (!sdpRes.ok) throw new Error(`webrtc answer failed (${sdpRes.status})`);
      await pc.setRemoteDescription({ type: 'answer', sdp: await sdpRes.text() });

      // 4. Session clock — hard stop at the paid duration.
      setSecondsLeft(mint.durationSeconds);
      timerRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            endInterview();
            return 0;
          }
          return s - 1;
        });
      }, 1000);

      setPhase('live');
      startVisualizer();
      minutes.refresh();
    } catch (e) {
      teardown();
      setPhase('idle');
      setError(
        e?.name === 'NotAllowedError'
          ? 'Microphone access is required — please allow it and try again.'
          : 'Could not connect to the examiner. Please try again.'
      );
    }
  }

  async function endInterview() {
    if (endedRef.current) return;
    endedRef.current = true;
    teardown();
    const transcript = transcriptRef.current;
    track('realtime_session_end', {
      mode: activeMode,
      turns: transcript.length,
    });

    const candidateWords = transcript
      .filter((t) => t.role === 'candidate')
      .reduce((n, t) => n + t.text.split(/\s+/).filter(Boolean).length, 0);
    if (candidateWords < 40) {
      setPhase('idle');
      setError('The session ended before there was enough speech to score.');
      return;
    }

    setPhase('scoring');
    try {
      const headers = await authHeader();
      const res = await fetch('/api/score/speaking-realtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(headers || {}) },
        body: JSON.stringify({ mode: activeMode, transcript }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPhase('idle');
        setError(body.error || 'Scoring failed. Your interview still counted — try again.');
        return;
      }
      setResult(body);
      setPhase('done');
      track('realtime_session_scored', { mode: activeMode, band: body.overallBand });
    } catch {
      setPhase('idle');
      setError('Scoring failed. Please try again.');
    }
  }

  const minutesLeft = Math.floor(minutes.remainingSeconds / 60);

  return (
    <>
      <Head>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESCRIPTION} />
        <link rel="canonical" href={`${SITE_URL}/speaking-examiner`} />
      </Head>
      <Navbar />
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-10">
        <header className="text-center">
          <p className="mx-auto mb-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Premium · Live AI examiner
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            A real speaking interview, any time you want one
          </h1>
          <p className="mt-3 text-muted-foreground">
            Talk to an AI examiner that runs the real 3-part IELTS Speaking format — adaptive
            questions, a timed cue card, and a band score with feedback at the end.
          </p>
        </header>

        {error ? (
          <div className="mx-auto mt-6 max-w-xl rounded-lg border border-red-300 bg-red-50 p-4 text-center text-sm text-red-900">
            {error}
          </div>
        ) : null}

        {/* ---------- gate: signed-out / free ---------- */}
        {phase === 'idle' && !planLoading && !isPremium ? (
          <div className="mx-auto mt-8 max-w-xl rounded-xl border bg-card p-6 text-center shadow-sm">
            <p className="text-lg font-semibold">This is a Premium feature</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Premium includes {user ? '60' : '60'} AI examiner minutes every month — about four
              full mock interviews — plus unlimited Writing &amp; Speaking scoring.
            </p>
            <NextLink
              href="/pricing"
              onClick={() => track('paywall_upgrade_click', { source: 'speaking_examiner' })}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground no-underline hover:opacity-90"
            >
              <Sparkles className="h-4 w-4" /> Get Premium
            </NextLink>
          </div>
        ) : null}

        {/* ---------- idle: mode selection ---------- */}
        {phase === 'idle' && isPremium ? (
          <>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              <Clock className="mr-1 inline h-4 w-4 align-[-2px]" />
              {minutes.loading
                ? 'Loading your examiner minutes…'
                : `${minutesLeft} examiner minutes left this period`}
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {MODE_CARDS.map((card) => (
                <Card key={card.mode}>
                  <CardContent className="flex h-full flex-col p-5">
                    <h2 className="font-semibold">{card.title}</h2>
                    <p className="mt-1 flex-1 text-sm text-muted-foreground">{card.blurb}</p>
                    <p className="mt-2 text-xs text-muted-foreground">~{card.minutes} minutes</p>
                    <button
                      type="button"
                      onClick={() => startSession(card.mode)}
                      disabled={minutes.remainingSeconds < card.minutes * 60}
                      className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      <Mic className="h-4 w-4" /> Start
                    </button>
                    {minutes.remainingSeconds < card.minutes * 60 && !minutes.loading ? (
                      <p className="mt-2 text-center text-xs text-muted-foreground">
                        Not enough minutes left
                        {minutes.resetsAt
                          ? ` — refills ${new Date(minutes.resetsAt).toLocaleDateString()}`
                          : ''}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              You&apos;ll need a microphone. The examiner speaks and listens in real time; your
              band score and feedback arrive when the interview ends.
            </p>
          </>
        ) : null}

        {/* ---------- connecting ---------- */}
        {phase === 'connecting' ? (
          <div className="mt-10 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Connecting you to the examiner…</p>
          </div>
        ) : null}

        {/* ---------- live interview ---------- */}
        {phase === 'live' ? (
          <div className="mt-8 overflow-hidden rounded-2xl border bg-card shadow-sm">
            {/* header */}
            <div className="flex items-center justify-between border-b px-5 py-3">
              <span className="inline-flex items-center gap-2 text-sm font-medium">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                </span>
                Interview in progress
              </span>
              <span className="font-mono text-lg font-semibold tabular-nums">{fmtTime(secondsLeft)}</span>
            </div>

            {/* waveform */}
            <div className="border-b bg-muted/20 px-5 pb-2 pt-4">
              <canvas ref={canvasRef} className="h-20 w-full" aria-hidden="true" />
              <div className="mt-2 flex items-center justify-between text-xs font-medium">
                <span
                  className={
                    speaking === 'examiner'
                      ? 'inline-flex items-center gap-1.5 text-primary'
                      : 'inline-flex items-center gap-1.5 text-muted-foreground/50'
                  }
                >
                  <span className="h-2 w-2 rounded-full bg-primary" /> Examiner
                  {speaking === 'examiner' ? ' — speaking…' : ''}
                </span>
                <span
                  className={
                    speaking === 'candidate'
                      ? 'inline-flex items-center gap-1.5 text-accent'
                      : 'inline-flex items-center gap-1.5 text-muted-foreground/50'
                  }
                >
                  <span className="h-2 w-2 rounded-full bg-accent" /> You
                  {speaking === 'candidate' ? ' — speaking…' : ''}
                </span>
              </div>
            </div>

            {/* transcript */}
            <div
              ref={captionsBoxRef}
              className="h-64 space-y-2.5 overflow-y-auto bg-muted/10 px-5 py-4 text-sm"
              aria-live="polite"
            >
              {captions.length === 0 ? (
                <p className="text-muted-foreground">
                  The examiner will greet you in a moment — say hello back and follow their lead.
                  Your words appear here as you speak.
                </p>
              ) : (
                captions.map((c, i) =>
                  c.role === 'examiner' ? (
                    <div key={i} className="flex justify-start">
                      <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-card px-3.5 py-2 leading-relaxed shadow-sm">
                        {c.text}
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-accent/10 px-3.5 py-2 leading-relaxed text-foreground">
                        {c.text}
                      </div>
                    </div>
                  )
                )
              )}
            </div>

            {/* footer */}
            <div className="flex flex-col items-center gap-2 border-t px-5 py-4">
              <button
                type="button"
                onClick={endInterview}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700"
              >
                <PhoneOff className="h-4 w-4" /> End interview &amp; get my score
              </button>
              <p className="text-xs text-muted-foreground">
                Take your time — the examiner waits while you think.
              </p>
            </div>
          </div>
        ) : null}

        {/* ---------- scoring ---------- */}
        {phase === 'scoring' ? (
          <div className="mt-10 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">The examiner is marking your interview…</p>
          </div>
        ) : null}

        {/* ---------- results ---------- */}
        {phase === 'done' && result ? (
          <div className="mt-8">
            <div className="rounded-xl border bg-card p-6 text-center shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Estimated overall band
              </p>
              <p className="mt-1 text-5xl font-bold">{result.overallBand}</p>
              <p className="mt-3 text-sm text-muted-foreground">{result.summary}</p>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {[
                ['Fluency & Coherence', result.criteria?.fluencyCoherence],
                ['Lexical Resource', result.criteria?.lexicalResource],
                ['Grammatical Range', result.criteria?.grammaticalRange],
              ].map(([label, c]) => (
                <Card key={label}>
                  <CardContent className="p-4">
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="mt-1 text-2xl font-bold">{c?.band}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{c?.feedback}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            {Array.isArray(result.improvements) && result.improvements.length ? (
              <div className="mt-4 rounded-xl border bg-card p-5">
                <p className="text-sm font-semibold">What to practise next</p>
                <ul className="mt-2 space-y-1.5">
                  {result.improvements.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => {
                  setPhase('idle');
                  setResult(null);
                  minutes.refresh();
                }}
                className="rounded-lg border px-5 py-2.5 text-sm font-semibold hover:bg-muted"
              >
                Take another session
              </button>
            </div>
          </div>
        ) : null}

        {/* remote examiner audio */}
        <audio ref={audioRef} autoPlay className="hidden" />
      </main>
      <Footer />
      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        title="Sign in to meet your examiner"
        description="Create your account or sign in — you'll stay right on this page."
        trigger="speaking_examiner"
      />
    </>
  );
}
