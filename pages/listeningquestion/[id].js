import ListeningQuestion from '../../src/pages/ListeningQuestion';
import {
  SKILLS,
  getLegacyIdSlugMap,
  getPassageBySlug,
  toMetaDescription,
} from '../../lib/supabase';

export default ListeningQuestion;

export async function getStaticPaths() {
  // Emit the SAME legacy Firestore ids used as URLs today (SEO-indexed).
  const legacyMap = await getLegacyIdSlugMap(SKILLS.listening);
  const ids = Object.keys(legacyMap);
  return {
    paths: ids.map((id) => ({ params: { id } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  // getPassageBySlug accepts either a slug or a legacy Firestore id.
  const passage = await getPassageBySlug(SKILLS.listening, params.id);
  if (!passage) return { notFound: true };

  // Listening passages describe an audio clip; fall back to a generic
  // description when there is no text content to derive one from.
  const description =
    toMetaDescription(passage.passageText) ||
    `Practise IELTS Listening with "${passage.passageTitle}". Listen to the audio and answer the questions.`;

  return {
    props: {
      id: params.id,
      passage,
      description,
    },
    revalidate: 3600,
  };
}
