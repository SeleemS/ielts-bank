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

// The region-aware default set by pages/_document.js from the `ib_consent_default`
// cookie (middleware.js): 'denied' for opt-in regions
// (EU/EEA/UK/Switzerland), 'granted' for other known countries. Falls back to
// 'denied' when the cookie is missing or invalid so a geo miss fails closed.
export function optionalConsentDefault() {
  if (typeof window !== 'undefined') {
    const value = normalizeOptionalConsent(window.__ieltsConsentDefault);
    if (value) return value;
  }
  return 'denied';
}

// Whether optional storage is ON by default for this visitor's region (opt-out).
// Used for the banner copy; false in EU/EEA/UK/Switzerland or unknown regions.
export function optionalDefaultsOn() {
  return optionalConsentDefault() === 'granted';
}

// Effective consent used for tracking decisions. GEO-AWARE opt-out: optional
// analytics/advertising default ON only for a known non-required country and
// stay in the region default until the visitor explicitly chooses — EXCEPT when
// the browser sends Global Privacy Control, which is always honored (required
// in several US states).
export function readOptionalConsent(storage) {
  if (globalPrivacyControlEnabled()) return 'denied';
  return readStoredConsent(storage) || optionalConsentDefault();
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
