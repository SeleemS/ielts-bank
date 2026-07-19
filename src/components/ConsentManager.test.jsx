// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { OPTIONAL_CONSENT_KEY } from '../lib/consent';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) =>
    React.createElement('a', { href, ...rest }, children),
}));

import ConsentManager from './ConsentManager';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

async function renderManager(onConsentChange = vi.fn()) {
  await act(async () => {
    root.render(<ConsentManager onConsentChange={onConsentChange} />);
    await Promise.resolve();
  });
  return onConsentChange;
}

function clickButton(label) {
  const button = [...container.querySelectorAll('button')].find(
    (item) => item.textContent.trim() === label
  );
  expect(button).toBeTruthy();
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.__ieltsOptionalConsent = null;
  Object.defineProperty(window.navigator, 'globalPrivacyControl', {
    configurable: true,
    value: false,
  });
  window.gtag = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete window.gtag;
  delete window.__ieltsOptionalConsent;
  delete window.navigator.globalPrivacyControl;
  vi.clearAllMocks();
});

describe('ConsentManager', () => {
  it('shows a first-visit choice and honors reject then accept updates', async () => {
    const onConsentChange = await renderManager();
    expect(container.textContent).toContain('Your privacy choices');

    clickButton('Reject optional cookies');
    expect(window.localStorage.getItem(OPTIONAL_CONSENT_KEY)).toBe('denied');
    expect(onConsentChange).toHaveBeenLastCalledWith('denied');
    expect(window.gtag).toHaveBeenLastCalledWith(
      'consent',
      'update',
      expect.objectContaining({
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      })
    );
    expect(container.textContent).toContain('Privacy choices');

    clickButton('Privacy choices');
    clickButton('Accept optional cookies');
    expect(window.localStorage.getItem(OPTIONAL_CONSENT_KEY)).toBe('granted');
    expect(onConsentChange).toHaveBeenLastCalledWith('granted');
    expect(window.gtag).toHaveBeenLastCalledWith(
      'consent',
      'update',
      expect.objectContaining({
        analytics_storage: 'granted',
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
      })
    );
  });

  it('restores a saved denial without reopening the banner', async () => {
    window.localStorage.setItem(OPTIONAL_CONSENT_KEY, 'denied');

    await renderManager();

    expect(container.textContent).not.toContain('Reject optional cookies');
    expect(container.textContent).toContain('Privacy choices');
    expect(window.gtag).toHaveBeenCalledWith(
      'consent',
      'update',
      expect.objectContaining({ analytics_storage: 'denied' })
    );
  });

  it('keeps analytics denied when Global Privacy Control is enabled', async () => {
    Object.defineProperty(window.navigator, 'globalPrivacyControl', {
      configurable: true,
      value: true,
    });
    window.localStorage.setItem(OPTIONAL_CONSENT_KEY, 'granted');

    await renderManager();

    expect(container.textContent).not.toContain('Accept optional cookies');
    expect(container.textContent).toContain('Privacy choices');
    expect(window.gtag).toHaveBeenCalledWith(
      'consent',
      'update',
      expect.objectContaining({
        analytics_storage: 'denied',
        ad_storage: 'denied',
      })
    );
  });
});
