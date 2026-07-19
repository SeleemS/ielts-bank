import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';

export default function ServerErrorPage() {
  return (
    <>
      <Head>
        <title>Something went wrong | IELTS-Bank</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-16">
        <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-12">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-700">
            Error 500
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Something went wrong
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-600 sm:text-base">
            We could not load this page. Try again in a moment, or return to the homepage and
            continue practising.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <NextLink
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-bold text-white no-underline hover:bg-slate-800"
            >
              Return home
            </NextLink>
            <NextLink
              href="/contactus"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 px-5 text-sm font-bold text-slate-700 no-underline hover:bg-slate-100"
            >
              Contact support
            </NextLink>
          </div>
        </section>
      </main>
    </>
  );
}
