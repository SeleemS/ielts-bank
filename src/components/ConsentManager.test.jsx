// @vitest-environment jsdom
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import ConsentManager from './ConsentManager';
import { OPTIONAL_CONSENT_KEY } from '../lib/consent';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container, root;
beforeEach(() => {
  localStorage.clear();
  window.__ieltsOptionalConsent = null;
  window.__ieltsConsentDefault = 'granted';
  window.gtag = vi.fn();
  Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: false });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
  delete window.__ieltsOptionalConsent;
  delete window.__ieltsConsentDefault;
  delete window.gtag;
  delete navigator.globalPrivacyControl;
});
async function render() {
  const onChange = vi.fn();
  await act(async () => root.render(<ConsentManager onConsentChange={onChange} />));
  return onChange;
}
it('renders no popup and does not manufacture a choice on first visit', async () => {
  const onChange = await render();
  expect(container.innerHTML).toBe('');
  expect(localStorage.getItem(OPTIONAL_CONSENT_KEY)).toBeNull();
  expect(onChange).toHaveBeenLastCalledWith('granted');
  act(() => window.dispatchEvent(new Event('ib:open-consent')));
  expect(container.innerHTML).toBe('');
  expect(window.gtag).toHaveBeenCalledWith('consent', 'update', expect.objectContaining({analytics_storage:'granted', ad_storage:'granted'}));
});
it.each(['granted', 'denied'])('preserves a previous explicit %s choice without showing UI', async choice => {
  localStorage.setItem(OPTIONAL_CONSENT_KEY, choice);
  const onChange = await render();
  expect(onChange).toHaveBeenLastCalledWith(choice);
  expect(container.innerHTML).toBe('');
});
it('honors Global Privacy Control over a saved grant', async () => {
  localStorage.setItem(OPTIONAL_CONSENT_KEY, 'granted');
  Object.defineProperty(navigator, 'globalPrivacyControl', {configurable:true,value:true});
  const onChange = await render();
  expect(onChange).toHaveBeenLastCalledWith('denied');
});
it('reacts to withdrawal in another tab without reopening any popup', async () => {
  window.__ieltsOptionalConsent = 'granted';
  const onChange = await render();
  expect(onChange).toHaveBeenLastCalledWith('granted');
  localStorage.setItem(OPTIONAL_CONSENT_KEY,'denied');
  act(() => window.dispatchEvent(new StorageEvent('storage',{key:OPTIONAL_CONSENT_KEY,newValue:'denied'})));
  expect(onChange).toHaveBeenLastCalledWith('denied');
  expect(container.innerHTML).toBe('');
});
