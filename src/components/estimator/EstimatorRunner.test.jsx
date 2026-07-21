// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

// Isolate the runner from auth/analytics/billing/portal side-effects so we can
// drive the pure step machine through the DOM.
vi.mock('../../lib/analytics', () => ({ track: vi.fn() }));
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../../lib/usePlan', () => ({ usePlan: () => ({ isPremium: false }) }));
vi.mock('../auth/SignInDialog', () => ({ default: () => null }));
vi.mock('../NewsletterSignup', () => ({ default: () => null }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) => React.createElement('a', { href, ...rest }, children),
}));

import EstimatorRunner from './EstimatorRunner';
import { track } from '../../lib/analytics';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

function render(el) {
  act(() => {
    root.render(el);
  });
}

function clickButton(text) {
  const target = [...container.querySelectorAll('button')].find((n) =>
    n.textContent.trim().toLowerCase().includes(text.toLowerCase())
  );
  if (!target) throw new Error(`No button matching "${text}"`);
  act(() => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

const props = {
  readingGroups: [],
  listeningGroups: [],
  listeningAudioUrl: '',
  readingTitle: 'Test Reading',
  listeningTitle: 'Test Listening',
  readingBodyHtml: '<p>passage</p>',
};

beforeEach(() => {
  window.localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('EstimatorRunner stepper', () => {
  it('renders the intro step first', () => {
    render(<EstimatorRunner {...props} />);
    expect(container.textContent).toContain("What's your IELTS band right now?");
    expect(container.textContent).toContain('Start the test');
  });

  it('advances intro → reading → listening on Start/Continue', () => {
    render(<EstimatorRunner {...props} />);
    clickButton('Start the test');
    expect(container.textContent).toContain('Step 1 of 5 · Reading');
    clickButton('Continue');
    expect(container.textContent).toContain('Step 2 of 5 · Listening');
    // estimator_start fired once on Start.
    expect(track).toHaveBeenCalledWith('estimator_start', expect.objectContaining({ version: expect.any(String) }));
  });

  it('skips every section through to the results screen', () => {
    render(<EstimatorRunner {...props} />);
    clickButton('Start the test');
    clickButton('Continue'); // reading measured (empty) -> listening
    clickButton('Skip this section'); // listening -> writing
    expect(container.textContent).toContain('Step 3 of 5 · Writing');
    // Writing now defaults to a MEASURED sample; opting out drops back to the
    // self-check, which is what can then be skipped entirely.
    clickButton('rather rate'); // sample -> self-check (same step)
    clickButton('Skip this section'); // writing -> speaking
    expect(container.textContent).toContain('Step 4 of 5 · Speaking');
    clickButton('Skip this section'); // speaking -> results

    expect(container.textContent).toContain('Your estimated IELTS band');
    expect(container.textContent).toContain('Not measured');

    // A skipped section fires estimator_section_complete with skipped:true.
    expect(track).toHaveBeenCalledWith(
      'estimator_section_complete',
      expect.objectContaining({ skill: 'listening', skipped: true })
    );
    // estimator_complete fired once on entering results.
    expect(track).toHaveBeenCalledWith('estimator_complete', expect.objectContaining({ version: expect.any(String) }));
  });

  it('shows the marked writing sample by default and discloses the gate upfront', () => {
    render(<EstimatorRunner {...props} />);
    clickButton('Start the test');
    clickButton('Skip this section'); // reading
    clickButton('Skip this section'); // listening

    expect(container.textContent).toContain('Writing sample');
    expect(container.textContent).toContain('Mark my writing');
    // The sign-up gate must be stated BEFORE the visitor invests effort writing.
    expect(container.textContent).toMatch(/unlock when you save your results/i);
    // ...and there is always a visible escape to the self-check.
    expect(container.textContent).toMatch(/rather rate my own writing/i);
  });

  it('persists the final result to localStorage on completion', () => {
    render(<EstimatorRunner {...props} />);
    clickButton('Start the test');
    clickButton('Skip this section'); // reading
    clickButton('Skip this section'); // listening
    clickButton('rather rate'); // writing sample -> self-check
    clickButton('Skip this section'); // writing
    clickButton('Skip this section'); // speaking -> results

    const stored = JSON.parse(window.localStorage.getItem('ielts-estimator-result'));
    expect(stored.version).toBeTruthy();
    expect(stored.bands).toEqual({ reading: null, listening: null, writing: null, speaking: null });
    expect(stored.sectionsSkipped).toContain('speaking');
    // In-progress key is cleared once the run completes.
    expect(window.localStorage.getItem('ielts-estimator:v1')).toBeNull();
  });
});
