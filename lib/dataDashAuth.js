// Shared-password session auth for the private /data analytics dashboard.
//
// POST /api/data/login checks the password against DATA_DASHBOARD_PASSWORD and
// sets an httpOnly cookie holding `<expiresMs>.<hmac(expiresMs)>`, keyed off
// the password itself — so rotating the password invalidates every session.
// No user identity is involved; this guards an internal read-only page.

import crypto from 'crypto';

export const DATA_SESSION_COOKIE = 'ib_data_session';
const SESSION_DAYS = 30;

function password() {
  return process.env.DATA_DASHBOARD_PASSWORD || '';
}

function sign(value) {
  return crypto
    .createHmac('sha256', `ielts-data-dash:${password()}`)
    .update(String(value))
    .digest('hex');
}

function timingSafeEq(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function dashConfigured() {
  return password().length > 0;
}

export function passwordMatches(candidate) {
  if (!dashConfigured() || typeof candidate !== 'string' || !candidate) return false;
  // Hash both sides so timingSafeEqual gets equal-length inputs.
  const hash = (value) => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(hash(candidate), hash(password()));
}

export function issueToken(now = Date.now()) {
  const expires = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${expires}.${sign(expires)}`;
}

export function tokenValid(token, now = Date.now()) {
  if (!dashConfigured() || typeof token !== 'string') return false;
  const [expiresRaw, signature] = token.split('.');
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires <= now || !signature) return false;
  return timingSafeEq(signature, sign(expires));
}

export function readSessionToken(req) {
  const header = req.headers?.cookie;
  const cookie = Array.isArray(header) ? header.join(';') : header || '';
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === DATA_SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function requestAuthorized(req) {
  return tokenValid(readSessionToken(req));
}

export function sessionCookie(token, maxAgeSeconds = SESSION_DAYS * 24 * 60 * 60) {
  const parts = [
    `${DATA_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie() {
  return sessionCookie('', 0);
}

// Every /api/data response is private and must never be indexed or cached.
export function setPrivateHeaders(res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Cache-Control', 'private, no-store');
}
