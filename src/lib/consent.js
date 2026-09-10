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
// does NOT apply the site default — it answers whether the visitor decided.
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

// Site default without a popup; explicit opt-outs and GPC take precedence.
export function optionalConsentDefault() {
  return 'granted';
}

// Whether optional storage is enabled by default.
export function optionalDefaultsOn() {
  return optionalConsentDefault() === 'granted';
}

// Existing explicit preferences and Global Privacy Control are preserved.
export function readOptionalConsent(storage) {
  if (globalPrivacyControlEnabled()) return 'denied';
  return readStoredConsent(storage) || optionalConsentDefault();
}

// Whether the visitor has an explicit preference or browser privacy signal.
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
