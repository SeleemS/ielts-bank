import * as React from 'react';
import { Activity, Clock3, Flame, TrendingUp } from 'lucide-react';
import { formatBand } from './utils';

function StatCard({ icon: Icon, label, value, detail, tone = 'emerald' }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  };

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_35px_-24px_rgba(15,23,42,0.45)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_45px_-24px_rgba(15,23,42,0.5)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${tones[tone]}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <span className="absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
    </article>
  );
}

function formatMinutes(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)}h`;
}

export default function StatsOverview({ data, weeklyGoal = 3 }) {
  const goalProgress = Math.min(100, Math.round((data.weeklyCount / Math.max(1, weeklyGoal)) * 100));
  const best = Object.values(data.skills).reduce(
    (current, skill) => (skill.best !== null && (current === null || skill.best > current) ? skill.best : current),
    null
  );

  return (
    <section aria-label="Progress summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon={TrendingUp}
        label="Estimated overall"
        value={formatBand(data.overallBand)}
        detail={data.overallBand === null ? 'Complete your first practice' : `Best skill score ${formatBand(best)}`}
        tone="emerald"
      />
      <StatCard
        icon={Flame}
        label="Current streak"
        value={`${data.streak} day${data.streak === 1 ? '' : 's'}`}
        detail={data.streak ? 'Keep the momentum going today' : 'Practise today to start a streak'}
        tone="amber"
      />
      <StatCard
        icon={Activity}
        label="Submissions"
        value={data.totalPractised}
        detail={`${data.weeklyCount}/${weeklyGoal} weekly goal · ${goalProgress}%`}
        tone="blue"
      />
      <StatCard
        icon={Clock3}
        label="Focused practice"
        value={formatMinutes(data.totalMinutes)}
        detail={`${data.activeDays} active day${data.activeDays === 1 ? '' : 's'} recorded`}
        tone="violet"
      />
    </section>
  );
}
