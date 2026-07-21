// Resolve a browser Supabase session without collapsing a dependency failure
// into a verified signed-out state. Callers can show sign-in only when both the
// token and error are absent; errors should keep the current user work intact.
export async function getSessionAccess(getClient) {
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
