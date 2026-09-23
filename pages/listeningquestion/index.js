import SectionLanding from '../../src/components/SectionLanding';
import { SKILLS, listPassages } from '../../lib/supabase';
import { listeningPartLinks } from '../../lib/siteDirectory';

export default function ListeningIndex({ items, hubLinks = null }) {
  return (
    <SectionLanding
      section="listening"
      heading="IELTS Listening Practice Questions"
      intro="Practise authentic IELTS Listening recordings with real exam-style questions and instant scoring. Choose a recording below to get started."
      title="IELTS Listening Practice Questions | IELTS-Bank"
      description="Free IELTS Listening practice questions with authentic audio recordings, real exam-style questions and instant scoring to help you raise your Listening band score."
      items={items}
      hubLinks={hubLinks}
    />
  );
}

export async function getStaticProps() {
  const items = await listPassages(SKILLS.listening);
  return {
    props: {
      items,
      hubLinks: {
        title: 'Practice by Listening part',
        description: 'Strategy guides for each part of the test, each with its own practice recordings.',
        links: listeningPartLinks(),
      },
    },
    revalidate: 3600,
  };
}
