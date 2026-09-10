// lib/liveSessionsApi.js
// Thin fetch wrappers around the OpenAI Live sessions REST API. There is no
// ephemeral client secret for Live: the browser posts its SDP offer to OUR
// server and we do the exchange, so these two calls are the only place the
// API key is used and hangup is our only trusted spend cap.

const LIVE_SESSIONS_URL = 'https://api.openai.com/v1/live/sessions';

function apiError(message, status, payload) {
  const error = new Error(message);
  error.status = status;
  if (payload !== undefined) error.payload = payload;
  return error;
}

// Every call is time-boxed: a hung provider socket would otherwise pin a
// serverless invocation open with the candidate staring at a spinner.
async function withTimeout(fetchFn, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// body is the full { session, transport } payload from buildLiveSessionConfig.
export async function createLiveSession(
  body,
  { fetchFn = fetch, apiKey = process.env.OPENAI_API_KEY, timeoutMs = 20000 } = {}
) {
  if (!apiKey) throw apiError('live-api-key-missing', 0);
  const response = await withTimeout(
    fetchFn,
    LIVE_SESSIONS_URL,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    timeoutMs
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw apiError(
      payload?.error?.message || `live-session-create-failed-${response.status}`,
      response.status,
      payload
    );
  }
  const sessionId = payload?.session?.id;
  const sdp = payload?.transport?.sdp;
  if (!sessionId || !sdp) {
    throw apiError('live-session-create-incomplete', response.status, payload);
  }
  return { sessionId, sdp };
}

// Idempotent by design: a session OpenAI has already ended (404/410) is a
// success for us — both the end route and the cron sweep call this for rows
// the browser may have already closed.
export async function hangupLiveSession(
  sessionId,
  { fetchFn = fetch, apiKey = process.env.OPENAI_API_KEY, timeoutMs = 10000 } = {}
) {
  if (!sessionId) throw apiError('live-session-id-missing', 0);
  if (!apiKey) throw apiError('live-api-key-missing', 0);
  const response = await withTimeout(
    fetchFn,
    `${LIVE_SESSIONS_URL}/${encodeURIComponent(sessionId)}/hangup`,
    { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` } },
    timeoutMs
  );
  if (response.status === 404 || response.status === 410) {
    return { ok: true, alreadyEnded: true };
  }
  if (!response.ok) {
    throw apiError(`live-session-hangup-failed-${response.status}`, response.status);
  }
  return { ok: true, alreadyEnded: false };
}
