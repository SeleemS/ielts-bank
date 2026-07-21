import { describe, expect, it } from 'vitest';
import { getSessionAccess } from './sessionAccess';

describe('getSessionAccess', () => {
  it('returns the current access token', async () => {
    const getClient = () => ({
      auth: {
        getSession: async () => ({
          data: { session: { access_token: 'linked-token' } },
          error: null,
        }),
      },
    });

    await expect(getSessionAccess(getClient)).resolves.toEqual({
      accessToken: 'linked-token',
      error: null,
    });
  });

  it('keeps a verified missing session distinct from an auth error', async () => {
    const getClient = () => ({
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
      },
    });

    await expect(getSessionAccess(getClient)).resolves.toEqual({
      accessToken: null,
      error: null,
    });
  });

  it('returns client, resolved, and rejected auth failures as retryable errors', async () => {
    const clientError = new Error('client unavailable');
    const resolvedError = new Error('resolved auth outage');
    const rejectedError = new Error('rejected auth outage');
    const getResolvedErrorClient = () => ({
      auth: {
        getSession: async () => ({ data: { session: null }, error: resolvedError }),
      },
    });
    const getRejectedClient = () => ({
      auth: { getSession: async () => Promise.reject(rejectedError) },
    });

    await expect(
      getSessionAccess(() => {
        throw clientError;
      })
    ).resolves.toEqual({
      accessToken: null,
      error: clientError,
    });
    await expect(getSessionAccess(getResolvedErrorClient)).resolves.toEqual({
      accessToken: null,
      error: resolvedError,
    });
    await expect(getSessionAccess(getRejectedClient)).resolves.toEqual({
      accessToken: null,
      error: rejectedError,
    });
  });
});
