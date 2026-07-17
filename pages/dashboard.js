// pages/dashboard.js
// Private, auth-gated user progress dashboard for ielts-bank.com.
//
// Data is fetched CLIENT-SIDE after `useAuth()` resolves (no SSR: there is no
// user session in getServerSideProps here). RLS on `attempts`/`scores` means
// each query returns only the signed-in user's own rows.
//
// Scope: this file + src/components/dashboard/** only.

import * as React from 'react';
import Head from 'next/head';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';
import { useAuth } from '../src/lib/auth';
import { getSupabase } from '../lib/supabase';

import StatsOverview from '../src/components/dashboard/StatsOverview';
import BandTrend from '../src/components/dashboard/BandTrend';
import RecentActivity from '../src/components/dashboard/RecentActivity';
import { LoadingState, SignedOutState, EmptyState, ErrorState } from '../src/components/dashboard/States';
import { buildDashboardData } from '../src/components/dashboard/utils';
import LearningInsights from '../src/components/dashboard/LearningInsights';

// Reading/Listening auto-scored attempts, newest first, with the passage title
// + slug embedded (PostgREST embedding on the passage_id FK; passages have a
// public read policy). Writing is handled by the scores query below.
const ATTEMPTS_SELECT =
  'id, skill, raw_score, total, per_question, band, started_at, submitted_at, created_at, passages ( title, slug, skill ), mock_tests ( title, slug )';

// AI writing/speaking scores, newest first. The prompt title lives on the
// linked attempt's passage, so embed attempts -> passages (two-level embedding).
const SCORES_SELECT =
  'id, skill, overall_band, criteria, created_at, attempts ( passage_id, passages ( title, slug, skill ) )';

function useDashboardData(user) {
  const [state, setState] = React.useState({ status: 'idle', data: null, error: null });

  React.useEffect(() => {
    if (!user) return;
    let active = true;
    setState({ status: 'loading', data: null, error: null });

    (async () => {
      try {
        const supabase = getSupabase();
        const [attemptsRes, scoresRes, profileRes] = await Promise.all([
          supabase
            .from('attempts')
            .select(ATTEMPTS_SELECT)
            .in('skill', ['reading', 'listening'])
            .order('created_at', { ascending: false }),
          supabase
            .from('scores')
            .select(SCORES_SELECT)
            .in('skill', ['writing', 'speaking'])
            .order('created_at', { ascending: false }),
          supabase.from('users').select('target_band').eq('id', user.id).maybeSingle(),
        ]);

        if (attemptsRes.error) throw attemptsRes.error;
        if (scoresRes.error) throw scoresRes.error;
        if (profileRes.error) throw profileRes.error;
        if (!active) return;

        setState({
          status: 'ready',
          data: {
            ...buildDashboardData(attemptsRes.data || [], scoresRes.data || []),
            targetBand: profileRes.data?.target_band == null ? null : Number(profileRes.data.target_band),
          },
          error: null,
        });
      } catch (err) {
        if (!active) return;
        setState({ status: 'error', data: null, error: err?.message || 'Unknown error' });
      }
    })();

    return () => {
      active = false;
    };
  }, [user]);

  return state;
}

function DashboardBody({ user }) {
  const { status, data, error } = useDashboardData(user);

  if (status === 'loading' || status === 'idle') return <LoadingState />;
  if (status === 'error') return <ErrorState message={error} />;

  if (!data || !data.hasData) return <EmptyState />;

  return (
    <div className="space-y-8">
      <StatsOverview totalPractised={data.totalPractised} skills={data.skills} />
      <BandTrend skills={data.skills} />
      <LearningInsights data={data} userId={user.id} />
      <RecentActivity items={data.items} />
    </div>
  );
}

export default function DashboardPage() {
  const { user, loading } = useAuth();

  let content;
  if (loading) {
    content = <LoadingState />;
  } else if (!user) {
    content = <SignedOutState />;
  } else {
    content = (
      <div className="space-y-8">
        <header>
          <p className="text-sm font-medium text-accent">Your dashboard</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Welcome back
          </h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">{user.email}</p>
        </header>
        <DashboardBody user={user} />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Your Dashboard | IELTS-Bank</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          {content}
        </main>
        <Footer />
      </div>
    </>
  );
}
