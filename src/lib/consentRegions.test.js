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
      expect(consentDefaultForCountry(code)).toBe('denied');
    }
  });

  it('defaults to opt-out for other known countries', () => {
    for (const code of ['US', 'CA', 'IN', 'NG', 'EG', 'PH', 'BR', 'AU']) {
      expect(isConsentRequiredCountry(code)).toBe(false);
      expect(consentDefaultForCountry(code)).toBe('granted');
    }
  });

  it('is case-insensitive and fails closed for missing or malformed geo input', () => {
    expect(isConsentRequiredCountry('gb')).toBe(true);
    expect(isConsentRequiredCountry('')).toBe(false);
    expect(isConsentRequiredCountry(null)).toBe(false);
    expect(isConsentRequiredCountry(undefined)).toBe(false);
    expect(consentDefaultForCountry(' ch ')).toBe('denied');
    expect(consentDefaultForCountry('')).toBe('denied');
    expect(consentDefaultForCountry(null)).toBe('denied');
    expect(consentDefaultForCountry(undefined)).toBe('denied');
    expect(consentDefaultForCountry('unknown')).toBe('denied');
  });

  it('covers the full EU-27 plus EEA, UK, and Switzerland (32 territories)', () => {
    expect(CONSENT_REQUIRED_COUNTRIES.size).toBe(32);
  });
});
