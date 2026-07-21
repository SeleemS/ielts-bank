// @vitest-environment jsdom
// The Band Estimator's conversion gate: an anonymous visitor who wrote a sample
// sees their Reading/Listening bands but NOT the Writing band or the overall —
// those are the sign-up reward, withheld by the API (never present client-side).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const state = { user: null, isPremium: false };

vi.mock('../../lib/analytics', () => ({
  track: vi.fn(),
  getAnonId: () => '11111111-1111-4111-8111-111111111111',
}));
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('../../lib/usePlan', () => ({ usePlan: () => ({ isPremium: state.isPremium }) }));
vi.mock('../auth/SignInDialog', () => ({ default: () => null }));
vi.mock('../NewsletterSignup', () => ({ default: () => null }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) => React.createElement('a', { href, ...rest }, children),
}));
vi.mock('../../../lib/supabase', () => ({
  getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } }),
}));

import EstimatorResults from './EstimatorResults';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

const baseProps = {
  reading: { raw: 7, total: 10, band: 6.5 },
  listening: { raw: 6, total: 10, band: 6 },
  speaking: { points: 4, band: { min: 6, max: 7 } },
  skipped: {},
  initialTargetBand: 7,
};

beforeEach(() => {
  state.user = null;
  state.isPremium = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete global.fetch;
  vi.clearAllMocks();
});

async function flush() {
  for (let i = 0; i < 4; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await Promise.resolve(); });
  }
}

describe('EstimatorResults writing gate', () => {
  it('withholds the Writing band and the overall from an anonymous visitor', () => {
    act(() => {
      root.render(<EstimatorResults {...baseProps} writing={{ locked: true }} overall={null} />);
    });

    // Measured Reading/Listening are shown as proof of value.
    expect(container.textContent).toContain('6.5');
    // The gate is explicit, and the overall is not rendered.
    expect(container.textContent).toContain('Your overall band is ready');
    expect(container.textContent).toContain('Reveal my band');
    expect(container.textContent).toContain('Locked');
    // The plan is part of the account reward, so it is not shown yet.
    expect(container.textContent).not.toMatch(/Your plan to reach/i);
  });

  it('reveals the Writing band and overall once signed in', async () => {
    state.user = { id: 'user-1' };
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ band: 6, wordCount: 104, criteria: {}, premium: false }),
    }));

    act(() => {
      root.render(<EstimatorResults {...baseProps} writing={{ locked: true }} overall={null} />);
    });
    await flush();

    expect(global.fetch).toHaveBeenCalledWith('/api/estimator/reveal', expect.anything());
    // Writing band is now shown, the lock is gone, and the plan appears.
    expect(container.textContent).toContain('indicative');
    expect(container.textContent).not.toContain('Reveal my band');
    expect(container.textContent).toMatch(/Your plan to reach/i);
  });

  it('still shows a self-assessed range when the visitor skipped the sample', () => {
    act(() => {
      root.render(
        <EstimatorResults {...baseProps} writing={{ points: 3, band: { min: 5.5, max: 6.5 } }} overall={6} />
      );
    });
    expect(container.textContent).toContain('Self-assessed');
    expect(container.textContent).not.toContain('Reveal my band');
  });
});
