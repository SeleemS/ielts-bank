import { describe, expect, it, vi } from 'vitest';
import {
  claimPendingSpeakingScore,
  getSpeakingAccessToken,
  releasePendingSpeakingScore,
  resolveSpeakingAuthAction,
} from './pendingSpeakingSession';

describe('getSpeakingAccessToken', () => {
  it('returns the current linked-session token', async () => {
    const getClient = () => ({
      auth: {
        getSession: async () => ({
          data: { session: { access_token: 'saved-recording-token' } },
        }),
      },
    });

    await expect(getSpeakingAccessToken(getClient)).resolves.toEqual({
      accessToken: 'saved-recording-token',
      error: null,
    });
  });

  it('keeps a verified missing session distinct from dependency failure', async () => {
    const getClient = () => ({
      auth: { getSession: async () => ({ data: { session: null } }) },
    });

    await expect(getSpeakingAccessToken(getClient)).resolves.toEqual({
      accessToken: null,
      error: null,
    });
  });

  it('returns a retryable error when client creation or session lookup fails', async () => {
    const clientError = new Error('client unavailable');
    const resolvedError = new Error('resolved auth failure');
    const sessionError = new Error('auth dependency unavailable');

    await expect(
      getSpeakingAccessToken(() => {
        throw clientError;
      })
    ).resolves.toEqual({ accessToken: null, error: clientError });

    const getResolvedErrorClient = () => ({
      auth: {
        getSession: async () => ({ data: { session: null }, error: resolvedError }),
      },
    });
    await expect(
      getSpeakingAccessToken(getResolvedErrorClient)
    ).resolves.toEqual({ accessToken: null, error: resolvedError });

    const getClient = () => ({
      auth: { getSession: vi.fn().mockRejectedValue(sessionError) },
    });
    await expect(getSpeakingAccessToken(getClient)).resolves.toEqual({
      accessToken: null,
      error: sessionError,
    });
  });
});

describe('resolveSpeakingAuthAction', () => {
  it('returns authorized headers only for a verified token', async () => {
    const getClient = () => ({
      auth: {
        getSession: async () => ({
          data: { session: { access_token: 'examiner-token' } },
          error: null,
        }),
      },
    });

    await expect(resolveSpeakingAuthAction(getClient)).resolves.toEqual({
      state: 'authorized',
      headers: { Authorization: 'Bearer examiner-token' },
    });
  });

  it('returns sign_in only for a verified missing session', async () => {
    const getClient = () => ({
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
      },
    });

    await expect(resolveSpeakingAuthAction(getClient)).resolves.toEqual({
      state: 'sign_in',
      headers: null,
    });
  });

  it.each([
    ['resolved', false],
    ['rejected', true],
  ])('returns retry for a %s auth failure', async (_failureType, rejectSession) => {
    const sessionError = new Error('temporary auth outage');
    const getClient = () => ({
      auth: {
        getSession: async () => {
          if (rejectSession) throw sessionError;
          return { data: { session: null }, error: sessionError };
        },
      },
    });

    await expect(resolveSpeakingAuthAction(getClient)).resolves.toEqual({
      state: 'retry',
      headers: null,
    });
  });
});

describe('pending Speaking score single-flight lock', () => {
  it('allows one submission until the active attempt releases', () => {
    const lock = { current: false };

    expect(claimPendingSpeakingScore(lock)).toBe(true);
    expect(claimPendingSpeakingScore(lock)).toBe(false);

    releasePendingSpeakingScore(lock);
    expect(claimPendingSpeakingScore(lock)).toBe(true);
  });
});
