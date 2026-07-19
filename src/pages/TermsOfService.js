import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';

const TermsOfService = () => {
  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <Head>
        <title>Terms of Service | IELTS-Bank</title>
        <meta
          name="description"
          content="Read the IELTS-Bank terms for free practice, Premium plans, the Exam Pass, cancellations, and the 14-day refund policy."
        />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://www.ielts-bank.com/termsofservice" />
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
            Terms of Service
          </h1>

          <Card className="mt-6">
            <CardContent className="space-y-5 pt-6 text-[15px] leading-8 text-slate-700">
              <p>
                Welcome to IELTSBank. Below are our Terms of Service, which outline
                the rules and regulations for the use of IELTSBank&apos;s Website.
              </p>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">1. Terms</h2>
                <p>
                  By accessing this website, you agree to be bound by these Terms of Service and comply with any applicable local laws.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">2. Use License</h2>
                <p>
                  Permission is granted to temporarily download one copy of the materials on IELTSBank&apos;s website for personal, non-commercial use only.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">3. Disclaimer</h2>
                <p>
                  The materials on IELTSBank’s website are provided &quot;as is.&quot; IELTSBank disclaims all warranties, expressed or implied.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">4. Limitations</h2>
                <p>
                  IELTSBank or its suppliers shall not be liable for any damages arising from the use or inability to use the website.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">5. Revisions and Errata</h2>
                <p>
                  The materials on IELTSBank’s website may include errors. IELTSBank does not guarantee their accuracy or currency.
                </p>
              </div>

              <div id="billing-refunds" className="scroll-mt-24">
                <h2 className="mb-1 text-base font-semibold text-foreground">6. Advertising, Billing and Refunds</h2>
                <p>
                  The website is supported by third-party advertising (including Google AdSense)
                  and optional paid access. Ads are provided by third parties and IELTSBank is not
                  responsible for the content of advertisements or the products and services they
                  promote. Payments are processed by Stripe; IELTSBank does not store full card
                  details.
                </p>
                <ul className="mt-3 list-disc space-y-2 pl-6">
                  <li>
                    <strong className="font-semibold text-foreground">Subscriptions.</strong>{' '}
                    Monthly, six-month and annual plans renew automatically at the price and
                    interval shown at checkout until cancelled. Taxes may be added where required.
                  </li>
                  <li>
                    <strong className="font-semibold text-foreground">Exam Pass.</strong>{' '}
                    The Exam Pass is one payment for 28 days of Premium access. It does not renew
                    automatically.
                  </li>
                  <li>
                    <strong className="font-semibold text-foreground">Cancellation.</strong>{' '}
                    You may cancel a subscription at any time from billing settings. Unless a
                    refund is granted, access continues through the paid billing period and no
                    further renewal is charged.
                  </li>
                  <li>
                    <strong className="font-semibold text-foreground">14-day money-back guarantee.</strong>{' '}
                    You may request a refund within 14 calendar days of your first paid purchase by
                    contacting <a href="mailto:info@ielts-bank.com" className="text-primary underline-offset-2 hover:underline">info@ielts-bank.com</a>{' '}
                    from the email on your account. The guarantee applies once per customer. We may
                    refuse requests involving fraud, chargeback abuse, material violation of these
                    terms, or substantially consumed live-examiner usage.
                  </li>
                  <li>
                    <strong className="font-semibold text-foreground">Fair use.</strong>{' '}
                    Paid AI tools have clearly disclosed abuse-prevention and usage limits. We may
                    temporarily restrict automated, shared-account or excessive use that threatens
                    service availability.
                  </li>
                </ul>
                <p className="mt-3">
                  See our Privacy Policy for how advertising and payment data are handled.
                </p>
              </div>

              <div>
                <h2 className="mb-1 text-base font-semibold text-foreground">7. Site Terms of Use Modifications</h2>
                <p>
                  IELTSBank may revise these terms at any time without notice. By using this site, you agree to be bound by the current version.
                </p>
              </div>

              <p>
                <strong className="font-semibold text-foreground">Last Updated:</strong> July 18, 2026
              </p>

              <p>
                If you have any questions about these Terms of Service, please contact us.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default TermsOfService;
