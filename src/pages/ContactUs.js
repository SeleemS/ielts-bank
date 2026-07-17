import React, { useState } from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { CheckCircle2, Mail, AlertCircle } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { track } from '../lib/analytics';

const fieldClasses =
  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

const ContactUs = () => {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pending) return;

    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: (data.get('name') || '').toString(),
      email: (data.get('email') || '').toString(),
      message: (data.get('message') || '').toString(),
    };

    setPending(true);
    setError('');
    setSent(false);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Something went wrong. Please try again.');
        return;
      }
      form.reset();
      setSent(true);
      track('contact_submit', { outcome: 'success', signed_in: false });
    } catch (err) {
      setError('We could not reach the server. Please check your connection and try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <Head>
        <title>Contact Us | IELTS-Bank</title>
        <meta
          name="description"
          content="Get in touch with the IELTS-Bank team. Email us at info@ielts-bank.com or use our contact form for questions about IELTS practice and preparation."
        />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://ielts-bank.com/contactus" />
      </Head>
      <Navbar />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6 md:py-16">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Contact Us
            </h1>
            <p className="mt-3 text-base text-muted-foreground">
              Have a question about IELTS practice or preparation? We would love
              to hear from you.
            </p>
            <p className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4 text-accent" />
              Or email us directly at{' '}
              <a
                href="mailto:info@ielts-bank.com"
                className="font-medium text-accent underline underline-offset-2 hover:text-accent/80"
              >
                info@ielts-bank.com
              </a>
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Send us a message</CardTitle>
              <CardDescription>
                We will get back to you as soon as possible.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sent && (
                <div
                  role="status"
                  className="mb-6 flex items-start gap-3 rounded-md border border-accent/30 bg-accent/10 p-4 text-sm text-foreground"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <div>
                    <p className="font-semibold">Message sent!</p>
                    <p className="text-muted-foreground">
                      We will get back to you as soon as possible.
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="mb-6 flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground"
                >
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  <div>
                    <p className="font-semibold">Message not sent</p>
                    <p className="text-muted-foreground">{error}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label
                    htmlFor="name"
                    className="text-sm font-medium text-foreground"
                  >
                    Your Name
                  </label>
                  <input
                    id="name"
                    name="name"
                    required
                    placeholder="John Doe"
                    className={fieldClasses}
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="email"
                    className="text-sm font-medium text-foreground"
                  >
                    Email Address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    placeholder="john@example.com"
                    className={fieldClasses}
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="message"
                    className="text-sm font-medium text-foreground"
                  >
                    Message
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    rows={5}
                    placeholder="How can we help you?"
                    className={`${fieldClasses} resize-y`}
                  />
                </div>

                <Button
                  type="submit"
                  variant="accent"
                  className="w-full"
                  disabled={pending}
                >
                  {pending ? 'Sending…' : 'Send Message'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="mt-8 text-center">
            <Button asChild variant="ghost">
              <NextLink href="/" className="no-underline">
                ← Back to Homepage
              </NextLink>
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ContactUs;
