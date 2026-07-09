import WritingQuestion from '../../src/pages/WritingQuestion';
import {
  SKILLS,
  getLegacyIdSlugMap,
  getPassageBySlug,
  toMetaDescription,
} from '../../lib/supabase';

export default WritingQuestion;

export async function getStaticPaths() {
  // Emit the SAME legacy Firestore ids used as URLs today (some contain spaces,
  // e.g. "Agricultural Advancement") so SEO-indexed URLs keep resolving.
  const legacyMap = await getLegacyIdSlugMap(SKILLS.writing);
  const ids = Object.keys(legacyMap);
  return {
    paths: ids.map((id) => ({ params: { id } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  // getPassageBySlug accepts either a slug or a legacy Firestore id.
  const passage = await getPassageBySlug(SKILLS.writing, params.id);
  if (!passage) return { notFound: true };

  return {
    props: {
      id: params.id,
      passage,
      description: toMetaDescription(passage.passageText),
    },
    revalidate: 3600,
  };
}
