// @vitest-environment jsdom
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import SampleReportPreview, { SAMPLE_REPORT } from './SampleReportPreview';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const tierOf = (id) => container.querySelector(`[data-testid="${id}"]`)?.getAttribute('data-tier');

it('labels exactly what the free report includes and what Pro adds', () => {
  act(() => root.render(<SampleReportPreview />));
  // Mirrors reduceForFree: bands + criterion feedback + one correction are free.
  expect(tierOf('sample-criteria')).toBe('free');
  expect(tierOf('sample-first-correction')).toBe('free');
  // Everything the API withholds from a free score is tagged Pro.
  expect(tierOf('sample-summary')).toBe('pro');
  expect(tierOf('sample-plan')).toBe('pro');
  expect(tierOf('sample-all-corrections')).toBe('pro');
  expect(tierOf('sample-rewrite')).toBe('pro');
});

it('is clearly presented as an illustration, not a learner result or promise', () => {
  act(() => root.render(<SampleReportPreview />));
  expect(container.textContent).toContain('not a real learner’s result or a promised score');
  expect(container.textContent).toContain(SAMPLE_REPORT.overallBand.toFixed(1));
  for (const c of SAMPLE_REPORT.criteria) expect(container.textContent).toContain(c.label);
});

it('renders a page-supplied call to action and a custom anchor id', () => {
  act(() =>
    root.render(
      <SampleReportPreview id="report-demo">
        <a href="/ielts-writing-checker">Check my essay</a>
      </SampleReportPreview>
    )
  );
  expect(container.querySelector('section#report-demo')).not.toBeNull();
  expect(container.querySelector('a[href="/ielts-writing-checker"]').textContent).toBe('Check my essay');
});
