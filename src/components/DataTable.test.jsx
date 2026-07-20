// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) =>
    React.createElement('a', { href, ...rest }, children),
}));
vi.mock('next/router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('./AdUnit', () => ({ default: () => null }));

import DataTable from './DataTable';

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
  vi.clearAllMocks();
});

describe('DataTable average user band', () => {
  it('shows transparent estimates and real submitted averages', () => {
    act(() => {
      root.render(
        <DataTable
          skill="reading"
          items={[
            {
              id: 'estimated-passage',
              title: 'Estimated passage',
              difficulty: 'hard',
              averageUserBand: 5,
              averageUserBandIsEstimated: true,
              bandSubmissionCount: 0,
            },
            {
              id: 'real-passage',
              title: 'Real passage',
              difficulty: 'medium',
              averageUserBand: 6.25,
              averageUserBandIsEstimated: false,
              bandSubmissionCount: 4,
            },
          ]}
        />
      );
    });

    expect(container.querySelector('abbr[title="Average user band"]')).not.toBeNull();
    expect(
      container.querySelector('[aria-label^="Estimated average band 5.0"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[aria-label="Average user band 6.3 from 4 total submissions"]')
    ).not.toBeNull();
  });
});
