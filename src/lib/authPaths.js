export const POST_AUTH_PATH = '/dashboard';

export function buildAuthCallbackUrl(origin = '') {
  const normalizedOrigin = typeof origin === 'string' ? origin.replace(/\/$/, '') : '';
  return `${normalizedOrigin}/auth/callback`;
}
