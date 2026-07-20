import * as React from 'react';
import NextLink from 'next/link';
import {
  Activity,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  Flame,
  Headphones,
  LayoutDashboard,
  Mic,
  PenLine,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useAuth } from '../../lib/auth';
import { track } from '../../lib/analytics';
import SignInDialog from '../auth/SignInDialog';

const KPIS = [
  {
    label: 'Estimated overall',
    value: '6.5',
    detail: '+0.5 this month',
    icon: TrendingUp,
    tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  },
  {
    label: 'Current streak',
    value: '4 days',
    detail: 'Keep it going today',
    icon: Flame,
    tone: 'bg-amber-50 text-amber-700 ring-amber-100',
  },
  {
    label: 'Submissions',
    value: '12',
    detail: '3/4 weekly goal',
    icon: Activity,
    tone: 'bg-blue-50 text-blue-700 ring-blue-100',
  },
  {
    label: 'Focused practice',
    value: '8.4h',
    detail: 'Across all four skills',
    icon: Clock3,
    tone: 'bg-violet-50 text-violet-700 ring-violet-100',
  },
];

const SKILLS = [
  { label: 'Reading', value: 7, icon: BookOpen },
  { label: 'Listening', value: 6.5, icon: Headphones },
  { label: 'Writing', value: 6, icon: PenLine },
  { label: 'Speaking', value: 6.5, icon: Mic },
];

function PreviewRing() {
  return (
    <div className="relative h-20 w-20 shrink-0" aria-label="Example overall band 6.5 out of target 7">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="40" cy="40" r="31" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r="31"
          fill="none"
          stroke="#34d399"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray="181 195"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black text-white">6.5</span>
        <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">of 7.0</span>
      </div>
    </div>
  );
}

function MiniTrend() {
  const points = [
    [24, 126],
    [111, 116],
    [198, 101],
    [285, 88],
    [372, 73],
    [456, 58],
  ];
  const line = points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ');
  const area = `${line} L 456 148 L 24 148 Z`;

  return (
    <svg
      viewBox="0 0 480 165"
      className="mt-4 h-36 w-full"
      role="img"
      aria-label="Example writing band trajectory rising from 5.5 to 6.5"
    >
      <defs>
        <linearGradient id="homepage-dashboard-trend" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[36, 92, 148].map((y, index) => (
        <g key={y}>
          <line x1="24" x2="456" y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 7" />
          <text x="2" y={y + 4} fill="#94a3b8" fontSize="10">
            {[7, 6, 5][index]}.0
          </text>
        </g>
      ))}
      <path d={area} fill="url(#homepage-dashboard-trend)" />
      <path d={line} fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {points.map(([x, y], index) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r={index === points.length - 1 ? 6 : 4} fill="white" stroke="#059669" strokeWidth="3" />
          {index === points.length - 1 && (
            <text x={x} y={y - 13} textAnchor="middle" fill="#047857" fontSize="11" fontWeight="700">
              6.5
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

function DashboardPreview() {
  return (
    <div className="relative rounded-[1.75rem] border border-white/10 bg-slate-950 p-3 shadow-[0_40px_100px_-45px_rgba(2,6,23,0.8)] sm:p-4">
      <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-emerald-400/15 blur-3xl" />
      <div className="relative flex items-center justify-between gap-3 px-2 py-1.5">
        <div className="flex items-center gap-2 text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/10">
            <LayoutDashboard className="h-4 w-4 text-emerald-300" />
          </span>
          <div>
            <p className="text-xs font-black">Your progress dashboard</p>
            <p className="text-[10px] text-slate-400">A plan that grows with your practice</p>
          </div>
        </div>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-300 ring-1 ring-white/10">
          Example data
        </span>
      </div>

      <div className="relative mt-3 rounded-2xl border border-white/10 bg-white/[0.055] p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-emerald-300">
              Target readiness
            </p>
            <p className="mt-1 text-base font-black text-white">You’re closing the gap.</p>
            <p className="mt-1 text-[11px] text-slate-400">Writing is your next best move.</p>
          </div>
          <PreviewRing />
        </div>
      </div>

      <div className="relative mt-3 grid grid-cols-2 gap-2.5">
        {KPIS.map(({ label, value, detail, icon: Icon, tone }) => (
          <article key={label} className="rounded-2xl bg-white p-3.5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[10px] font-semibold text-slate-500">{label}</p>
                <p className="mt-1 text-lg font-black tracking-tight text-slate-950">{value}</p>
              </div>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1 ${tone}`}>
                <Icon className="h-3.5 w-3.5" />
              </span>
            </div>
            <p className="mt-1 truncate text-[9px] text-slate-400">{detail}</p>
          </article>
        ))}
      </div>

      <div className="relative mt-3 grid gap-2.5 md:grid-cols-[minmax(0,1.45fr)_minmax(160px,0.75fr)]">
        <div className="rounded-2xl bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-700">Performance lab</p>
              <p className="mt-1 text-sm font-black text-slate-950">Band score trajectory</p>
            </div>
            <span className="rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600">Writing</span>
          </div>
          <MiniTrend />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4 text-white">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-300">Skill pulse</p>
          </div>
          <div className="mt-4 space-y-3.5">
            {SKILLS.map(({ label, value, icon: Icon }) => (
              <div key={label}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[10px] font-bold">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/10 text-emerald-300">
                      <Icon className="h-3 w-3" />
                    </span>
                    {label}
                  </span>
                  <span className="text-xs font-black">{value.toFixed(1)}</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-300"
                    style={{ width: `${(value / 9) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardTeaser() {
  const { user, loading } = useAuth();
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const trackCta = () => {
    track('dashboard_teaser_cta_clicked', {
      signed_in: Boolean(user),
      destination: user ? '/dashboard' : 'signup',
    });
  };

  return (
    <>
      <section className="relative overflow-hidden border-y border-slate-200 bg-slate-50" aria-labelledby="dashboard-teaser-heading">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(16,185,129,0.12),transparent_32%),radial-gradient(circle_at_92%_82%,rgba(34,211,238,0.1),transparent_28%)]"
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.28fr)] lg:gap-14 lg:px-8 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
              <Sparkles className="h-3.5 w-3.5" />
              Free learner account
            </span>
            <h2 id="dashboard-teaser-heading" className="mt-5 text-3xl font-black leading-tight tracking-tight text-slate-950 sm:text-4xl">
              Turn every practice session into visible progress.
            </h2>
            <p className="mt-5 text-base leading-7 text-slate-600">
              Your personal dashboard turns scores into a clear study plan, so you can see what is improving and what to practise next.
            </p>
            <ul className="mt-7 space-y-3">
              {[
                'Track band trends across all four IELTS skills',
                'Build streaks and work toward a weekly practice goal',
                'Review past submissions, feedback and weak spots',
                'Set a target band and get a more focused next step',
              ].map((benefit) => (
                <li key={benefit} className="flex items-start gap-3 text-sm font-medium leading-6 text-slate-700">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </span>
                  {benefit}
                </li>
              ))}
            </ul>

            <div className="mt-8">
              {!loading && user ? (
                <Button asChild variant="accent" size="lg" className="shadow-lg shadow-emerald-200">
                  <NextLink href="/dashboard" className="no-underline" onClick={trackCta}>
                    Open my dashboard
                    <ArrowRight className="h-4 w-4" />
                  </NextLink>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="accent"
                  size="lg"
                  className="shadow-lg shadow-emerald-200"
                  onClick={() => {
                    trackCta();
                    setDialogOpen(true);
                  }}
                >
                  Improve my IELTS band
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
              <p className="mt-3 text-xs text-slate-500">Free to create · No payment details required</p>
            </div>
          </div>

          <DashboardPreview />
        </div>
      </section>

      <SignInDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Create your progress dashboard"
        description="Save every score and turn your practice history into a personal plan."
        trigger="homepage_dashboard_teaser"
      />
    </>
  );
}
