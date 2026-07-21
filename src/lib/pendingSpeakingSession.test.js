import { describe, expect, it, vi } from 'vitest';
import { getPendingSpeakingAccessToken } from './pendingSpeakingSession';

describe('getPendingSpeakingAccessToken', () => {
  it('returns the current linked-session token', async () => {
    const getClient = () => ({
      auth: {
        getSession: async () => ({
          data: { session: { access_token: 'saved-recording-token' } },
        }),
      },
    });

    await expect(getPendingSpeakingAccessToken(getClient)).resolves.toEqual({
      accessToken: 'saved-recording-token',
      error: null,
    });
  });

  it('keeps a verified missing session distinct from dependency failure', async () => {
    const getClient = () => ({
      auth: { getSession: async () => ({ data: { session: null } }) },
    });

    await expect(getPendingSpeakingAccessToken(getClient)).resolves.toEqual({
      accessToken: null,
      error: null,
    });
  });

  it('returns a retryable error when client creation or session lookup fails', async () => {
    const clientError = new Error('client unavailable');
    const resolvedError = new Error('resolved auth failure');
    const sessionError = new Error('auth dependency unavailable');

    await expect(
      getPendingSpeakingAccessToken(() => {
        throw clientError;
      })
    ).resolves.toEqual({ accessToken: null, error: clientError });

    const getResolvedErrorClient = () => ({
      auth: {
        getSession: async () => ({ data: { session: null }, error: resolvedError }),
      },
    });
    await expect(
      getPendingSpeakingAccessToken(getResolvedErrorClient)
    ).resolves.toEqual({ accessToken: null, error: resolvedError });

    const getClient = () => ({
      auth: { getSession: vi.fn().mockRejectedValue(sessionError) },
    });
    await expect(getPendingSpeakingAccessToken(getClient)).resolves.toEqual({
      accessToken: null,
      error: sessionError,
    });
  });
});
