// @vitest-environment jsdom
// /billing/resume — the page the checkout recovery email links to.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';

const testState = vi.hoisted(() => ({
  router: null,
  user: null,
  accessToken: 'access-token',
  signOut: null,
  dialogOpen: false,
}));

vi.mock('next/head', () => ({
  default: ({ children }) => React.createElement(React.Fragment, null, children),
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) => React.createElement('a', { href, ...rest }, children),
}));
vi.mock('next/router', () => ({ useRouter: () => testState.router }));
vi.mock('../src/components/Navbar', () => ({ default: () => React.createElement('nav') }));
vi.mock('../src/components/Footer', () => ({ default: () => React.createElement('footer') }));
vi.mock('../src/components/auth/SignInDialog', () => ({
  default: ({ open, redirectOnFinish }) => {
    testState.dialogOpen = open;
    return open ? React.createElement('div', { 'data-testid': 'signin', 'data-redirect': String(redirectOnFinish) }) : null;
  },
}));
vi.mock('../src/lib/auth', () => ({
  useAuth: () => ({ user: testState.user, loading: false, signOut: testState.signOut }),
}));
vi.mock('../lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({
        data: { session: testState.accessToken ? { access_token: testState.accessToken } : null },
        error: null,
      }),
    },
  }),
}));
vi.mock('../src/lib/analytics', () => ({ track: vi.fn(), gaClientId: () => 'ga.1' }));

import ResumeCheckoutPage from '../pages/billing/resume';
import { track } from '../src/lib/analytics';
import { resumeNoticeText } from '../src/components/billing/ResumeNotice';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
let assign;
const originalLocation = window.location;

function makeRouter(query = { c: TOKEN }) {
  return { isReady: true, query, replace: vi.fn(async () => true) };
}

async function renderPage() {
  await act(async () => {
    root.render(React.createElement(ResumeCheckoutPage));
  });
  // Let the resume fetch chain settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function mockFetch(status, body) {
  globalThis.fetch = vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
}

beforeEach(() => {
  testState.router = makeRouter();
  testState.user = { id: 'user-1', is_anonymous: false };
  testState.accessToken = 'access-token';
  testState.signOut = vi.fn(async () => ({}));
  testState.dialogOpen = false;
  window.sessionStorage.clear();
  assign = vi.fn();
  delete window.location;
  window.location = { ...originalLocation, assign, origin: 'http://localhost' };
  vi.mocked(track).mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.location = originalLocation;
  delete globalThis.fetch;
});

describe('/billing/resume page', () => {
  it('asks a signed-out visitor to sign in first and never calls checkout', async () => {
    testState.user = null;
    mockFetch(200, {});
    await renderPage();
    expect(container.querySelector('[data-testid="signin"]')).not.toBeNull();
    // In-place sign-in: the dialog must not bounce to the dashboard.
    expect(container.querySelector('[data-testid="signin"]').dataset.redirect).toBe('false');
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith('checkout_resume', { outcome: 'sign_in_required' });
    // The token leaves the address bar immediately.
    expect(testState.router.replace).toHaveBeenCalledWith('/billing/resume', undefined, { shallow: true });
  });

  it('opens the fresh checkout the server created', async () => {
    mockFetch(200, { outcome: 'new_session', url: 'https://checkout.stripe.com/c/pay/cs_live_fresh' });
    await renderPage();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/billing/resume', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
      body: JSON.stringify({ c: TOKEN, ga_cid: 'ga.1' }),
    }));
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_live_fresh');
  });

  it('follows the friendly redirect for an account that already has Pro', async () => {
    mockFetch(409, { outcome: 'already_premium', redirect: '/dashboard?resume=already_premium' });
    await renderPage();
    expect(assign).not.toHaveBeenCalled();
    expect(testState.router.replace).toHaveBeenCalledWith('/dashboard?resume=already_premium');
  });

  it('explains a wrong-account link and offers to switch accounts', async () => {
    mockFetch(403, { outcome: 'wrong_user', error: 'This checkout link belongs to a different IELTS Bank account.' });
    await renderPage();
    expect(container.textContent).toContain('different IELTS Bank account');
    const button = [...container.querySelectorAll('button')].find((el) => el.textContent.includes('switch account'));
    await act(async () => { button.click(); });
    expect(testState.signOut).toHaveBeenCalled();
    expect(testState.dialogOpen).toBe(true);
  });

  it('has a friendly notice for every refusal the resume route can redirect with', () => {
    for (const code of ['unavailable', 'expired', 'plan_changed', 'offer_ended', 'already_premium', 'already_exam_pass']) {
      expect(resumeNoticeText(code), code).toMatch(/\w/);
    }
    expect(resumeNoticeText('toString')).toBe('');
    expect(resumeNoticeText(undefined)).toBe('');
  });

  it('sends a link without a token to pricing', async () => {
    testState.router = makeRouter({});
    mockFetch(200, {});
    await renderPage();
    expect(testState.router.replace).toHaveBeenCalledWith('/pricing?resume=unavailable');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
