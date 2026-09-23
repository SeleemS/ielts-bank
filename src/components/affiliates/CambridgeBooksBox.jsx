import * as React from 'react';
import { ArrowUpRight, BookOpen } from 'lucide-react';
import { affiliateAvailable, postWantsBooksModule } from '../../../lib/affiliates';
import AffiliateLink, {
  AffiliateDisclosure,
  useAffiliateEligibility,
  useAffiliateImpression,
} from './AffiliateLink';

const PROGRAM = 'amazon-cambridge-books';
const PLACEMENT = 'blog_books';

// Small Cambridge IELTS books module for blog posts about study plans or prep
// resources (postWantsBooksModule). One box per post, below the article — never
// above the fold. Cambridge's books are official practice material we don't
// publish; the copy must never imply we are affiliated with Cambridge.
export default function CambridgeBooksBox({ post }) {
  const wanted = postWantsBooksModule(post);
  const { eligible, country, path } = useAffiliateEligibility(PLACEMENT);
  const available = wanted && eligible && affiliateAvailable(PROGRAM, { country });
  useAffiliateImpression(available ? [PROGRAM] : [], PLACEMENT, path);
  if (!available) return null;

  return (
    <aside
      aria-label="Recommended books"
      className="mt-8 rounded-xl border border-border bg-card p-5 shadow-sm"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <BookOpen className="h-4 w-4 text-accent" aria-hidden="true" />
        Want printed practice tests too?
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Cambridge University Press publishes the Cambridge IELTS series of practice test books,
        with full tests, answer keys and listening audio. They pair well with timed practice here.
      </p>
      <AffiliateLink
        program={PROGRAM}
        placement={PLACEMENT}
        page={path}
        eventProps={{ slug: post?.slug }}
        className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent no-underline hover:text-accent/80"
      >
        See Cambridge IELTS books on Amazon
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      </AffiliateLink>
      <AffiliateDisclosure programs={[PROGRAM]} className="mt-2" />
    </aside>
  );
}
