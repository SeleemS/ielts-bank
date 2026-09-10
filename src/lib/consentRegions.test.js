import { describe, expect, it } from 'vitest';
import {
  consentDefaultForCountry,
  isConsentRequiredCountry,
  CONSENT_REQUIRED_COUNTRIES,
} from './consentRegions';

describe('consent-required regions (EU/EEA/UK/Switzerland)', () => {
  it('requires opt-in for EU, EEA, UK, and Switzerland', () => {
    for (const code of ['DE', 'FR', 'IE', 'ES', 'NO', 'IS', 'LI', 'GB', 'CH']) {
      expect(isConsentRequiredCountry(code)).toBe(true);
      expect(consentDefaultForCountry(code)).toBe('granted');
    }
  });

  it('defaults to enabled without a consent prompt', () => {
    for (const code of ['US', 'CA', 'IN', 'NG', 'EG', 'PH', 'BR', 'AU']) {
      expect(isConsentRequiredCountry(code)).toBe(false);
      expect(consentDefaultForCountry(code)).toBe('granted');
    }
  });

  it('classifies case-insensitively and uses the same default for every location', () => {
    expect(isConsentRequiredCountry('gb')).toBe(true);
    expect(isConsentRequiredCountry('')).toBe(false);
    expect(isConsentRequiredCountry(null)).toBe(false);
    expect(isConsentRequiredCountry(undefined)).toBe(false);
    expect(consentDefaultForCountry(' ch ')).toBe('granted');
    expect(consentDefaultForCountry('')).toBe('granted');
    expect(consentDefaultForCountry(null)).toBe('granted');
    expect(consentDefaultForCountry(undefined)).toBe('granted');
    expect(consentDefaultForCountry('unknown')).toBe('granted');
  });

  it('covers the full EU-27 plus EEA, UK, and Switzerland (32 territories)', () => {
    expect(CONSENT_REQUIRED_COUNTRIES.size).toBe(32);
  });
});
