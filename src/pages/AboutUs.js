import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';

const AboutUs = () => {
  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <Head>
        <title>About Us | IELTS-Bank</title>
        <meta
          name="description"
          content="Learn about IELTS-Bank — a free IELTS practice platform with reading, writing, listening and speaking questions, AI-powered feedback, mock tests and study guides."
        />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://www.ielts-bank.com/about" />
      </Head>
      <Navbar />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 md:py-16">
          <Button asChild variant="ghost" className="mb-6 -ml-2">
            <NextLink href="/" className="no-underline">
              ← Back to Homepage
            </NextLink>
          </Button>

          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            About IELTS-Bank
          </h1>

          <Card className="mt-6">
            <CardContent className="space-y-5 pt-6 text-[15px] leading-8 text-slate-700">
              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">Our Mission</h2>
                <p>
                  IELTS-Bank exists to make high-quality IELTS preparation accessible to everyone.
                  Test prep courses and coaching can cost hundreds of dollars — we believe learners
                  everywhere deserve free, realistic practice material and instant feedback,
                  whatever their budget.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">What We Offer</h2>
                <ul className="list-disc space-y-1 pl-6">
                  <li>
                    <strong className="font-semibold text-foreground">Practice questions for every skill</strong> — Reading, Writing, Listening and Speaking exercises modeled on the real exam format, organized by question type.
                  </li>
                  <li>
                    <strong className="font-semibold text-foreground">AI-powered feedback</strong> — our <NextLink href="/ielts-writing-checker" className="text-primary underline-offset-2 hover:underline">Writing Checker</NextLink> and Speaking Examiner give you an estimated band score with detailed, criteria-based feedback in seconds.
                  </li>
                  <li>
                    <strong className="font-semibold text-foreground">Full mock tests</strong> — timed, exam-style practice so you know exactly what to expect on test day.
                  </li>
                  <li>
                    <strong className="font-semibold text-foreground">Free tools and guides</strong> — a <NextLink href="/band-calculator" className="text-primary underline-offset-2 hover:underline">band score calculator</NextLink> and a regularly updated <NextLink href="/blog" className="text-primary underline-offset-2 hover:underline">blog</NextLink> covering strategies, vocabulary and common mistakes.
                  </li>
                </ul>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">How We Keep It Free</h2>
                <p>
                  Core practice content on IELTS-Bank is free to use, without an account. The site is
                  supported by advertising and an optional premium subscription that unlocks higher
                  AI-feedback limits. That model lets us keep publishing new questions and guides
                  while staying free for the learners who need it most.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">Independence Disclaimer</h2>
                <p>
                  IELTS-Bank is an independent study resource. We are not affiliated with, endorsed
                  by, or connected to the British Council, IDP Education, or Cambridge Assessment
                  English, the organizations that own and administer the IELTS test. IELTS is a
                  registered trademark of its respective owners. Band scores estimated by our AI
                  tools are for practice purposes only and do not guarantee any official result.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">Get in Touch</h2>
                <p>
                  Questions, feedback, or spotted a mistake in a question? We read everything. Reach
                  us at{' '}
                  <a href="mailto:info@ielts-bank.com" className="text-primary underline-offset-2 hover:underline">info@ielts-bank.com</a>{' '}
                  or through our <NextLink href="/contactus" className="text-primary underline-offset-2 hover:underline">contact form</NextLink>.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default AboutUs;
