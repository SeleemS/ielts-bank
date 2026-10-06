import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Navbar from '../../src/components/Navbar';
import Footer from '../../src/components/Footer';
import SignInDialog from '../../src/components/auth/SignInDialog';
import WritingScoreReport from '../../src/components/question/WritingScoreReport';
import { Button } from '../../components/ui/button';
import { useAuth } from '../../src/lib/auth';
import { saveWritingDraft } from '../../src/lib/writingDraft';
import { requestWritingReport } from '../../src/lib/writingReports';
import { track } from '../../src/lib/analytics';
import { REPORT_ID_RE, writingReportPath } from '../../lib/writingReport';

export default function SavedWritingReport() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [signIn, setSignIn] = useState(false);
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const owner = `${user?.id || ''}:${id}`;
  // Never display an earlier account's report during a session transition.
  const report = state?.owner === owner ? state.report : null;
  useEffect(() => {
    let canceled = false;
    setState(null); setError('');
    if (loading || !user?.id || !id) return;
    if (!REPORT_ID_RE.test(id)) { setError('Invalid report link.'); return; }
    (async () => {
      let data = await requestWritingReport(id);
      if (canceled) return;
      if (!data.result.free || data.canUnlock) data = await requestWritingReport(id, 'POST');
      if (canceled) return;
      setState({ owner, report: data });
      track('writing_report_open', { source: 'saved_report', full: !data.result.free, offer_version: 'current_report_v4' });
    })().catch(err => { if (!canceled) setError(err.message); });
    return () => { canceled = true; };
  }, [id, user?.id, loading, retry, owner]);

  function revise() {
    const saved = saveWritingDraft({
      taskType: report.taskType, prompt: report.prompt, essay: report.essay,
      autoSubmit: false, revisionOf: report.reportId,
    });
    if (!saved) { setError('Your browser could not save the draft. Copy your essay below and open the Writing checker.'); return; }
    track('writing_revision_start', { source: 'saved_report', full: !report.result.free });
    router.push('/ielts-writing-checker');
  }

  return <>
    <Head><title>Your Writing report | IELTS Bank</title><meta name="robots" content="noindex, nofollow" /><meta name="referrer" content="same-origin" /></Head>
    <Navbar />
    <main className="mx-auto min-h-[60vh] max-w-3xl px-4 py-10">
      <Link href="/writing-reports" className="text-sm font-semibold text-accent">All your Writing reports</Link>
      <h1 className="mt-4 text-3xl font-bold">Your Writing report</h1>
      <p className="mt-2 text-sm text-muted-foreground">AI feedback for practice. Your band is an estimate, not an official IELTS result.</p>
      {loading || (user && !report && !error) ? <p role="status" className="mt-6">Opening your saved feedback…</p> : null}
      {!loading && !user ? <div className="mt-6"><p className="mb-4">Sign in with the account you used to score this essay.</p><Button onClick={() => setSignIn(true)}>Sign in to open report</Button></div> : null}
      {error ? <div role="alert" className="my-6 rounded-xl border p-4"><p>{error}</p><Button variant="outline" className="mt-3" onClick={() => setRetry(n => n + 1)}>Try again</Button></div> : null}
      {report ? <div className="mt-6 space-y-6">
        {!report.result.free ? <section className="rounded-xl border border-accent/30 bg-accent/5 p-5">
          <h2 className="text-lg font-bold">Turn this feedback into your next draft</h2>
          <p className="mt-2 text-sm">Start with the first improvement below. Revise that part in your own words, then score your updated essay when you are ready.</p>
          <Button className="mt-4" onClick={revise}>Revise this essay</Button>
          <p className="mt-2 text-xs text-muted-foreground">Opening this report uses no scoring allowance. Scoring a new draft uses your normal allowance.</p>
        </section> : null}
        {writingReportPath(report.revisionOf) ? <p className="text-sm">This is a revised draft. <Link className="font-semibold text-accent" href={writingReportPath(report.revisionOf)}>Compare with the original report</Link>. AI estimates can vary between drafts.</p> : null}
        <WritingScoreReport task={report.result.task} result={report.result} analyticsSource="saved_report" />
        <aside className="rounded-xl border p-4 text-sm">
          <h2 className="font-semibold">A short practice plan</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5"><li>Today: work on one improvement from this report.</li><li>Next session: revise the paragraph without copying the example.</li><li>Then: score the revision and compare the feedback.</li></ol>
          <Link href="/dashboard?tab=settings#email-preferences" onClick={() => track('study_plan_preferences_click', { source: 'saved_report' })} className="mt-3 inline-block font-semibold text-accent">Optional: choose study-plan emails</Link>
          <p className="mt-1 text-xs text-muted-foreground">Email preferences are your choice. Tips and offers have a separate setting; you can unsubscribe at any time.</p>
        </aside>
        <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">Your question and submitted essay</summary><p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{report.prompt}</p><p className="mt-4 whitespace-pre-wrap text-sm">{report.essay}</p></details>
        <Link href="/ielts-writing-checker" className="inline-block text-sm font-semibold text-accent">Open the Writing checker</Link>
      </div> : null}
    </main>
    <Footer />
    <SignInDialog open={signIn} onOpenChange={setSignIn} initialMode="signin" redirectOnFinish={false} trigger="saved_writing_report" />
  </>;
}
