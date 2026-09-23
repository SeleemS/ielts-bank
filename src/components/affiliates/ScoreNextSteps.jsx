import * as React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { nextStepsPrograms } from '../../../lib/affiliates';
import AffiliateLink, {
  AffiliateDisclosure,
  useAffiliateEligibility,
  useAffiliateImpression,
} from './AffiliateLink';

const PLACEMENT = 'score_requirements';

function copyFor(id, shortName) {
  switch (id) {
    case 'wise':
      return {
        title: 'Pay tuition deposits and visa fees from abroad',
        body: 'Send money internationally with Wise and see the exchange rate and fee before you pay.',
        cta: 'Compare a transfer on Wise',
      };
    case 'amber':
      return {
        title: `Find student housing in ${shortName}`,
        body: 'Compare student rooms and flats near your university on Amber.',
        cta: 'Browse student housing on Amber',
      };
    case 'insubuy':
      return {
        title: 'Compare US student health insurance',
        body: 'Many US universities require international students to hold health insurance. Compare plans before you enrol.',
        cta: 'Compare plans on Insubuy',
      };
    case 'leverage-edu':
      return {
        title: 'Get help with your study-abroad application',
        body: 'Leverage Edu offers application guidance for students in India applying to universities abroad.',
        cta: 'Talk to Leverage Edu',
      };
    default:
      return null;
  }
}

// "Next steps after your score" on /ielts-score-requirements/<country>. Sits
// AFTER the sourced tables and the estimator/calculator CTAs (which feed Pro),
// before the FAQ. At most 3 links (nextStepsPrograms), all via /go/.
export default function ScoreNextSteps({ countrySlug, shortName }) {
  const { eligible, country, path } = useAffiliateEligibility(PLACEMENT);
  const programs = eligible ? nextStepsPrograms(countrySlug, { country }) : [];
  useAffiliateImpression(programs, PLACEMENT, path);
  if (!programs.length) return null;

  return (
    <section
      aria-labelledby="next-steps-heading"
      className="mb-12 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6"
    >
      <h2 id="next-steps-heading" className="text-xl font-bold tracking-tight text-foreground">
        Next steps after your score
      </h2>
      <ul className="mt-4 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {programs.map((id) => {
          const copy = copyFor(id, shortName);
          if (!copy) return null;
          return (
            <li key={id} className="rounded-lg border border-border/70 bg-secondary/20 p-4">
              <p className="text-sm font-semibold text-foreground">{copy.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
              <AffiliateLink
                program={id}
                placement={PLACEMENT}
                page={path}
                eventProps={{ destination: countrySlug }}
                className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent no-underline hover:text-accent/80"
              >
                {copy.cta}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </AffiliateLink>
            </li>
          );
        })}
      </ul>
      <AffiliateDisclosure programs={programs} className="mt-4" />
    </section>
  );
}
