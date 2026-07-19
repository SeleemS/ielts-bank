import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
  ADSENSE_CLIENT,
  ADSENSE_SCRIPT_BASE,
  adsenseScriptUrl,
  syncAdSenseScript,
} from './adsenseLoader';

describe('AdSense script loader', () => {
  it('creates the unmodified official asynchronous tag shape', () => {
    const { document } = new JSDOM('<!doctype html><html><head></head></html>').window;

    const script = syncAdSenseScript(document, true);

    expect(script.hasAttribute('async')).toBe(true);
    expect(script.src).toBe(adsenseScriptUrl());
    expect(script.crossOrigin).toBe('anonymous');
    expect(script.getAttribute('data-nscript')).toBeNull();
    expect(script.getAttributeNames().sort()).toEqual(['async', 'crossorigin', 'src']);
    expect(script.src).toBe(`${ADSENSE_SCRIPT_BASE}?client=${ADSENSE_CLIENT}`);
  });

  it('is idempotent and removes the tag when ads become disallowed', () => {
    const { document } = new JSDOM('<!doctype html><html><head></head></html>').window;
    const first = syncAdSenseScript(document, true);
    const second = syncAdSenseScript(document, true);

    expect(second).toBe(first);
    expect(document.querySelectorAll(`script[src^="${ADSENSE_SCRIPT_BASE}"]`)).toHaveLength(1);

    expect(syncAdSenseScript(document, false)).toBeNull();
    expect(document.querySelector(`script[src^="${ADSENSE_SCRIPT_BASE}"]`)).toBeNull();
  });

  it('encodes a supplied publisher id safely', () => {
    expect(adsenseScriptUrl('ca-pub-1 & 2'))
      .toBe(`${ADSENSE_SCRIPT_BASE}?client=ca-pub-1%20%26%202`);
  });
});
