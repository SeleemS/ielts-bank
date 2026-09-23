// Visitor market for upgrade surfaces on statically generated pages.
// The country comes from the middleware's ib_country cookie (display-only:
// checkout re-resolves geography server-side from x-vercel-ip-country, so a
// tampered cookie can only change emphasis, never the price charged).
import * as React from 'react';
import { isPassFirstMarket, isPppCountry } from '../../lib/billing';

export function readCountryCookie() {
  if (typeof document === 'undefined') return '';
  return document.cookie.match(/(?:^|;\s*)ib_country=([A-Z]{2})/)?.[1] || '';
}

export function marketForCountry(country) {
  return {
    country: country || '',
    ppp: isPppCountry(country),
    passFirst: isPassFirstMarket(country),
  };
}

// First render is the standard market (matches the static HTML); the cookie is
// read after hydration. `ready` flips once it has been read.
export function useVisitorMarket() {
  const [country, setCountry] = React.useState('');
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    setCountry(readCountryCookie());
    setReady(true);
  }, []);
  return { ...marketForCountry(country), ready };
}
