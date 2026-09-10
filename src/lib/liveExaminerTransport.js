// src/lib/liveExaminerTransport.js
// WebRTC transport for the gpt-live-1 examiner. Unlike the Realtime pilot the
// browser never talks to OpenAI directly: it posts its SDP offer to our own
// metered route, which performs the exchange. Every dependency is injected so
// the whole handshake is unit-testable without a real peer connection.
const MINT_URL = '/api/live/session';
const END_URL = '/api/live/session/end';
const ICE_TIMEOUT_MS = 10000;
const CLOSE_TIMEOUT_MS = 15000;

// ICE never reaching 'complete' (a blocked STUN server, say) must not strand the
// candidate: proceed with whatever candidates we gathered.
function waitForIceGathering(pc, timeoutMs) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        pc.removeEventListener?.('icegatheringstatechange', onChange);
      } catch {}
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    if (typeof pc.addEventListener === 'function') {
      pc.addEventListener('icegatheringstatechange', onChange);
    } else {
      pc.onicegatheringstatechange = onChange;
    }
  });
}

export async function connectLiveExaminer({
  mic,
  mode,
  headers = {},
  audioAssessment = false,
  startMuted = true,
  fetchFn = typeof fetch === 'function' ? fetch : undefined,
  RTCPeerConnectionCtor = typeof RTCPeerConnection === 'function' ? RTCPeerConnection : undefined,
  isCurrent = () => true,
  iceTimeoutMs = ICE_TIMEOUT_MS,
  closeTimeoutMs = CLOSE_TIMEOUT_MS,
  onRemoteStream,
  onStarted,
  onTranscript,
  onUsage,
  onClosed,
  onError,
} = {}) {
  const pc = new RTCPeerConnectionCtor();
  let sessionId = null;
  let usageSeconds = 0;
  let closing = false;
  let resolveClosed = null;
  const closedPromise = new Promise((resolve) => { resolveClosed = resolve; });

  pc.ontrack = (event) => {
    if (!isCurrent()) return;
    onRemoteStream?.(event.streams?.[0]);
  };

  const micTrack = mic?.getTracks?.()[0] || null;
  // Room noise during the examiner's opening line used to trip the model into
  // restarting its greeting — start deaf, the page unmutes on the first words.
  if (micTrack && startMuted) micTrack.enabled = false;
  if (micTrack) pc.addTrack(micTrack, mic);

  // The data channel must exist before the offer so it is negotiated in the SDP.
  const dc = pc.createDataChannel('oai-events');
  const sendEvent = (event) => {
    if (dc.readyState && dc.readyState !== 'open') return false;
    try {
      dc.send(JSON.stringify(event));
      return true;
    } catch {
      return false;
    }
  };
  let muted = Boolean(startMuted);
  const applyMute = (next) => {
    muted = next;
    if (micTrack) micTrack.enabled = !next;
    return sendEvent({ type: next ? 'session.input_audio.mute' : 'session.input_audio.unmute' });
  };

  dc.onopen = () => {
    if (!isCurrent()) return;
    // No session.start / response.create on Live — the HTTP mint already began
    // the session and the examiner greets on its own. Only restate the mute.
    if (muted) sendEvent({ type: 'session.input_audio.mute' });
  };
  dc.onmessage = (event) => {
    if (!isCurrent()) return;
    let ev;
    try {
      ev = JSON.parse(event.data);
    } catch {
      return;
    }
    if (ev.type === 'session.started') {
      sessionId = ev.session?.id || sessionId;
      onStarted?.({ sessionId, expiresAt: ev.session?.expires_at || null });
    } else if (ev.type === 'session.input_transcript.delta') {
      onTranscript?.('candidate', ev);
    } else if (ev.type === 'session.output_transcript.delta') {
      onTranscript?.('examiner', ev);
    } else if (ev.type === 'session.usage.updated') {
      if (Number.isFinite(ev.usage?.seconds)) usageSeconds = ev.usage.seconds;
      onUsage?.(usageSeconds);
    } else if (ev.type === 'session.closed') {
      if (Number.isFinite(ev.usage?.seconds)) usageSeconds = ev.usage.seconds;
      resolveClosed?.();
      onClosed?.({ reason: ev.reason || 'unknown', usageSeconds });
    } else if (ev.type === 'error') {
      onError?.(ev.error || ev);
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGathering(pc, iceTimeoutMs);
  const sdp = pc.localDescription?.sdp || offer.sdp;

  const mintRes = await fetchFn(MINT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ mode, sdp, ...(audioAssessment ? { audioAssessment: true } : {}) }),
  });
  const mint = await mintRes.json().catch(() => ({}));
  if (!mintRes.ok) {
    const error = new Error(mint.error || 'Could not start the session.');
    error.status = mintRes.status;
    error.payload = mint;
    throw error;
  }
  sessionId = mint.sessionId || sessionId;
  try {
    await pc.setRemoteDescription({ type: 'answer', sdp: mint.sdp });
  } catch (e) {
    // The server has already created (and started billing) the session; hang
    // it up now rather than leaving it to the deadline sweep.
    try {
      await fetchFn(END_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ sessionId, usageSeconds: 0, reason: 'answer_failed' }),
      });
    } catch {}
    try { pc.close(); } catch {}
    throw e;
  }

  async function close({ reason = 'close_requested' } = {}) {
    if (closing) return;
    closing = true;
    if (sendEvent({ type: 'session.close' })) {
      // Wait for the server's acknowledgement so the reported usage is real,
      // but never let a dead channel block teardown.
      let timer;
      await Promise.race([
        closedPromise,
        new Promise((resolve) => { timer = setTimeout(resolve, closeTimeoutMs); }),
      ]);
      clearTimeout(timer);
    }
    if (sessionId) {
      // Best effort: the server-side deadline sweep is the real spend cap.
      try {
        await fetchFn(END_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ sessionId, usageSeconds, reason }),
        });
      } catch {}
    }
    try {
      pc.close();
    } catch {}
  }

  return {
    pc,
    dc,
    mint,
    get sessionId() { return sessionId; },
    get usageSeconds() { return usageSeconds; },
    mute: () => applyMute(true),
    unmute: () => applyMute(false),
    close,
  };
}

export default connectLiveExaminer;
