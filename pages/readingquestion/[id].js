import ReadingQuestion from '../../src/pages/ReadingQuestion';
import {
  SKILLS,
  getLegacyIdSlugMap,
  getPassageBySlug,
  toMetaDescription,
} from '../../lib/supabase';

export default ReadingQuestion;

export async function getStaticPaths() {
  // Emit the SAME legacy Firestore ids used as URLs today (SEO-indexed).
  const legacyMap = await getLegacyIdSlugMap(SKILLS.reading);
  const ids = Object.keys(legacyMap);
  return {
    paths: ids.map((id) => ({ params: { id } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  // getPassageBySlug accepts either a slug or a legacy Firestore id.
  const passage = await getPassageBySlug(SKILLS.reading, params.id);
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
