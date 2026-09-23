// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const state = vi.hoisted(() => ({
  authLoading: false,
  planLoading: false,
  isPremium: false,
}));

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ user: null, loading: state.authLoading }),
}));
vi.mock('../../lib/usePlan', () => ({
  usePlan: () => ({ loading: state.planLoading, isPremium: state.isPremium }),
}));
vi.mock('../../lib/analytics', () => ({ track: vi.fn() }));

import TutorCta, { TUTOR_CAP_KEY } from './TutorCta';
import ScoreNextSteps from './ScoreNextSteps';
import CambridgeBooksBox from './CambridgeBooksBox';
import { track } from '../../lib/analytics';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
const originalEnabled = process.env.AFFILIATE_PROGRAMS_ENABLED;
const ALL = 'preply,italki,wise,amber,insubuy,leverage-edu,amazon-cambridge-books';

async function render(element) {
  await act(async () => {
    root.render(element);
    await Promise.resolve();
  });
}

function at(path, country = null) {
  window.history.replaceState({}, '', path);
  document.cookie = country ? `ib_country=${country}; path=/` : 'ib_country=; max-age=0; path=/';
}

function links() {
  return [...container.querySelectorAll('a')];
}

beforeEach(() => {
  state.authLoading = false;
  state.planLoading = false;
  state.isPremium = false;
  process.env.AFFILIATE_PROGRAMS_ENABLED = ALL;
  window.localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  if (originalEnabled === undefined) delete process.env.AFFILIATE_PROGRAMS_ENABLED;
  else process.env.AFFILIATE_PROGRAMS_ENABLED = originalEnabled;
  at('/');
  vi.clearAllMocks();
});

describe('TutorCta (writing/speaking result)', () => {
  it('renders a sponsored /go link with disclosure for a free user below 6.5', async () => {
    at('/writingquestion/abc');
    await render(<TutorCta skill="writing" band={6} placement="writing_result" />);
    const [link] = links();
    expect(link.getAttribute('href')).toBe('/go/preply?placement=writing_result');
    expect(link.getAttribute('rel')).toBe('sponsored nofollow noopener');
    expect(container.textContent).toContain('We may earn a commission');
    act(() => link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    expect(track).toHaveBeenCalledWith(
      'affiliate_click',
      expect.objectContaining({ program: 'preply', placement: 'writing_result', page: '/writingquestion/abc', band: 6 })
    );
  });

  it('uses the speaking copy and falls back to italki when Preply is not configured', async () => {
    process.env.AFFILIATE_PROGRAMS_ENABLED = 'italki';
    at('/speakingquestion/xyz');
    await render(<TutorCta skill="speaking" band={5.5} placement="speaking_result" />);
    expect(container.textContent).toContain('Practise speaking with a human tutor');
    expect(links()[0].getAttribute('href')).toBe('/go/italki?placement=speaking_result');
  });

  it('renders nothing when no tutor program is configured', async () => {
    process.env.AFFILIATE_PROGRAMS_ENABLED = 'wise';
    at('/writingquestion/abc');
    await render(<TutorCta skill="writing" band={5} placement="writing_result" />);
    expect(container.innerHTML).toBe('');
    delete process.env.AFFILIATE_PROGRAMS_ENABLED;
    await render(<TutorCta skill="writing" band={5} placement="writing_result" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for Pro users, or while auth/plan are still loading', async () => {
    at('/writingquestion/abc');
    state.isPremium = true;
    await render(<TutorCta skill="writing" band={5} placement="writing_result" />);
    expect(container.innerHTML).toBe('');
    state.isPremium = false;
    state.authLoading = true;
    await render(<TutorCta skill="writing" band={5} placement="writing_result" />);
    expect(container.innerHTML).toBe('');
    state.authLoading = false;
    state.planLoading = true;
    await render(<TutorCta skill="writing" band={5} placement="writing_result" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing at band 6.5+ or without a band', async () => {
    at('/writingquestion/abc');
    await render(<TutorCta skill="writing" band={6.5} placement="writing_result" />);
    expect(container.innerHTML).toBe('');
    await render(<TutorCta skill="writing" band={null} placement="writing_result" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing off its allowlisted surface (e.g. the writing checker)', async () => {
    at('/ielts-writing-checker');
    await render(<TutorCta skill="writing" band={5} placement="writing_result" />);
    expect(container.innerHTML).toBe('');
  });

  it('shows at most once per 7 days', async () => {
    at('/writingquestion/abc');
    window.localStorage.setItem(TUTOR_CAP_KEY, String(Date.now() - 60 * 60 * 1000));
    await render(<TutorCta skill="writing" band={5} placement="writing_result" />);
    expect(container.innerHTML).toBe('');
  });
});

describe('ScoreNextSteps (/ielts-score-requirements/<country>)', () => {
  it('shows Wise, Amber and Insubuy on the US page for a non-Indian visitor', async () => {
    at('/ielts-score-requirements/united-states', 'SG');
    await render(<ScoreNextSteps countrySlug="united-states" shortName="the US" />);
    expect(links().map((a) => a.dataset.affiliate)).toEqual(['wise', 'amber', 'insubuy']);
    for (const a of links()) expect(a.getAttribute('rel')).toBe('sponsored nofollow noopener');
    expect(container.textContent).toContain('We may earn a commission');
  });

  it('shows Leverage Edu only to visitors geolocated to India', async () => {
    at('/ielts-score-requirements/united-kingdom', 'IN');
    await render(<ScoreNextSteps countrySlug="united-kingdom" shortName="the UK" />);
    expect(links().map((a) => a.dataset.affiliate)).toEqual(['leverage-edu', 'wise', 'amber']);
  });

  it('renders nothing when disabled, for Pro users, or off the country pages', async () => {
    at('/ielts-score-requirements/united-kingdom', 'IN');
    process.env.AFFILIATE_PROGRAMS_ENABLED = '';
    await render(<ScoreNextSteps countrySlug="united-kingdom" shortName="the UK" />);
    expect(container.innerHTML).toBe('');

    process.env.AFFILIATE_PROGRAMS_ENABLED = ALL;
    state.isPremium = true;
    await render(<ScoreNextSteps countrySlug="united-kingdom" shortName="the UK" />);
    expect(container.innerHTML).toBe('');
  });

  it('never renders on pricing', async () => {
    at('/pricing', 'IN');
    await render(<ScoreNextSteps countrySlug="united-kingdom" shortName="the UK" />);
    expect(container.innerHTML).toBe('');
  });
});

describe('CambridgeBooksBox (blog)', () => {
  const studyPlan = { slug: 'ielts-30-day-study-plan', tags: [] };

  it('renders on a matching post with Amazon’s disclosure', async () => {
    at('/blog/ielts-30-day-study-plan');
    await render(<CambridgeBooksBox post={studyPlan} />);
    expect(links()[0].getAttribute('href')).toBe('/go/amazon-cambridge-books?placement=blog_books');
    expect(container.textContent).toContain('As an Amazon Associate we earn from qualifying purchases.');
  });

  it('renders nothing on unrelated posts, when disabled, or for Pro users', async () => {
    at('/blog/ielts-listening-maps');
    await render(<CambridgeBooksBox post={{ slug: 'ielts-listening-maps', tags: ['listening'] }} />);
    expect(container.innerHTML).toBe('');

    at('/blog/ielts-30-day-study-plan');
    process.env.AFFILIATE_PROGRAMS_ENABLED = 'wise';
    await render(<CambridgeBooksBox post={studyPlan} />);
    expect(container.innerHTML).toBe('');

    process.env.AFFILIATE_PROGRAMS_ENABLED = ALL;
    state.isPremium = true;
    await render(<CambridgeBooksBox post={studyPlan} />);
    expect(container.innerHTML).toBe('');
  });
});
