import SectionLanding from '../../src/components/SectionLanding';
import { SKILLS, listPassages } from '../../lib/supabase';

export default function ReadingIndex({ items }) {
  return (
    <SectionLanding
      section="reading"
      heading="IELTS Reading Practice Questions"
      intro="Practise authentic IELTS Reading passages with a built-in timer and instant scoring. Choose a passage below to get started."
      title="IELTS Reading Practice Questions | IELTS-Bank"
      description="Free IELTS Reading practice questions with real passages, a built-in timer and instant scoring. Improve your Academic and General Training Reading band score."
      items={items}
    />
  );
}

export async function getStaticProps() {
  const items = await listPassages(SKILLS.reading);
  return { props: { items }, revalidate: 60 };
}
