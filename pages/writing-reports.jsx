import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';
import SignInDialog from '../src/components/auth/SignInDialog';
import { Button } from '../components/ui/button';
import { useAuth } from '../src/lib/auth';
import { requestWritingReport } from '../src/lib/writingReports';
import { writingReportPath } from '../lib/writingReport';

export default function WritingReports() {
  const { user, loading } = useAuth();
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [signIn, setSignIn] = useState(false);
  const reports = state?.owner === user?.id ? state?.reports : null;
  useEffect(() => {
    let canceled = false;
    setState(null); setError('');
    if (!user?.id || loading) return;
    requestWritingReport('').then(data => {
      if (!canceled) setState({ owner: user.id, reports: data.reports });
    }).catch(err => { if (!canceled) setError(err.message); });
    return () => { canceled = true; };
  }, [user?.id, loading, retry]);
  return <>
    <Head><title>Your saved Writing reports | IELTS Bank</title><meta name="robots" content="noindex, nofollow" /></Head>
    <Navbar />
    <main className="mx-auto min-h-[60vh] max-w-3xl px-4 py-10">
      <Link href="/dashboard" className="text-sm font-semibold text-accent">Back to dashboard</Link>
      <h1 className="mt-4 text-3xl font-bold">Your saved Writing reports</h1>
      <p className="mt-3 text-muted-foreground">Revisit your feedback and continue a revision. Your latest 100 reports appear here.</p>
      {!loading && !user ? <Button className="mt-6" onClick={() => setSignIn(true)}>Sign in to see reports</Button> : null}
      {loading || (user && !reports && !error) ? <p role="status" className="mt-6">Loading reports…</p> : null}
      {error ? <div role="alert" className="mt-6"><p>{error}</p><Button className="mt-3" onClick={() => setRetry(n => n + 1)}>Try again</Button></div> : null}
      {reports?.length === 0 ? <p className="my-6">No saved reports yet. Older scores are still on your dashboard; new Writing reports will appear here.</p> : null}
      <ul className="my-6 space-y-3">{reports?.map(report => <li key={report.attempt_id}><Link href={writingReportPath(report.attempt_id)} className="flex items-center justify-between gap-4 rounded-xl border p-4 hover:bg-muted">
        <span><span className="block font-semibold">{report.task_type === 'task2' ? 'Task 2 essay' : report.task_type === 'task1-general' ? 'Task 1 letter' : 'Academic Task 1'}</span><span className="text-xs text-muted-foreground">{new Date(report.created_at).toLocaleString()}</span></span><span className="text-sm font-semibold text-accent">{report.unlocked_at ? 'Full report' : 'Free diagnostic'} →</span>
      </Link></li>)}</ul>
      <Link href="/ielts-writing-checker" className="font-semibold text-accent">Check a new essay</Link>
    </main>
    <Footer /><SignInDialog open={signIn} onOpenChange={setSignIn} initialMode="signin" redirectOnFinish={false} trigger="writing_reports" />
  </>;
}
