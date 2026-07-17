const ANON_ID_KEY = 'ielts-anon-id';
const ATTRIBUTION_KEY = 'ielts-attribution';
let analyticsAccessToken = null;

function fallbackUuid() {
  const bytes = new Uint8Array(16);
  if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getAnonId() {
  if (typeof window === 'undefined') return null;
  try {
    let value = window.localStorage.getItem(ANON_ID_KEY);
    if (!value) {
      value = window.crypto?.randomUUID?.() || fallbackUuid();
      window.localStorage.setItem(ANON_ID_KEY, value);
    }
    return value;
  } catch {
    return null;
  }
}

// First-touch attribution: captured once, on the first track() call of the
// user's first visit, then persisted. `source` resolves to utm_source, else
// the external referrer host, else 'direct'.
export function getAttribution() {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(ATTRIBUTION_KEY);
    if (stored) return JSON.parse(stored);

    const params = new URLSearchParams(window.location.search);
    const referrer = document.referrer || '';
    let referrerHost = '';
    try {
      referrerHost = referrer ? new URL(referrer).hostname : '';
    } catch {
      referrerHost = '';
    }
    if (referrerHost === window.location.hostname) referrerHost = '';

    const attribution = {
      source: (params.get('utm_source') || referrerHost || 'direct').slice(0, 200),
      referrer: referrerHost ? referrer.slice(0, 300) : '',
      landing: window.location.pathname.slice(0, 200),
      utm_source: (params.get('utm_source') || '').slice(0, 200),
      utm_medium: (params.get('utm_medium') || '').slice(0, 200),
      utm_campaign: (params.get('utm_campaign') || '').slice(0, 200),
    };
    window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
    return attribution;
  } catch {
    return null;
  }
}

export function track(event, params = {}, options = {}) {
  if (typeof window === 'undefined' || !event) return;
  const payload = {
    ...params,
    path: params.path || window.location.pathname,
  };

  if (typeof window.gtag === 'function') {
    window.gtag('event', event, payload);
  }

  const anonId = getAnonId();
  if (!anonId || typeof window.fetch !== 'function') return;
  const headers = { 'Content-Type': 'application/json' };
  const accessToken = options.accessToken || analyticsAccessToken;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  // Every first-party event carries the resolved acquisition source; the
  // login event carries the full attribution so /api/track can stamp it
  // onto the user's row (first-write-wins server-side).
  const attribution = getAttribution();
  const extra = {};
  if (attribution?.source) extra.source = attribution.source;
  if (event === 'login' && attribution) {
    if (attribution.referrer) extra.referrer = attribution.referrer;
    if (attribution.landing) extra.landing = attribution.landing;
    if (attribution.utm_source) extra.utm_source = attribution.utm_source;
    if (attribution.utm_medium) extra.utm_medium = attribution.utm_medium;
    if (attribution.utm_campaign) extra.utm_campaign = attribution.utm_campaign;
  }

  window.fetch('/api/track', {
    method: 'POST',
    headers,
    keepalive: true,
    body: JSON.stringify({ event, anon_id: anonId, ...extra, ...payload }),
  }).catch(() => {});
}

export function setAnalyticsUser(userId, accessToken = null) {
  analyticsAccessToken = accessToken || null;
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('set', { user_id: userId || null });
}

export function trackPageView(url, signedIn = false) {
  if (typeof window === 'undefined') return;
  track('page_view', {
    page_location: `${window.location.origin}${url}`,
    page_path: url,
    page_title: document.title,
    signed_in: signedIn,
  });
}
