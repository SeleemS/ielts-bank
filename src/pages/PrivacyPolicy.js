import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';

const PrivacyPolicy = () => {
  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <Head>
        <title>Privacy Policy | IELTS-Bank</title>
        <meta
          name="description"
          content="Read the IELTS-Bank privacy policy covering how we handle information when you use our free IELTS practice resources."
        />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://www.ielts-bank.com/privacypolicy" />
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
            Privacy Policy
          </h1>

          <Card className="mt-6">
            <CardContent className="space-y-5 pt-6 text-[15px] leading-8 text-slate-700">
              <p>
                This policy explains what IELTS-Bank collects, why we use it, and the choices available when you use the service.
              </p>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">Information Collection and Use</h2>
                <p>
                  Most practice content can be used without an account. If you sign in, we process your email address, account identifier, practice attempts, scores, learning preferences and quota usage so we can provide progress tracking and AI feedback. If you subscribe to updates, we store your email address and signup source. Contact-form messages are used only to respond to your request.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">Practice and AI Scoring Data</h2>
                <p>
                  Submitted Writing responses and scoring results may be stored with a signed-in learner&apos;s attempt history. Speaking recordings are uploaded only for scoring and are deleted after the scoring request completes; a scheduled cleanup also removes any recording older than 30 days. Writing text and speaking audio are sent to our AI provider to generate the feedback you request. Do not submit sensitive personal information in practice answers.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">Analytics, Local Storage and Logs</h2>
                <p>
                  We use Google Analytics, Vercel Analytics and limited first-party event telemetry to understand page visits and feature usage. Anonymous telemetry uses a random identifier stored in your browser and does not include essays, transcripts, audio or email addresses. Local storage also keeps in-progress answers, timer state and preferences so practice can survive a refresh. IP addresses may be processed temporarily for abuse prevention and rate limiting; old rate-limit rows are removed automatically.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">Service Providers and Security</h2>
                <p>
                  We use service providers for hosting, authentication, database storage, analytics, transactional email and AI scoring. They process data only to provide those services under their own privacy and security terms. We use access controls, encrypted connections, row-level database policies, rate limits and restricted server credentials, but no online service can guarantee absolute security.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">Your Choices</h2>
                <p>
                  You can practise without creating an account, decline newsletter signup, unsubscribe from any newsletter email and clear local practice data through your browser settings. You may contact us to request access to, correction of, or deletion of account and subscription data, subject to legal and security requirements.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">Changes to This Privacy Policy</h2>
                <p>
                  This policy is effective as of the last updated date. We may update it in the future, with changes effective upon posting. Please check periodically.
                </p>
              </div>

              <p>
                <strong className="font-semibold text-foreground">Last Updated:</strong> July 16, 2026
              </p>

              <p>
                If you have any questions about this Privacy Policy, please contact us.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
