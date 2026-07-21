// Resolve the current access token for the saved-recording return journey.
// Keep dependency rejection distinct from a verified missing session: the
// former is a retryable outage, while the latter should reopen sign-in.
export async function getPendingSpeakingAccessToken(getClient) {
  try {
    const { data, error } = await getClient().auth.getSession();
    if (error) return { accessToken: null, error };
    return {
      accessToken: data?.session?.access_token || null,
      error: null,
    };
  } catch (error) {
    return { accessToken: null, error };
  }
}

export function claimPendingSpeakingScore(lock) {
  if (!lock || lock.current) return false;
  lock.current = true;
  return true;
}

export function releasePendingSpeakingScore(lock) {
  if (lock) lock.current = false;
}
