// pages/go/[program].js
//
// /go/<program> → 302 to the affiliate URL configured in AFFILIATE_URL_<ID>
// (lib/affiliates.js). Unknown or unconfigured programs 404, so nothing points
// anywhere until the founder adds a real URL. Pages only ever link here (with
// rel="sponsored nofollow noopener"), which keeps affiliate URLs out of page
// HTML and lets a program be swapped without a code change.
//
// Click analytics: the placement fires a first-party `affiliate_click` event via
// track() before the browser follows the link (the existing consent-gated
// pipeline, keepalive fetch). This route only writes a PII-free log line as a
// consent-independent backstop for verifying redirects in Vercel logs.
//
// Crawlers: disallowed in public/robots.txt and sent X-Robots-Tag: noindex.

import { affiliateDestination, getAffiliateProgram } from '../../lib/affiliates';

const NOINDEX = 'noindex, nofollow';
const PLACEMENT_RE = /^[a-z][a-z0-9_]{0,63}$/;

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

export async function getServerSideProps({ params, query, res }) {
  res.setHeader('X-Robots-Tag', NOINDEX);
  res.setHeader('Cache-Control', 'private, no-store');

  const id = String(firstValue(params?.program) || '');
  const program = getAffiliateProgram(id);
  const destination = program ? affiliateDestination(program.id) : null;
  if (!destination) return { notFound: true };

  const placement = String(firstValue(query?.placement) || '');
  console.info(
    'affiliate_redirect',
    JSON.stringify({ program: program.id, placement: PLACEMENT_RE.test(placement) ? placement : null })
  );

  return {
    redirect: {
      destination,
      statusCode: 302,
    },
  };
}

// Never rendered: getServerSideProps always redirects or 404s.
export default function AffiliateRedirect() {
  return null;
}
