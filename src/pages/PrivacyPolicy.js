import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';

const PrivacyPolicy = () => {
  return (
    <div className="tw-root flex min-h-screen flex-col bg-secondary/40">
      <Head>
        <title>Privacy Policy | IELTS-Bank</title>
        <meta
          name="description"
          content="Read the IELTS-Bank privacy policy covering how we handle information when you use our free IELTS practice resources."
        />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://ielts-bank.com/privacypolicy" />
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
                Welcome to IELTSBank. This privacy policy outlines our policies regarding the collection, use, and disclosure of information we receive from users of our site.
              </p>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">Information Collection and Use</h2>
                <p>
                  IELTSBank does not collect any personally identifiable information from its users. Users are free to visit the site anonymously and no personal data is required for access to most services.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">Log Data</h2>
                <p>
                  We do not collect browser log data such as IP addresses, browser types, or visited pages.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">Cookies and Tracking</h2>
                <p>
                  IELTSBank does not use cookies or tracking technologies. Your privacy is fully respected.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">Data Security</h2>
                <p>
                  Since no personal data is collected, there is no risk of such data being exposed or misused.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">Changes to This Privacy Policy</h2>
                <p>
                  This policy is effective as of the last updated date. We may update it in the future, with changes effective upon posting. Please check periodically.
                </p>
              </div>

              <p>
                <strong className="font-semibold text-foreground">Last Updated:</strong> December 11, 2024
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
