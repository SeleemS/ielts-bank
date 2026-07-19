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

export function readOptionalConsent(storage) {
  if (globalPrivacyControlEnabled()) return 'denied';
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
