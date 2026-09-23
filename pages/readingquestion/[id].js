import ReadingQuestion from '../../src/pages/ReadingQuestion';
import {
  SKILLS,
  getPassageSlugs,
  getStructuredPassage,
  getRelatedPractice,
  toMetaDescription,
} from '../../lib/supabase';
import { canonicalQuestionRedirect, retiredDuplicateTarget } from '../../lib/questionUrls';

export default ReadingQuestion;

export async function getStaticPaths() {
  // Pre-render each passage's CANONICAL URL only: the clean slug (see
  // lib/questionUrls.js). Legacy Firestore-id URLs still resolve via
  // fallback: 'blocking' and permanently redirect to the slug.
  const slugs = await getPassageSlugs(SKILLS.reading);
  const ids = slugs.filter((slug) => !retiredDuplicateTarget('reading', slug));
  return {
    paths: ids.map((id) => ({ params: { id } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  // getStructuredPassage accepts either a slug or a legacy Firestore id.
  const passage = await getStructuredPassage(SKILLS.reading, params.id);
  if (!passage) return { notFound: true };
  const redirect = canonicalQuestionRedirect('reading', params.id, passage);
  if (redirect) return redirect;
  const related = await getRelatedPractice(
    SKILLS.reading,
    passage.slug,
    passage.groups?.[0]?.questionType
  );

  return {
    props: {
      id: params.id,
      passage,
      description: toMetaDescription(passage.bodyHtml),
      related,
    },
    revalidate: 3600,
  };
}
