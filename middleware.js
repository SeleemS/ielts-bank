// middleware.js
// Geo-aware consent default. EU/EEA/UK/Switzerland visitors get opt-in
// (analytics/ads denied until they accept); other known countries get opt-out
// (tracked until they opt out). Missing or malformed geo data fails closed.
//
// Most pages are statically generated, so _document.js alone can't see the
// visitor's country. This edge middleware resolves it per request from Vercel's
// geo header and stashes the resulting default in a readable cookie that the
// pre-tag consent script (pages/_document.js) reads BEFORE any analytics/ads
// load. Global Privacy Control and an explicit banner choice still override it.
import { NextResponse } from 'next/server';
import { consentDefaultForCountry } from './src/lib/consentRegions';

const COOKIE = 'ib_consent_default';

export function middleware(request) {
  const country = request.headers.get('x-vercel-ip-country');
  const value = consentDefaultForCountry(country);
  // Only write when it changed, so unchanged responses stay CDN-cacheable.
  if (request.cookies.get(COOKIE)?.value === value) return NextResponse.next();
  const res = NextResponse.next();
  res.cookies.set(COOKIE, value, {
    path: '/',
    httpOnly: false, // the pre-tag consent script reads this client-side
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 180,
  });
  return res;
}

export const config = {
  // Page routes only — skip API, Next internals, the GA proxy, and any file.
  matcher: ['/((?!api|_next|gt|.*\\..*).*)'],
};
