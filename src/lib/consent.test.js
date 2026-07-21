import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OPTIONAL_CONSENT_KEY,
  analyticsConsentGranted,
  consentAwareVercelEvent,
  globalPrivacyControlEnabled,
  normalizeOptionalConsent,
  optionalDefaultsOn,
  readOptionalConsent,
  writeOptionalConsent,
} from './consent';

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, String(value))),
  };
}

let originalNavigator;

describe('optional analytics consent', () => {
  beforeEach(() => {
    originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    global.window = {
      localStorage: storage(),
      __ieltsOptionalConsent: null,
    };
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { globalPrivacyControl: false },
    });
  });

  afterEach(() => {
    delete global.window;
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator);
    } else {
      delete global.navigator;
    }
  });

  it('accepts only explicit granted or denied values', () => {
    expect(normalizeOptionalConsent('granted')).toBe('granted');
    expect(normalizeOptionalConsent('denied')).toBe('denied');
    expect(normalizeOptionalConsent('')).toBeNull();
    expect(normalizeOptionalConsent('yes')).toBeNull();
    expect(globalPrivacyControlEnabled()).toBe(false);
  });

  it('fails closed when no explicit choice or valid region default exists', () => {
    const event = { url: 'https://www.ielts-bank.com/' };

    expect(readOptionalConsent()).toBe('denied');
    expect(analyticsConsentGranted()).toBe(false);
    expect(consentAwareVercelEvent(event)).toBeNull();
  });

  it('blocks analytics after an explicit opt-out', () => {
    window.__ieltsOptionalConsent = 'denied';

    expect(readOptionalConsent()).toBe('denied');
    expect(analyticsConsentGranted()).toBe(false);
  });

  it('follows the region default when the visitor has not chosen', () => {
    window.__ieltsConsentDefault = 'denied'; // EU/EEA/UK/Switzerland -> opt-in
    expect(readOptionalConsent()).toBe('denied');
    expect(analyticsConsentGranted()).toBe(false);
    expect(optionalDefaultsOn()).toBe(false);

    window.__ieltsConsentDefault = 'granted'; // elsewhere -> opt-out
    expect(readOptionalConsent()).toBe('granted');
    expect(analyticsConsentGranted()).toBe(true);
    expect(optionalDefaultsOn()).toBe(true);
  });

  it('lets an explicit grant override an opt-in region default', () => {
    window.__ieltsConsentDefault = 'denied';
    window.__ieltsOptionalConsent = 'granted';

    expect(readOptionalConsent()).toBe('granted');
    expect(analyticsConsentGranted()).toBe(true);
  });

  it('persists an explicit grant and allows consent-aware events', () => {
    const event = { url: 'https://www.ielts-bank.com/' };

    expect(writeOptionalConsent('granted')).toBe('granted');
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      OPTIONAL_CONSENT_KEY,
      'granted'
    );
    expect(readOptionalConsent()).toBe('granted');
    expect(analyticsConsentGranted()).toBe(true);
    expect(consentAwareVercelEvent(event)).toBe(event);
  });

  it('honors the current-page choice when browser storage is blocked', () => {
    const blocked = {
      getItem: vi.fn(() => {
        throw new Error('blocked');
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked');
      }),
    };

    expect(writeOptionalConsent('granted', blocked)).toBe('granted');
    expect(readOptionalConsent(blocked)).toBe('granted');
    expect(analyticsConsentGranted(blocked)).toBe(true);
  });

  it('lets Global Privacy Control override a prior or attempted grant', () => {
    global.navigator.globalPrivacyControl = true;
    window.__ieltsOptionalConsent = 'granted';

    expect(readOptionalConsent()).toBe('denied');
    expect(analyticsConsentGranted()).toBe(false);
    expect(writeOptionalConsent('granted')).toBe('denied');
    expect(window.__ieltsOptionalConsent).toBe('denied');
  });

  it('sets a geo-aware pre-tag document default from the region cookie', () => {
    const documentSource = readFileSync(
      new URL('../../pages/_document.js', import.meta.url),
      'utf8'
    );

    expect(documentSource).toContain(
      "var regionDefault = readCookie('ib_consent_default');"
    );
    expect(documentSource).toContain(
      'window.__ieltsConsentDefault = regionDefault;'
    );
    expect(documentSource).toContain(
      "? regionDefault : 'denied';"
    );
    expect(documentSource).toContain(
      'var gpc = navigator.globalPrivacyControl === true;'
    );
    expect(documentSource).toContain(
      "gtag('set', 'ads_data_redaction', true);"
    );
    expect(documentSource.indexOf("gtag('consent', 'default'")).toBeLessThan(
      documentSource.indexOf('<Main />')
    );
  });
});
