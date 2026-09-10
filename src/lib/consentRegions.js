// Country classification also used for onboarding email preferences.
// The site tracking default is independent of this classification.
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

// Optional tracking is enabled by default without a popup. Existing explicit
// opt-outs and Global Privacy Control still override this default.
export function consentDefaultForCountry() {
  return 'granted';
}
