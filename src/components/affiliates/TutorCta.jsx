import * as React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { firstAvailableAffiliate, getAffiliateProgram } from '../../../lib/affiliates';
import AffiliateLink, {
  AffiliateDisclosure,
  useAffiliateEligibility,
  useAffiliateImpression,
} from './AffiliateLink';

export const TUTOR_BAND_CEILING = 6.5;
export const TUTOR_PROGRAMS = ['preply', 'italki'];
export const TUTOR_CAP_KEY = 'ib_aff_tutor_last';
export const TUTOR_CAP_MS = 7 * 24 * 60 * 60 * 1000;

// Frequency cap: the card shows at most once per 7 days per browser. Decided
// once per mount (the ref survives React's dev double-effect), so the card
// that is showing never vanishes mid-read. Storage failure → show.
function useWeeklyCap(active) {
  const [allowed, setAllowed] = React.useState(null);
  const decided = React.useRef(false);
  React.useEffect(() => {
    if (!active || decided.current) return;
    decided.current = true;
    const now = Date.now();
    try {
      const last = Number(window.localStorage.getItem(TUTOR_CAP_KEY));
      if (Number.isFinite(last) && last > 0 && now - last < TUTOR_CAP_MS) {
        setAllowed(false);
        return;
      }
      window.localStorage.setItem(TUTOR_CAP_KEY, String(now));
    } catch {
      /* storage blocked: fall through and show */
    }
    setAllowed(true);
  }, [active]);
  return allowed === true;
}

// Human-tutor referral on the free writing/speaking score report. Placement
// rule (20-MONETIZATION-PLAN §3): free users only, overall band below 6.5,
// rendered by the report BELOW the Pro offer — never above the band or in
// place of the upgrade. One text card, no image.
export default function TutorCta({ skill, band, placement }) {
  const { eligible, country, path } = useAffiliateEligibility(placement);
  const lowBand = typeof band === 'number' && band < TUTOR_BAND_CEILING;
  const program = eligible && lowBand ? firstAvailableAffiliate(TUTOR_PROGRAMS, { country }) : null;
  const shown = useWeeklyCap(Boolean(program));
  useAffiliateImpression(shown && program ? [program] : [], placement, path);
  if (!program || !shown) return null;

  const label = getAffiliateProgram(program).label;
  const speaking = skill === 'speaking';
  return (
    <aside
      aria-label="Tutor recommendation"
      className="rounded-lg border border-border bg-card p-4"
    >
      <h3 className="text-sm font-bold text-foreground">
        {speaking ? 'Practise speaking with a human tutor' : 'Practise with a human IELTS tutor'}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {speaking
          ? 'Stuck below 6.5? Live conversation with a tutor builds the fluency that Parts 1–3 reward.'
          : 'Stuck below 6.5? A 30-minute lesson with an IELTS tutor can work through Task Response and structure with you.'}
      </p>
      <AffiliateLink
        program={program}
        placement={placement}
        page={path}
        eventProps={{ skill, band }}
        className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent no-underline hover:text-accent/80"
      >
        Find an IELTS tutor on {label}
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      </AffiliateLink>
      <AffiliateDisclosure programs={[program]} className="mt-2" />
    </aside>
  );
}
