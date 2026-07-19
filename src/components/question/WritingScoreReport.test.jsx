// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

vi.mock('../../lib/analytics', () => ({ track: vi.fn() }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) =>
    React.createElement('a', { href, ...rest }, children),
}));

import WritingScoreReport from './WritingScoreReport';
import { track } from '../../lib/analytics';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

const result = {
  overallBand: 6,
  wordCount: 276,
  free: true,
  criteria: {
    taskResponse: {
      band: 6,
      strengths: ['A clear position'],
      improvements: ['Develop the second idea'],
    },
    coherenceCohesion: {
      band: 6,
      strengths: ['Logical paragraphs'],
      improvements: ['Use references more precisely'],
    },
    lexicalResource: {
      band: 6,
      strengths: ['Relevant vocabulary'],
      improvements: ['Avoid repetition'],
    },
    grammaticalRange: {
      band: 5.5,
      strengths: ['Some complex sentences'],
      improvements: ['Check agreement'],
    },
  },
  summary: 'A relevant response with several fixable control issues.',
  improvements: ['Add a more specific example.'],
  correctedExamples: [
    { original: 'People is affected.', suggestion: 'People are affected.' },
  ],
};

function render(element) {
  act(() => {
    root.render(element);
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('WritingScoreReport free-score tease', () => {
  it('shows the overall band and first criterion while locking the remaining report', () => {
    render(<WritingScoreReport task={2} result={result} />);

    const headings = [...container.querySelectorAll('h3')];
    const taskResponse = headings.find((node) => node.textContent === 'Task Response');
    const coherence = headings.find((node) => node.textContent === 'Coherence & Cohesion');
    expect(taskResponse.closest('[aria-hidden="true"]')).toBeNull();
    expect(coherence.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(container.querySelectorAll('div.relative[aria-hidden="true"]')).toHaveLength(6);
    expect(container.textContent).toContain('Your Band 6.0 essay has 6 fixable issues');
    expect(container.textContent).toContain('Unlock full feedback — Premium');
    expect(track).toHaveBeenCalledWith(
      'premium_gate',
      expect.objectContaining({ source: 'score_tease', stage: 'impression', band: 6 })
    );

    const upgrade = container.querySelector('a[href="/pricing?upgrade=writing"]');
    upgrade.addEventListener('click', (event) => event.preventDefault());
    act(() => {
      upgrade.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(track).toHaveBeenCalledWith(
      'paywall_upgrade_click',
      expect.objectContaining({ source: 'score_tease', skill: 'writing', band: 6 })
    );
  });

  it('renders the complete report without a tease for a paid score', () => {
    render(<WritingScoreReport task={2} result={{ ...result, free: false }} />);
    expect(container.querySelectorAll('div.relative[aria-hidden="true"]')).toHaveLength(0);
    expect(container.textContent).not.toContain('Unlock full feedback — Premium');
    expect(track).not.toHaveBeenCalled();
  });
});
