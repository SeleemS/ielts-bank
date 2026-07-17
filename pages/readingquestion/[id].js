import ReadingQuestion from '../../src/pages/ReadingQuestion';
import {
  SKILLS,
  getLegacyIdSlugMap,
  getPassageSlugs,
  getStructuredPassage,
  getRelatedPractice,
  toMetaDescription,
} from '../../lib/supabase';

export default ReadingQuestion;

export async function getStaticPaths() {
  // Pre-render BOTH the legacy Firestore ids (SEO-indexed URLs) and the new
  // slugs. Anything not listed is rendered on demand via fallback: 'blocking'.
  const [legacyMap, slugs] = await Promise.all([
    getLegacyIdSlugMap(SKILLS.reading),
    getPassageSlugs(SKILLS.reading),
  ]);
  const ids = Array.from(new Set([...Object.keys(legacyMap), ...slugs]));
  return {
    paths: ids.map((id) => ({ params: { id } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  // getStructuredPassage accepts either a slug or a legacy Firestore id.
  const passage = await getStructuredPassage(SKILLS.reading, params.id);
  if (!passage) return { notFound: true };
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
