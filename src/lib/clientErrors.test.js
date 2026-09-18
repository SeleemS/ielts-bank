// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isStaleChunkError, recoverFromStaleChunk } from './clientErrors';

describe('isStaleChunkError', () => {
  it('matches the real stale-deploy signatures', () => {
    expect(isStaleChunkError({ name: 'ChunkLoadError', message: 'Loading chunk 4523 failed.' })).toBe(true);
    expect(isStaleChunkError({ message: 'Loading CSS chunk 12 failed (/_next/static/css/x.css)' })).toBe(true);
    expect(isStaleChunkError({ message: 'Failed to fetch dynamically imported module: https://x/_next/y.js' })).toBe(true);
    expect(isStaleChunkError('Importing a module script failed.')).toBe(true);
  });

  it('ignores ordinary errors and empty input', () => {
    expect(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false);
    expect(isStaleChunkError({ message: 'Network request failed' })).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
  });
});

describe('recoverFromStaleChunk', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('reloads once per URL, never twice (loop guard)', () => {
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, assign, href: 'https://www.ielts-bank.com/pricing' },
    });

    expect(recoverFromStaleChunk('/pricing')).toBe(true);
    expect(assign).toHaveBeenCalledWith('/pricing');
    // Same target again: the guard must refuse (a genuine chunk 404 that
    // is NOT staleness would otherwise reload forever).
    expect(recoverFromStaleChunk('/pricing')).toBe(false);
    expect(assign).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });

  it('does not reload when sessionStorage is unavailable', () => {
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, assign, href: 'https://www.ielts-bank.com/' },
    });
    const spy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('denied');
      });

    expect(recoverFromStaleChunk('/x')).toBe(false);
    expect(assign).not.toHaveBeenCalled();

    spy.mockRestore();
    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });
});

const telemetry = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('./analytics', () => telemetry);

// Re-import to isolate the per-document reporting budget, just as a new page
// load does. Exercise installed handlers rather than merely their formatter.
describe('privacy-safe client diagnostics', () => {
  let handlers;
  let cleanup;
  let report;
  beforeEach(async () => {
    cleanup?.();
    vi.resetModules();
    telemetry.track.mockClear();
    window.__NEXT_DATA__ = { buildId: 'build-123' };
    const diagnostics = await import('./clientErrors');
    report = diagnostics.reportClientError;
    handlers = {};
    cleanup = diagnostics.installClientErrorHandlers({ events: {
      on: (name, handler) => { handlers[name] = handler; },
      off: vi.fn(),
    } });
  });
  afterEach(() => { cleanup?.(); delete window.__NEXT_DATA__; });
  const flush = async () => { await vi.dynamicImportSettled(); };
  const rejection = (reason) => {
    const event = new Event('unhandledrejection');
    Object.defineProperty(event, 'reason', { value: reason });
    window.dispatchEvent(event);
  };

  it.each([
    [undefined, 'missing_reason'], [null, 'null_reason'],
    ['private essay email@example.com https://secret.test/?token=abc', 'string_reason'],
    [new Error('private essay'), 'error_object'],
  ])('classifies rejection %s without transmitting its contents', async (reason, classification) => {
    rejection(reason);
    await flush();
    expect(telemetry.track).toHaveBeenCalledTimes(1);
    const payload = telemetry.track.mock.calls[0][1];
    expect(payload).toMatchObject({ message: classification, source: 'unhandledrejection', build_id: 'build-123' });
    expect(JSON.stringify(payload)).not.toMatch(/private essay|email@example|secret.test|token=abc/);
  });

  it('deduplicates opaque rejections without consuming actionable exception capacity', async () => {
    for (let i = 0; i < 10; i += 1) report(undefined, 'unhandledrejection');
    report(null, 'unhandledrejection');
    report('another opaque error', 'unhandledrejection');
    report(new TypeError('secret type error'), 'unhandledrejection');
    report(new RangeError('secret range error'), 'unhandledrejection');
    report(new ReferenceError('secret reference error'), 'unhandledrejection');
    report(new SyntaxError('over budget'), 'unhandledrejection');
    await flush();
    expect(telemetry.track).toHaveBeenCalledTimes(5);
    expect(telemetry.track.mock.calls.map(([, p]) => p.error_type)).toEqual([null, null, 'TypeError', 'RangeError', 'ReferenceError']);
  });

  it('keeps bounded same-origin generated filename and coordinates, stripping URL secrets', async () => {
    window.dispatchEvent(new ErrorEvent('error', {
      error: new TypeError('https://secret.test/?email=a'),
      filename: `${window.location.origin}/_next/static/chunks/pages/pricing-abc123.js?token=secret#private`,
      lineno: 12, colno: 8,
    }));
    await flush();
    expect(telemetry.track.mock.calls[0][1]).toMatchObject({
      source: 'window.onerror', error_type: 'TypeError',
      filename: '/_next/static/chunks/pages/pricing-abc123.js', line: 12, column: 8,
    });
    expect(JSON.stringify(telemetry.track.mock.calls)).not.toMatch(/secret|private|email=/);
  });

  it.each(['https://thirdparty.test/code.js?token=secret', '/private/essay.js', '/_next/static/chunks/secret%40mail.js'])('rejects unsafe resource location %s', async (filename) => {
    report('Script error.', 'window.onerror', { filename, line: 1, column: 1 });
    await flush();
    expect(telemetry.track.mock.calls[0][1]).toMatchObject({ message: 'opaque_script_error', filename: null, line: null, column: null });
  });

  it('does not coerce objects or expose custom error names, stack, source or build values', async () => {
    window.__NEXT_DATA__.buildId = 'https://private.test/?token=secret';
    report({ name: 'secret custom name', stack: 'secret stack', toString: () => { throw new Error('must not stringify'); } }, 'secret source');
    await flush();
    expect(telemetry.track.mock.calls[0][1]).toMatchObject({ message: 'non_error_reason', error_type: null, build_id: null, source: 'unknown_handler' });
    expect(JSON.stringify(telemetry.track.mock.calls)).not.toContain('secret');
  });

  it('normalizes missing route errors and ignores cancelled navigation', async () => {
    handlers.routeChangeError(undefined, '/pricing');
    handlers.routeChangeError({ cancelled: true }, '/pricing');
    await flush();
    expect(telemetry.track).toHaveBeenCalledTimes(1);
    expect(telemetry.track.mock.calls[0][1]).toMatchObject({ message: 'missing_reason', source: 'routeChangeError' });
  });

  it('reports a page family without a private path or query and bounds coordinates', async () => {
    const previous = window.location.href;
    window.history.replaceState({}, '', '/writingquestion/private-essay?token=secret#private');
    try {
      report(new Error('private'), 'window.onerror', { filename: '/_next/static/chunks/main-abc.js', line: -1, column: Infinity });
      await flush();
      expect(telemetry.track.mock.calls[0][1]).toMatchObject({ path: '/writingquestion', line: null, column: null });
      expect(JSON.stringify(telemetry.track.mock.calls)).not.toMatch(/secret|private/);
    } finally { window.history.replaceState({}, '', previous); }
  });

  it('does not allow throwing rejection getters to break reporting', async () => {
    const reason = { get name() { throw new Error('private'); } };
    expect(() => report(reason, 'unhandledrejection')).not.toThrow();
    rejection(reason);
    await flush();
    expect(telemetry.track).not.toHaveBeenCalled();
  });
});
