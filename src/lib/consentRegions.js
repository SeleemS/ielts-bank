// src/lib/consentRegions.js
// Countries where optional analytics/advertising require PRIOR OPT-IN consent
// (GDPR/ePrivacy and Google's publisher consent policy): the EU/EEA, UK, and
// Switzerland. Visitors geolocated to these countries get the
// denied-by-default (opt-in) consent flow; other known countries default to
// opt-out. Missing geo data fails closed. The visitor's country is resolved per
// request from Vercel edge geo in middleware.js.
//
// Pure data + one helper so it stays importable from the edge runtime.
export const CONSENT_REQUIRED_COUNTRIES = new Set([
  // EU-27
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  // EEA (non-EU)
  'IS', 'LI', 'NO',
  // United Kingdom
  'GB',
  // Switzerland (included in Google's publisher consent policy)
  'CH',
]);

export function isConsentRequiredCountry(countryCode) {
  return CONSENT_REQUIRED_COUNTRIES.has(
    String(countryCode || '').trim().toUpperCase()
  );
}

export function consentDefaultForCountry(countryCode) {
  const normalized = String(countryCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return 'denied';
  return isConsentRequiredCountry(normalized) ? 'denied' : 'granted';
}
