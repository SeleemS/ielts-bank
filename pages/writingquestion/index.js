import SectionLanding from '../../src/components/SectionLanding';
import { SKILLS, listPassages } from '../../lib/supabase';

const WRITING_HUB_LINKS = {
  title: 'Writing guides and tools',
  description: 'Topic lists, the marking criteria and an instant AI band score for your own essay.',
  links: [
    { href: '/ielts-writing-task-2-topics', label: 'Writing Task 2 topics' },
    { href: '/ielts-writing-checker', label: 'AI Writing Checker' },
    { href: '/ielts-writing-checker/task-2', label: 'Task 2 essay checker' },
    { href: '/ielts-writing-checker/task-1', label: 'Task 1 report checker' },
    { href: '/ielts-writing-checker/general-training-letter', label: 'GT letter checker' },
    { href: '/ielts-band-descriptors', label: 'Band descriptors' },
    { href: '/ielts-writing-checker-accuracy', label: 'Checker accuracy' },
  ],
};

export default function WritingIndex({ items }) {
  return (
    <SectionLanding
      section="writing"
      heading="IELTS Writing Practice Questions"
      intro="Practise real IELTS Writing Task 2 prompts and get instant AI-powered feedback scored against the official IELTS rubric. Choose a prompt below to begin."
      title="IELTS Writing Practice Questions with AI Feedback | IELTS-Bank"
      description="Free IELTS Writing practice questions with AI-powered grading. Practise real Task 2 prompts and get instant feedback on your essay against the official IELTS criteria."
      items={items}
      hubLinks={WRITING_HUB_LINKS}
    />
  );
}

export async function getStaticProps() {
  const items = await listPassages(SKILLS.writing);
  return { props: { items }, revalidate: 3600 };
}
