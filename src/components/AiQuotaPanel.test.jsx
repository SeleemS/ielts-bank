// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const state = { isPremium: false, loading: false };

vi.mock('../lib/usePlan', () => ({ usePlan: () => ({ ...state }) }));
vi.mock('../lib/analytics', () => ({ track: vi.fn() }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) => React.createElement('a', { href, ...rest }, children),
}));

import AiQuotaPanel from './AiQuotaPanel';
import { track } from '../lib/analytics';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

function render(props = {}) {
  act(() => {
    root.render(<AiQuotaPanel open skill="writing" {...props} />);
  });
}

beforeEach(() => {
  state.isPremium = false;
  state.loading = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('AiQuotaPanel plan verification', () => {
  it('defers the modal and impression until a Premium owner is verified', () => {
    state.loading = true;
    render();

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toBe('');
    expect(track).not.toHaveBeenCalled();

    state.loading = false;
    state.isPremium = true;
    render();

    expect(container.textContent).toContain('You’ve hit a fair-use limit');
    expect(container.textContent).not.toContain('Upgrade to Premium');
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('premium_gate', {
      source: 'quota_modal',
      stage: 'impression',
      skill: 'writing',
      premium: true,
    });
  });

  it('shows and attributes the upgrade pitch after a Free owner is verified', () => {
    render();

    expect(container.textContent).toContain('AI Writing scoring is a Premium feature');
    expect(container.textContent).toContain('Upgrade to Premium');
    expect(track).toHaveBeenCalledWith('premium_gate', {
      source: 'quota_modal',
      stage: 'impression',
      skill: 'writing',
      premium: false,
    });
  });
});
