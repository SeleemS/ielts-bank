import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAnonId,
  getSessionId,
  ensureGoogleAnalytics,
  resetAnalyticsForTests,
  track,
  trackPageView,
} from './analytics';

function storage() {
  const values = new Map();
  return {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, String(value))),
  };
}

describe('dual analytics tracking', () => {
  let uuid;

  beforeEach(() => {
    let sequence = 0;
    uuid = vi.fn(() => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`);
    global.window = {
      crypto: { randomUUID: uuid },
      localStorage: storage(),
      sessionStorage: storage(),
      location: {
        origin: 'https://ielts-bank.com',
        hostname: 'ielts-bank.com',
        pathname: '/readingquestion/demo',
        search: '?utm_source=search',
      },
      fetch: vi.fn(() => Promise.resolve({ ok: true })),
      gtag: vi.fn(),
      __ieltsGaConfigured: true,
      __ieltsConsentDefaulted: true,
    };
    global.document = {
      referrer: '',
      title: 'Reading practice',
    };
    resetAnalyticsForTests();
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
  });

  it('persists stable anonymous and per-tab session IDs', () => {
    expect(getAnonId()).toBe(getAnonId());
    expect(getSessionId()).toBe(getSessionId());
    expect(window.localStorage.setItem).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.setItem).toHaveBeenCalled();
  });

  it('sends the same enriched event to GA4 and the first-party endpoint', () => {
    track('ui_interaction', { element_id: 'pricing_cta' });

    expect(window.gtag).toHaveBeenCalledTimes(1);
    const [, gaEvent, gaPayload] = window.gtag.mock.calls[0];
    const request = window.fetch.mock.calls[0][1];
    const body = JSON.parse(request.body);

    expect(gaEvent).toBe('ui_interaction');
    expect(request.keepalive).toBe(true);
    expect(body.event).toBe('ui_interaction');
    expect(body.element_id).toBe('pricing_cta');
    expect(body.client_event_id).toBe(gaPayload.client_event_id);
    expect(body.session_id).toBe(gaPayload.session_id);
    expect(body.page_view_id).toBe(gaPayload.page_view_id);
    expect(body.event_sequence).toBe(1);
    expect(body.occurred_at).toMatch(/Z$/);
  });

  it('self-heals the GA queue when inline bootstrap scripts did not execute', () => {
    delete window.gtag;
    delete window.dataLayer;
    window.__ieltsGaConfigured = false;
    window.__ieltsConsentDefaulted = false;

    ensureGoogleAnalytics();

    expect(typeof window.gtag).toBe('function');
    expect(window.__ieltsGaConfigured).toBe(true);
    expect(window.__ieltsConsentDefaulted).toBe(true);
    expect(window.dataLayer.map((entry) => entry[0])).toEqual(['consent', 'js', 'config']);
  });

  it('rotates page-view IDs while retaining the session journey', () => {
    trackPageView('/one');
    track('ui_interaction', { element_id: 'first' });
    trackPageView('/two');

    const bodies = window.fetch.mock.calls.map(([, options]) => JSON.parse(options.body));
    expect(bodies[0].page_view_id).toBe(bodies[1].page_view_id);
    expect(bodies[2].page_view_id).not.toBe(bodies[1].page_view_id);
    expect(new Set(bodies.map((body) => body.session_id)).size).toBe(1);
    expect(bodies.map((body) => body.event_sequence)).toEqual([1, 2, 3]);
  });
});
