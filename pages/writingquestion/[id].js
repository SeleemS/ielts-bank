import WritingQuestion from '../../src/pages/WritingQuestion';
import {
  SKILLS,
  getPassageSlugs,
  getStructuredPassage,
  getRelatedPractice,
  toMetaDescription,
} from '../../lib/supabase';
// Server-only (fs): used inside getStaticProps alone, so it never reaches the
// client bundle. ISR regeneration reads content/essays at request time, which
// is why next.config.js traces it into this route.
import { getEssaysForPractice } from '../../lib/essays';
import { canonicalQuestionRedirect, retiredDuplicateTarget } from '../../lib/questionUrls';
import { questionContextLinks } from '../../lib/siteDirectory';

export default WritingQuestion;

export async function getStaticPaths() {
  // Pre-render each passage's CANONICAL URL only: the clean slug (see
  // lib/questionUrls.js). Legacy Firestore-id URLs still resolve via
  // fallback: 'blocking' and permanently redirect to the slug.
  const slugs = await getPassageSlugs(SKILLS.writing);
  const ids = slugs.filter((slug) => !retiredDuplicateTarget('writing', slug));
  return {
    paths: ids.map((id) => ({ params: { id } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const passage = await getStructuredPassage(SKILLS.writing, params.id);
  if (!passage) return { notFound: true };
  const redirect = canonicalQuestionRedirect('writing', params.id, passage);
  if (redirect) return redirect;
  const related = await getRelatedPractice(SKILLS.writing, passage.slug);
  const sampleEssays = getEssaysForPractice(passage.slug)
    .map((e) => ({ slug: e.slug, band: e.band }))
    .sort((a, b) => a.band - b.band);

  return {
    props: {
      id: params.id,
      passage,
      description: toMetaDescription(passage.bodyHtml),
      related,
      sampleEssays,
      contextLinks: questionContextLinks('writing', passage),
    },
    revalidate: 3600,
  };
}
