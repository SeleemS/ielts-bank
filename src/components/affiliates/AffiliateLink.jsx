import * as React from 'react';
import { useAuth } from '../../lib/auth';
import { usePlan } from '../../lib/usePlan';
import { track } from '../../lib/analytics';
import {
  AFFILIATE_REL,
  affiliateHref,
  countryFromCookie,
  getAffiliateProgram,
  placementAllowedOnPath,
} from '../../../lib/affiliates';

// Shared gate for every affiliate placement. Renders nothing until the client
// has confirmed: the page is on the placement's allowlist, auth AND plan have
// resolved (a Pro user must never see even a flash of an affiliate unit), and
// the viewer is not Pro. Nothing renders during SSR, so affiliate links are not
// in crawler HTML either.
export function useAffiliateEligibility(placement) {
  const { loading: authLoading } = useAuth();
  const { loading: planLoading, isPremium } = usePlan();
  const [client, setClient] = React.useState(null);
  React.useEffect(() => {
    setClient({
      country: countryFromCookie(document.cookie),
      path: window.location.pathname,
    });
  }, []);
  const eligible =
    Boolean(client) &&
    !authLoading &&
    !planLoading &&
    !isPremium &&
    placementAllowedOnPath(placement, client.path);
  return { eligible, country: client?.country || null, path: client?.path || '' };
}

// One impression event per mounted unit, so CTR by placement is measurable.
export function useAffiliateImpression(programs, placement, page) {
  const sent = React.useRef(false);
  const key = programs.join(',');
  React.useEffect(() => {
    if (!key || sent.current) return;
    sent.current = true;
    track('affiliate_impression', { programs: key, placement, page });
  }, [key, placement, page]);
}

// Every affiliate link goes through /go/<id> with rel="sponsored nofollow
// noopener" and fires a first-party affiliate_click (keepalive beacon, so it
// survives the navigation) before the browser follows it.
export default function AffiliateLink({ program, placement, page, eventProps, className, children }) {
  if (!getAffiliateProgram(program)) return null;
  return (
    <a
      href={affiliateHref(program, placement)}
      rel={AFFILIATE_REL}
      target="_blank"
      className={className}
      data-affiliate={program}
      onClick={() => track('affiliate_click', { program, placement, page, ...(eventProps || {}) })}
    >
      {children}
    </a>
  );
}

export function AffiliateDisclosure({ programs, className = '' }) {
  const lines = [...new Set(programs.map((id) => getAffiliateProgram(id)?.disclosure).filter(Boolean))];
  if (!lines.length) return null;
  return (
    <p className={`text-xs leading-relaxed text-muted-foreground ${className}`}>
      {lines.join(' ')}
    </p>
  );
}
