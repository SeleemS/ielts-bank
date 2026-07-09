import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { BookOpen, PenLine, Headphones, Mic } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Badge } from '../../components/ui/badge';
import { Card } from '../../components/ui/card';

const SKILLS = [
  {
    label: 'Reading Practice',
    href: '/readingquestion',
    icon: BookOpen,
    description: 'Timed passages with instant auto-scoring.',
  },
  {
    label: 'Writing Practice',
    href: '/writingquestion',
    icon: PenLine,
    description: 'Task 1 and Task 2 prompts with model answers.',
  },
  {
    label: 'Listening Practice',
    href: '/listeningquestion',
    icon: Headphones,
    description: 'Authentic-style audio with answer keys.',
  },
];

const SpeakingQuestion = () => {
  return (
    <div className="tw-root flex min-h-screen flex-col bg-secondary/40">
      <Head>
        <title>IELTS Speaking Practice (Coming Soon) | IELTS-Bank</title>
        <meta
          name="description"
          content="IELTS Speaking practice is coming soon to IELTS-Bank. In the meantime, practise Reading, Writing and Listening for free."
        />
        <meta name="robots" content="noindex, follow" />
      </Head>

      <Navbar />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center sm:px-6 md:py-20">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 ring-1 ring-accent/20">
            <Mic className="h-8 w-8 text-accent" />
          </span>

          <Badge variant="emerald" className="mt-6">
            Coming soon
          </Badge>

          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Speaking practice is on the way
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
            We are building an IELTS Speaking practice experience with cue cards
            and model answers. It is not quite ready yet — but you can keep
            improving your score with our other free sections in the meantime.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-4 text-left sm:grid-cols-3">
            {SKILLS.map((skill) => {
              const Icon = skill.icon;
              return (
                <NextLink
                  key={skill.href}
                  href={skill.href}
                  className="no-underline"
                >
                  <Card className="group h-full p-5 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md">
                    <Icon className="h-6 w-6 text-accent" />
                    <h2 className="mt-3 text-base font-semibold text-foreground group-hover:text-primary">
                      {skill.label}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {skill.description}
                    </p>
                  </Card>
                </NextLink>
              );
            })}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default SpeakingQuestion;
