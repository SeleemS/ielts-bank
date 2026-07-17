import WritingQuestion from '../../src/pages/WritingQuestion';
import {
  SKILLS,
  getLegacyIdSlugMap,
  getPassageSlugs,
  getStructuredPassage,
  getRelatedPractice,
  toMetaDescription,
} from '../../lib/supabase';

export default WritingQuestion;

export async function getStaticPaths() {
  // Pre-render BOTH legacy Firestore ids (some contain spaces) and new slugs.
  const [legacyMap, slugs] = await Promise.all([
    getLegacyIdSlugMap(SKILLS.writing),
    getPassageSlugs(SKILLS.writing),
  ]);
  const ids = Array.from(new Set([...Object.keys(legacyMap), ...slugs]));
  return {
    paths: ids.map((id) => ({ params: { id } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const passage = await getStructuredPassage(SKILLS.writing, params.id);
  if (!passage) return { notFound: true };
  const related = await getRelatedPractice(SKILLS.writing, passage.slug);

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
