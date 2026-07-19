import { analyticsConsentGranted } from './consent';

const ANON_ID_KEY = 'ielts-anon-id';
const ATTRIBUTION_KEY = 'ielts-attribution';
const SESSION_ID_KEY = 'ielts-analytics-session-id';
const SEQUENCE_KEY = 'ielts-analytics-sequence';
export const GA_MEASUREMENT_ID = 'G-1KRYZZY68X';
let analyticsAccessToken = null;
let pageViewId = null;
const INTERNAL_PATH_RE = /^\/(?:api|_next|gt)(?:\/|$)/;

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

export function getSessionId() {
  if (typeof window === 'undefined') return null;
  try {
    let value = window.sessionStorage.getItem(SESSION_ID_KEY);
    if (!value) {
      value = window.crypto?.randomUUID?.() || fallbackUuid();
      window.sessionStorage.setItem(SESSION_ID_KEY, value);
    }
    return value;
  } catch {
    return null;
  }
}

function nextSequence() {
  if (typeof window === 'undefined') return null;
  try {
    const current = Number(window.sessionStorage.getItem(SEQUENCE_KEY) || 0);
    const next = Number.isSafeInteger(current) && current >= 0 ? current + 1 : 1;
    window.sessionStorage.setItem(SEQUENCE_KEY, String(next));
    return next;
  } catch {
    return null;
  }
}

function getPageViewId() {
  if (typeof window === 'undefined') return null;
  if (!pageViewId) pageViewId = window.crypto?.randomUUID?.() || fallbackUuid();
  return pageViewId;
}

function rotatePageViewId() {
  if (typeof window === 'undefined') return null;
  pageViewId = window.crypto?.randomUUID?.() || fallbackUuid();
  return pageViewId;
}

export function ensureGoogleAnalytics() {
  if (typeof window === 'undefined') return null;
  if (!analyticsConsentGranted()) return null;
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
  }
  if (!window.__ieltsConsentDefaulted) {
    window.gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      functionality_storage: 'granted',
      security_storage: 'granted',
      wait_for_update: 500,
    });
    window.gtag('set', 'ads_data_redaction', true);
    window.__ieltsConsentDefaulted = true;
  }
  if (!window.__ieltsGaConfigured) {
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, {
      transport_url: window.location.origin + '/gt',
      first_party_collection: true,
      send_page_view: false,
    });
    window.__ieltsGaConfigured = true;
  }
  return window.gtag;
}

export function isInternalAnalyticsPath(value) {
  if (typeof value !== 'string') return false;
  const path = value.split(/[?#]/, 1)[0];
  return INTERNAL_PATH_RE.test(path);
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
  if (!analyticsConsentGranted()) return;
  const currentPath = params.path || window.location.pathname;
  if (isInternalAnalyticsPath(currentPath)) return;
  const clientEventId = window.crypto?.randomUUID?.() || fallbackUuid();
  const sessionId = getSessionId();
  const currentPageViewId = getPageViewId();
  const payload = {
    ...params,
    path: currentPath,
    client_event_id: clientEventId,
    session_id: sessionId,
    page_view_id: currentPageViewId,
    event_sequence: nextSequence(),
    occurred_at: new Date().toISOString(),
  };

  // firstPartyOnly: meter-style events (e.g. session_heartbeat) that belong in
  // activity_events but would only add noise/volume to GA4.
  if (!options.firstPartyOnly) ensureGoogleAnalytics()?.('event', event, payload);

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
  if (attribution?.source) extra.acquisition_source = attribution.source;
  if (event === 'login' && attribution) {
    // Legacy login RPC input remains `source`; all event analysis should use
    // `acquisition_source` so UI placement values such as "blog" or
    // "quota_modal" can continue to use `source` without overwriting it.
    extra.source = attribution.source;
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
  if (!analyticsConsentGranted()) return;
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('set', { user_id: userId || null });
}

export function trackPageView(url, signedIn = false) {
  if (typeof window === 'undefined') return;
  if (!analyticsConsentGranted()) return;
  rotatePageViewId();
  track('page_view', {
    page_location: `${window.location.origin}${url}`,
    page_path: url,
    page_title: document.title,
    signed_in: signedIn,
  });
}

export function resetAnalyticsForTests() {
  analyticsAccessToken = null;
  pageViewId = null;
}
