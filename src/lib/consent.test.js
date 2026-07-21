import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OPTIONAL_CONSENT_KEY,
  analyticsConsentGranted,
  consentAwareVercelEvent,
  globalPrivacyControlEnabled,
  normalizeOptionalConsent,
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

  it('defaults analytics and Vercel events to ON (opt-out) with no explicit choice', () => {
    const event = { url: 'https://www.ielts-bank.com/' };

    expect(readOptionalConsent()).toBe('granted');
    expect(analyticsConsentGranted()).toBe(true);
    expect(consentAwareVercelEvent(event)).toBe(event);
  });

  it('blocks analytics after an explicit opt-out', () => {
    window.__ieltsOptionalConsent = 'denied';

    expect(readOptionalConsent()).toBe('denied');
    expect(analyticsConsentGranted()).toBe(false);
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

  it('sets the pre-tag document default to granted until an explicit opt-out', () => {
    const documentSource = readFileSync(
      new URL('../../pages/_document.js', import.meta.url),
      'utf8'
    );

    expect(documentSource).toContain(
      "var optional = (gpc || saved === 'denied') ? 'denied' : 'granted';"
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
