// @vitest-environment jsdom
// The task landing pages (/ielts-writing-checker/task-2, /task-1,
// /general-training-letter) reuse the one checker locked to their task. They
// share the main checker's localStorage draft, so a locked page must never
// restore — or overwrite — a draft written for a different task, and must
// accept the essay bank's prompt handoff for its own task.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { renderToStaticMarkup } from 'react-dom/server';

const testState = vi.hoisted(() => ({ user: null, authLoading: false, pushed: [] }));

vi.mock('next/head', () => ({
  default: ({ children }) => React.createElement(React.Fragment, null, children),
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) => React.createElement('a', { href, ...rest }, children),
}));
vi.mock('next/router', () => ({
  useRouter: () => ({
    isReady: true,
    query: {},
    push: (url) => {
      testState.pushed.push(url);
      return Promise.resolve(true);
    },
  }),
}));
vi.mock('../src/components/Navbar', () => ({ default: () => React.createElement('nav') }));
vi.mock('../src/components/Footer', () => ({ default: () => React.createElement('footer') }));
vi.mock('../src/components/AiQuotaPanel', () => ({ default: () => null }));
vi.mock('../src/components/question/FreeSampleChip', () => ({ default: () => null }));
vi.mock('../src/components/question/WritingScoreReport', () => ({
  default: () => React.createElement('div', null, 'report'),
}));
vi.mock('../src/components/question/ScoreUI', () => ({
  ScoringProgress: ({ onFinished }) => {
    React.useEffect(() => {
      onFinished?.();
    }, [onFinished]);
    return React.createElement('div', null, 'scoring');
  },
}));
vi.mock('../src/components/auth/SignInDialog', () => ({
  default: ({ open }) => (open ? React.createElement('div', { 'data-testid': 'sign-in-dialog' }) : null),
}));
vi.mock('../src/lib/auth', () => ({
  useAuth: () => ({ user: testState.user, loading: testState.authLoading }),
}));
vi.mock('../src/lib/progress', () => ({ saveAttemptToSupabase: vi.fn() }));
vi.mock('../lib/supabase', () => ({ getSupabase: () => ({}) }));
vi.mock('../src/lib/sessionAccess', () => ({
  getSessionAccess: async () => ({ accessToken: null, error: null }),
}));
vi.mock('../src/lib/analytics', () => ({ track: vi.fn(), getAnonId: () => null }));

import WritingCheckerTool from '../src/components/writingChecker/WritingCheckerTool';
import WritingCheckerTaskPage from '../pages/ielts-writing-checker/[task]';
import { getStaticPaths, getStaticProps } from '../pages/ielts-writing-checker/[task]';
import { saveWritingDraft } from '../src/lib/writingDraft';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DRAFT_KEY = 'ielts-writing-checker-draft';
const LETTER =
  'Dear Sir or Madam, I am writing to complain about the room I stayed in last weekend, which was noisy and dirty. '.repeat(8);

let container;
let root;

function render(props) {
  act(() => {
    root.render(React.createElement(React.StrictMode, null, React.createElement(WritingCheckerTool, props)));
  });
}

beforeEach(() => {
  testState.user = null;
  testState.authLoading = false;
  testState.pushed = [];
  window.localStorage.clear();
  window.sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('locked task checker', () => {
  it('shows the fixed task instead of the task select', () => {
    render({ lockedTaskType: 'task1-general', variant: 'general-training-letter' });
    expect(container.querySelector('#task-type')).toBeNull();
    expect(container.textContent).toContain('Task 1 — General Training');
    expect(container.textContent).toContain('0 / 150 words');
  });

  it('neither restores nor overwrites a stored draft for a different task', () => {
    const other = JSON.stringify({ taskType: 'task2', prompt: 'Essay prompt', essay: 'My Task 2 essay' });
    window.localStorage.setItem(DRAFT_KEY, other);
    render({ lockedTaskType: 'task1-academic', variant: 'task-1' });
    expect(container.querySelector('#essay').value).toBe('');
    expect(window.localStorage.getItem(DRAFT_KEY)).toBe(other);
  });

  it('restores a stored draft of its own task', () => {
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ taskType: 'task1-general', prompt: 'Write to the manager', essay: 'Dear Sir' })
    );
    render({ lockedTaskType: 'task1-general' });
    expect(container.querySelector('#essay').value).toBe('Dear Sir');
    expect(container.querySelector('#prompt').value).toBe('Write to the manager');
  });

  it('accepts the essay bank prompt handoff for its task and waits for the answer', () => {
    saveWritingDraft({ taskType: 'task1-general', prompt: 'You stayed at a hotel…', promptOnly: true });
    render({ lockedTaskType: 'task1-general' });
    expect(container.querySelector('#prompt').value).toBe('You stayed at a hotel…');
    expect(container.querySelector('#essay').value).toBe('');
    expect(container.querySelector('[data-testid="sign-in-dialog"]')).toBeNull();
  });

  it('scores as the locked task', async () => {
    testState.user = { id: 'u1' };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ overallBand: 7, free: false, criteria: {}, quotaRemaining: 3 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    saveWritingDraft({ taskType: 'task1-general', prompt: 'Complain to the hotel', essay: LETTER });
    await act(async () => {
      render({ lockedTaskType: 'task1-general', variant: 'general-training-letter' });
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.task).toBe(1);
    expect(body.prompt.startsWith('Task 1 — General Training')).toBe(true);
    // The draft persisted for the sign-in / billing round-trip carries the task.
    expect(JSON.parse(window.localStorage.getItem(DRAFT_KEY)).taskType).toBe('task1-general');
  });
});

describe('task page server render', () => {
  it('pre-renders exactly the three task pages', async () => {
    const { paths, fallback } = await getStaticPaths();
    expect(fallback).toBe(false);
    expect(paths.map((p) => p.params.task)).toEqual(['task-2', 'task-1', 'general-training-letter']);
    expect(await getStaticProps({ params: { task: 'nope' } })).toEqual({ notFound: true });
  });

  it('renders the guidance, samples, FAQ and one canonical in server HTML', async () => {
    const { props } = await getStaticProps({ params: { task: 'task-1' } });
    const html = renderToStaticMarkup(React.createElement(WritingCheckerTaskPage, props));
    expect(html).toContain('<h1');
    expect(html).toContain('IELTS Writing Task 1 Checker for Academic Reports');
    expect(html).toContain('What the checker evaluates in Academic Task 1 reports');
    expect(html).toContain('Task Achievement');
    expect(html).toContain('Common mistakes the checker flags');
    expect(html).toContain('href="/ielts-essay-bank/household-spending-pie-charts-band-7"');
    expect(html).toContain('href="/ielts-writing-checker/task-2"');
    expect(html).toContain('href="/ielts-writing-checker/general-training-letter"');
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html).toContain('href="https://www.ielts-bank.com/ielts-writing-checker/task-1"');
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    expect(blocks.map((b) => b['@type'])).toEqual(['WebApplication', 'FAQPage', 'BreadcrumbList']);
    // Every FAQ answer in the JSON-LD is visible on the page.
    for (const q of blocks[1].mainEntity) expect(html).toContain(q.name.replace(/'/g, '&#x27;'));
  });
});
