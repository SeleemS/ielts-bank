export const OPTIONAL_CONSENT_KEY = 'ib_consent_v1';

export function normalizeOptionalConsent(value) {
  return value === 'granted' || value === 'denied' ? value : null;
}

export function globalPrivacyControlEnabled(navigatorLike) {
  const source =
    navigatorLike || (typeof navigator !== 'undefined' ? navigator : null);
  return source?.globalPrivacyControl === true;
}

function browserStorage(storage) {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// The visitor's EXPLICIT stored choice, or null if they have not chosen. This
// does NOT apply the opt-out default — it answers "did the visitor decide?",
// which is what the banner uses to know whether to keep showing.
export function readStoredConsent(storage) {
  if (typeof window !== 'undefined') {
    const current = normalizeOptionalConsent(window.__ieltsOptionalConsent);
    if (current) return current;
  }
  try {
    return normalizeOptionalConsent(browserStorage(storage)?.getItem(OPTIONAL_CONSENT_KEY));
  } catch {
    return null;
  }
}

// Effective consent used for tracking decisions. OPT-OUT model: optional
// analytics and advertising are ON by default and stay on until the visitor
// explicitly opts out — EXCEPT when the browser sends Global Privacy Control,
// which is always honored (a legal requirement in several US states).
export function readOptionalConsent(storage) {
  if (globalPrivacyControlEnabled()) return 'denied';
  return readStoredConsent(storage) || 'granted';
}

// Whether the visitor's choice is settled (GPC signal or an explicit click), so
// the notice/opt-out banner can stay hidden.
export function consentDecided(storage) {
  return globalPrivacyControlEnabled() || readStoredConsent(storage) !== null;
}

export function writeOptionalConsent(choice, storage) {
  const requested = normalizeOptionalConsent(choice);
  const normalized =
    requested === 'granted' && globalPrivacyControlEnabled()
      ? 'denied'
      : requested;
  if (!normalized) return null;
  if (typeof window !== 'undefined') window.__ieltsOptionalConsent = normalized;
  try {
    browserStorage(storage)?.setItem(OPTIONAL_CONSENT_KEY, normalized);
  } catch {
    // The in-memory value still honors the visitor's choice for this page.
  }
  return normalized;
}

export function analyticsConsentGranted(storage) {
  return readOptionalConsent(storage) === 'granted';
}

export function consentAwareVercelEvent(event) {
  return analyticsConsentGranted() ? event : null;
}
