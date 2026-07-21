// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const testState = vi.hoisted(() => ({
  planError: null,
  planSku: 'monthly',
}));

vi.mock('next/head', () => ({
  default: ({ children }) => React.createElement(React.Fragment, null, children),
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) =>
    React.createElement('a', { href, ...rest }, children),
}));
vi.mock('../src/components/Navbar', () => ({
  default: () => React.createElement('nav'),
}));
vi.mock('../src/components/Footer', () => ({
  default: () => React.createElement('footer'),
}));
vi.mock('../src/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'audit@example.com' },
    loading: false,
  }),
}));
vi.mock('../src/lib/usePlan', () => ({
  usePlan: () => ({
    isPremium: true,
    planSku: testState.planSku,
    planStatus: 'active',
    renewsAt: '2026-10-01T00:00:00.000Z',
    expiresAt: null,
    pauseUntil: null,
    pauseUsedAt: null,
    hasBillingAccount: true,
    loading: false,
    error: testState.planError,
  }),
}));
vi.mock('../lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: 'billing-access-token' } },
      }),
    },
  }),
}));
vi.mock('../src/lib/analytics', () => ({
  track: vi.fn(),
}));

import ManageBillingPage from '../pages/billing/manage';
import { track } from '../src/lib/analytics';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

beforeEach(() => {
  testState.planError = null;
  testState.planSku = 'monthly';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  global.fetch = vi.fn();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete global.fetch;
  vi.clearAllMocks();
});

describe('billing pause state', () => {
  it('immediately removes the one-time action and shows the paused state after success', async () => {
    const resumesAt = new Date(Date.now() + 30 * 86400000).toISOString();
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ paused: true, resumesAt }),
    });
    await act(async () => {
      root.render(<ManageBillingPage />);
      await Promise.resolve();
    });

    const pauseButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent.includes('Pause once')
    );
    expect(pauseButton).toBeTruthy();

    await act(async () => {
      pauseButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/billing/pause', {
      method: 'POST',
      headers: { Authorization: 'Bearer billing-access-token' },
    });
    expect(container.textContent).toContain('Premium is paused');
    expect(container.textContent).toContain('Your current pause ends');
    expect(
      [...container.querySelectorAll('button')].some(
        (button) => button.textContent.includes('Pause once')
      )
    ).toBe(false);
    expect(track).toHaveBeenCalledWith('subscription_pause', {
      source: 'billing_interstitial',
    });
  });

  it('hides all billing mutations when plan verification fails', async () => {
    testState.planError =
      'Could not verify your current plan. Please refresh and try again.';
    await act(async () => {
      root.render(<ManageBillingPage />);
      await Promise.resolve();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Billing actions are temporarily disabled.'
    );
    expect(
      [...container.querySelectorAll('button')].some(
        (button) =>
          button.textContent.includes('Pause once')
          || button.textContent.includes('Continue to Stripe')
      )
    ).toBe(false);
  });
});

describe('billing upgrade confirmation', () => {
  const quote = {
    targetSku: 'annual',
    amountDue: 3200,
    currency: 'usd',
    targetAmount: 4499,
    interval: 'year',
    intervalCount: 1,
    prorationDate: 1784600000,
    token: 'signed-quote-token',
  };

  it('previews the charge and requires explicit confirmation before upgrading', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          changed: false,
          requiresConfirmation: true,
          quote,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          changed: true,
          message: 'Your plan was upgraded.',
        }),
      });
    await act(async () => {
      root.render(<ManageBillingPage />);
      await Promise.resolve();
    });

    const annualButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent.includes('Upgrade to annual')
    );
    await act(async () => {
      annualButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/billing/change-plan', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer billing-access-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sku: 'annual', action: 'preview' }),
    });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Review your plan upgrade');
    expect(dialog?.textContent).toMatch(/USD\s44\.99 per year/);
    expect(dialog?.textContent).toMatch(/USD\s32\.00/);
    expect(track).not.toHaveBeenCalledWith(
      'subscription_plan_change',
      expect.anything()
    );

    const confirmButton = [...dialog.querySelectorAll('button')].find(
      (button) => button.textContent.includes('Confirm upgrade and charge')
    );
    await act(async () => {
      confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/billing/change-plan', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer billing-access-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sku: 'annual',
        action: 'confirm',
        acceptedAmount: 3200,
        acceptedCurrency: 'usd',
        prorationDate: 1784600000,
        quoteToken: 'signed-quote-token',
      }),
    });
    expect(track).toHaveBeenCalledWith('subscription_plan_change', {
      from_sku: 'monthly',
      to_sku: 'annual',
    });
  });

  it('shows a recalculated quote and requires another confirmation', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ requiresConfirmation: true, quote }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          requiresConfirmation: true,
          error: 'The upgrade estimate changed or expired. Review it and confirm again.',
          quote: { ...quote, amountDue: 3300, prorationDate: 1784600100 },
        }),
      });
    await act(async () => {
      root.render(<ManageBillingPage />);
      await Promise.resolve();
    });

    const annualButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent.includes('Upgrade to annual')
    );
    await act(async () => {
      annualButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const firstDialog = document.querySelector('[role="dialog"]');
    const confirmButton = [...firstDialog.querySelectorAll('button')].find(
      (button) => button.textContent.includes('Confirm upgrade and charge')
    );
    await act(async () => {
      confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const updatedDialog = document.querySelector('[role="dialog"]');
    expect(updatedDialog?.textContent).toMatch(/USD\s33\.00/);
    expect(updatedDialog?.querySelector('[role="alert"]')?.textContent).toMatch(
      /changed or expired/i
    );
    expect(track).not.toHaveBeenCalledWith(
      'subscription_plan_change',
      expect.anything()
    );
  });
});
