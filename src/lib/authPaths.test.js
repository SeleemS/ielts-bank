import { describe, expect, it } from 'vitest';
import { buildAuthCallbackUrl, POST_AUTH_PATH } from './authPaths';

describe('auth destinations', () => {
  it('uses the dashboard as the single post-auth landing page', () => {
    expect(POST_AUTH_PATH).toBe('/dashboard');
  });

  it('builds an auth callback without a caller-controlled return path', () => {
    expect(buildAuthCallbackUrl('https://ielts-bank.com')).toBe(
      'https://ielts-bank.com/auth/callback'
    );
    expect(buildAuthCallbackUrl('https://ielts-bank.com/')).toBe(
      'https://ielts-bank.com/auth/callback'
    );
    expect(buildAuthCallbackUrl()).toBe('/auth/callback');
  });
});
