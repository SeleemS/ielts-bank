import ListeningQuestion from '../../src/pages/ListeningQuestion';
import {
  SKILLS,
  getLegacyIdSlugMap,
  getPassageSlugs,
  getStructuredPassage,
  toMetaDescription,
} from '../../lib/supabase';

export default ListeningQuestion;

export async function getStaticPaths() {
  // Pre-render BOTH legacy Firestore ids and new slugs; others on demand.
  const [legacyMap, slugs] = await Promise.all([
    getLegacyIdSlugMap(SKILLS.listening),
    getPassageSlugs(SKILLS.listening),
  ]);
  const ids = Array.from(new Set([...Object.keys(legacyMap), ...slugs]));
  return {
    paths: ids.map((id) => ({ params: { id } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const passage = await getStructuredPassage(SKILLS.listening, params.id);
  if (!passage) return { notFound: true };

  const description =
    toMetaDescription(passage.bodyHtml) ||
    `Practise IELTS Listening with "${passage.title}". Listen to the audio and answer the questions.`;

  return {
    props: {
      id: params.id,
      passage,
      description,
    },
    revalidate: 3600,
  };
}
