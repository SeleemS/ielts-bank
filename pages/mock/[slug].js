import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import Navbar from '../../src/components/Navbar';
import Footer from '../../src/components/Footer';
import QuestionEngine from '../../src/components/question/QuestionEngine';
import { Badge } from '../../components/ui/badge';
import { sanitizeHtml } from '../../lib/sanitize';
import { getMockTest, listMockTests } from '../../lib/supabase';

const SITE_URL = 'https://ielts-bank.com';
const PASSAGE_CLASS =
  'text-[15px] leading-7 text-foreground [&_p]:mb-4 [&_strong]:font-semibold [&_em]:italic [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6';

function combineGroups(sections) {
  let number = 0;
  return sections.flatMap((section, sectionIndex) =>
    (section.passage.groups || []).map((group) => ({
      ...group,
      id: `${section.id}:${group.id}`,
      prompt: `Section ${sectionIndex + 1} · ${group.prompt || 'Questions'}`,
      questions: (group.questions || []).map((question) => ({
        ...question,
        number: ++number,
        globalNumber: number,
      })),
    }))
  );
}

export default function MockTestPage({ mock }) {
  if (!mock) return null;
  const groups = combineGroups(mock.sections);
  const canonical = `${SITE_URL}/mock/${mock.slug}`;
  return (
    <>
      <Head>
        <title>{mock.title} | IELTS-Bank</title>
        <meta name="description" content={mock.description} />
        <link rel="canonical" href={canonical} />
      </Head>
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <NextLink href="/mock-test" className="text-sm font-semibold text-accent no-underline">← All mock tests</NextLink>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge variant="emerald" className="capitalize">{mock.skill}</Badge>
            {mock.module ? <Badge variant="secondary" className="capitalize">{mock.module}</Badge> : null}
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground">{mock.title}</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">{mock.description}</p>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="space-y-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:self-start lg:pr-2">
              {mock.sections.map((section, index) => (
                <article key={section.id} className="rounded-lg border border-border bg-card shadow-sm">
                  <div className="border-b border-border px-5 py-3">
                    <h2 className="font-bold text-foreground">Section {index + 1}: {section.passage.title}</h2>
                  </div>
                  <div className="p-5">
                    {section.passage.audioUrl ? (
                      <audio controls preload="metadata" src={section.passage.audioUrl} className="mb-5 w-full">
                        Your browser does not support the audio element.
                      </audio>
                    ) : null}
                    {section.passage.bodyHtml ? (
                      <div className={PASSAGE_CLASS} dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.passage.bodyHtml) }} />
                    ) : null}
                  </div>
                </article>
              ))}
            </div>

            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <QuestionEngine
                groups={groups}
                storageKey={`mock:${mock.slug}`}
                skill={mock.skill}
                module={mock.module || 'academic'}
                durationSeconds={mock.durationSeconds}
                showBand
              />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
}

export async function getStaticPaths() {
  const mocks = await listMockTests();
  return { paths: mocks.map((mock) => ({ params: { slug: mock.slug } })), fallback: 'blocking' };
}

export async function getStaticProps({ params }) {
  const mock = await getMockTest(params.slug);
  if (!mock || mock.sections.length === 0) return { notFound: true };
  return { props: { mock }, revalidate: 3600 };
}

