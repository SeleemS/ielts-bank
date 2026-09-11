import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectLiveExaminer } from '../src/lib/liveExaminerTransport';

let peers, micTrack, mic, fetchMock, order;

function makePeer() {
  const peer = {
    iceGatheringState: 'gathering',
    localDescription: null,
    listeners: {},
    channel: null,
    tracks: [],
    remote: null,
    addEventListener: (type, fn) => { (peer.listeners[type] ||= []).push(fn); },
    removeEventListener: (type, fn) => {
      peer.listeners[type] = (peer.listeners[type] || []).filter((f) => f !== fn);
    },
    addTrack: vi.fn((t) => peer.tracks.push(t)),
    createDataChannel: vi.fn((label) => {
      order.push(`channel:${label}`);
      peer.channel = { label, readyState: 'connecting', send: vi.fn(), close: vi.fn() };
      return peer.channel;
    }),
    createOffer: vi.fn(async () => { order.push('offer'); return { type: 'offer', sdp: 'offer-sdp' }; }),
    setLocalDescription: vi.fn(async (d) => { peer.localDescription = d; }),
    setRemoteDescription: vi.fn(async (d) => { peer.remote = d; }),
    close: vi.fn(),
    completeIce() {
      peer.iceGatheringState = 'complete';
      (peer.listeners.icegatheringstatechange || []).forEach((fn) => fn());
    },
    emit(event) { peer.channel.onmessage({ data: JSON.stringify(event) }); },
  };
  peers.push(peer);
  return peer;
}

const jsonResponse = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
const MINT_OK = { sessionId: 'live_1', sdp: 'answer-sdp', durationSeconds: 300 };

function connect(overrides = {}) {
  return connectLiveExaminer({
    mic,
    mode: 'part1',
    headers: { Authorization: 'Bearer fixture' },
    fetchFn: fetchMock,
    RTCPeerConnectionCtor: makePeer,
    ...overrides,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  peers = [];
  order = [];
  micTrack = { enabled: true, stop: vi.fn() };
  mic = { getTracks: () => [micTrack] };
  fetchMock = vi.fn(async (url) => {
    order.push(`fetch:${url}`);
    return url === '/api/live/session' ? jsonResponse(MINT_OK) : jsonResponse({ ended: true });
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('connectLiveExaminer', () => {
  it('creates the data channel before the offer and posts the gathered SDP to our own route', async () => {
    const pending = connect();
    await vi.advanceTimersByTimeAsync(0);
    // ICE is still gathering: nothing has been minted yet.
    expect(fetchMock).not.toHaveBeenCalled();
    peers[0].completeIce();
    const transport = await pending;

    expect(order.slice(0, 3)).toEqual(['channel:oai-events', 'offer', 'fetch:/api/live/session']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/live/session');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer fixture');
    expect(JSON.parse(init.body)).toEqual({ mode: 'part1', sdp: 'offer-sdp' });
    expect(peers[0].remote).toEqual({ type: 'answer', sdp: 'answer-sdp' });
    expect(transport.mint).toEqual(MINT_OK);
    expect(transport.sessionId).toBe('live_1');
  });

  it('includes audioAssessment when the pilot flag is on', async () => {
    const pending = connect({ audioAssessment: true });
    await vi.advanceTimersByTimeAsync(0);
    peers[0].completeIce();
    await pending;
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).audioAssessment).toBe(true);
  });

  it('proceeds after a 10 s ICE gathering cap', async () => {
    const pending = connect();
    await vi.advanceTimersByTimeAsync(9999);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('mutes the microphone track before adding it and never sends a greeting event', async () => {
    const pending = connect();
    expect(micTrack.enabled).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    peers[0].completeIce();
    const transport = await pending;
    peers[0].channel.readyState = 'open';
    peers[0].channel.onopen();
    const sent = peers[0].channel.send.mock.calls.map(([raw]) => JSON.parse(raw).type);
    expect(sent).toEqual(['session.input_audio.mute']);
    expect(sent).not.toContain('response.create');
    expect(sent).not.toContain('session.start');

    transport.unmute();
    expect(micTrack.enabled).toBe(true);
    expect(JSON.parse(peers[0].channel.send.mock.calls[1][0])).toEqual({ type: 'session.input_audio.unmute' });
  });

  it('throws a mint failure carrying the status and payload', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'You have used all your minutes.', reason: 'minutes_exhausted' }, false, 402));
    const pending = connect().catch((e) => e);
    await vi.advanceTimersByTimeAsync(0);
    peers[0].completeIce();
    const error = await pending;
    expect(error.status).toBe(402);
    expect(error.payload.reason).toBe('minutes_exhausted');
    expect(error.message).toBe('You have used all your minutes.');
    expect(peers[0].setRemoteDescription).not.toHaveBeenCalled();
  });

  it('ends the already-billed session when the SDP answer cannot be applied', async () => {
    const pending = connect().catch((e) => e);
    await vi.advanceTimersByTimeAsync(0);
    peers[0].setRemoteDescription.mockRejectedValueOnce(new Error('bad answer'));
    peers[0].completeIce();
    const error = await pending;
    expect(error.message).toBe('bad answer');
    const endCall = fetchMock.mock.calls.find(([url]) => url === '/api/live/session/end');
    expect(endCall).toBeTruthy();
    expect(JSON.parse(endCall[1].body)).toEqual({ sessionId: 'live_1', usageSeconds: 0, reason: 'answer_failed' });
    expect(peers[0].close).toHaveBeenCalled();
  });

  it('routes server events to the callbacks', async () => {
    const onStarted = vi.fn(); const onTranscript = vi.fn(); const onUsage = vi.fn();
    const onClosed = vi.fn(); const onError = vi.fn(); const onRemoteStream = vi.fn();
    const pending = connect({ onStarted, onTranscript, onUsage, onClosed, onError, onRemoteStream });
    await vi.advanceTimersByTimeAsync(0);
    peers[0].completeIce();
    await pending;
    peers[0].ontrack({ streams: ['remote-stream'] });
    peers[0].emit({ type: 'session.started', session: { id: 'live_9', expires_at: 42 } });
    peers[0].emit({ type: 'session.output_transcript.delta', delta: 'Good morning', start_ms: 0, end_ms: 900 });
    peers[0].emit({ type: 'session.input_transcript.delta', delta: 'Hello', start_ms: 1000, end_ms: 1400 });
    peers[0].emit({ type: 'session.usage.updated', usage: { seconds: 12 } });
    peers[0].emit({ type: 'error', error: { message: 'nope' } });
    peers[0].channel.onmessage({ data: 'not-json' });

    expect(onRemoteStream).toHaveBeenCalledWith('remote-stream');
    expect(onStarted).toHaveBeenCalledWith({ sessionId: 'live_9', expiresAt: 42 });
    expect(onTranscript.mock.calls.map(([role, f]) => [role, f.delta])).toEqual([
      ['examiner', 'Good morning'],
      ['candidate', 'Hello'],
    ]);
    expect(onUsage).toHaveBeenCalledWith(12);
    expect(onError).toHaveBeenCalledWith({ message: 'nope' });
    expect(onClosed).not.toHaveBeenCalled();
  });

  it('raises a thinking state on delegation and clears it on the next examiner words', async () => {
    const onThinking = vi.fn(); const onTranscript = vi.fn();
    const pending = connect({ onThinking, onTranscript });
    await vi.advanceTimersByTimeAsync(0);
    peers[0].completeIce();
    await pending;

    peers[0].emit({ type: 'session.output_transcript.delta', delta: 'Good morning' });
    // No delegation yet: nothing to clear, so the page is never told anything.
    expect(onThinking).not.toHaveBeenCalled();

    peers[0].emit({ type: 'session.delegation.created', target: 'responses', response_id: 'resp_1' });
    // A second delegation before any reply must not re-announce the state.
    peers[0].emit({ type: 'session.delegation.created', target: 'responses', response_id: 'resp_2' });
    expect(onThinking.mock.calls).toEqual([[true]]);
    // The delegation event is not a transcript.
    expect(onTranscript).toHaveBeenCalledTimes(1);

    peers[0].emit({ type: 'session.output_transcript.delta', delta: 'Good question.' });
    peers[0].emit({ type: 'session.output_transcript.delta', delta: ' Now tell me' });
    expect(onThinking.mock.calls).toEqual([[true], [false]]);
    expect(onTranscript).toHaveBeenCalledTimes(3);
  });

  it('clears a pending thinking state when the session closes', async () => {
    const onThinking = vi.fn();
    const pending = connect({ onThinking });
    await vi.advanceTimersByTimeAsync(0);
    peers[0].completeIce();
    await pending;

    peers[0].emit({ type: 'session.delegation.created', target: 'responses' });
    peers[0].emit({ type: 'session.closed', reason: 'close_requested', usage: { seconds: 9 } });
    expect(onThinking.mock.calls).toEqual([[true], [false]]);
  });

  it('closes by sending session.close, waiting for session.closed, then ending the session server-side', async () => {
    const onClosed = vi.fn();
    const pending = connect({ onClosed });
    await vi.advanceTimersByTimeAsync(0);
    peers[0].completeIce();
    const transport = await pending;
    peers[0].channel.readyState = 'open';
    peers[0].emit({ type: 'session.usage.updated', usage: { seconds: 30 } });

    const closing = transport.close({ reason: 'timer' });
    expect(JSON.parse(peers[0].channel.send.mock.lastCall[0])).toEqual({ type: 'session.close' });
    expect(fetchMock).toHaveBeenCalledOnce(); // end call waits for the ack
    peers[0].emit({ type: 'session.closed', reason: 'close_requested', usage: { seconds: 34 } });
    await closing;

    expect(onClosed).toHaveBeenCalledWith({ reason: 'close_requested', usageSeconds: 34 });
    const [endUrl, endInit] = fetchMock.mock.calls[1];
    expect(endUrl).toBe('/api/live/session/end');
    expect(JSON.parse(endInit.body)).toEqual({ sessionId: 'live_1', usageSeconds: 34, reason: 'timer' });
    expect(peers[0].close).toHaveBeenCalledOnce();
    // A second close is a no-op.
    await transport.close({ reason: 'timer' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up waiting for session.closed after 15 s and still ends the session', async () => {
    const pending = connect();
    await vi.advanceTimersByTimeAsync(0);
    peers[0].completeIce();
    const transport = await pending;
    peers[0].channel.readyState = 'open';
    const closing = transport.close({ reason: 'teardown' });
    await vi.advanceTimersByTimeAsync(15000);
    await closing;
    expect(fetchMock.mock.calls[1][0]).toBe('/api/live/session/end');
    expect(peers[0].close).toHaveBeenCalledOnce();
  });

  it('still closes the peer when the end call fails', async () => {
    const pending = connect();
    await vi.advanceTimersByTimeAsync(0);
    peers[0].completeIce();
    const transport = await pending;
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await transport.close({ reason: 'teardown' }); // channel never opened: no wait
    expect(peers[0].close).toHaveBeenCalledOnce();
  });
});
