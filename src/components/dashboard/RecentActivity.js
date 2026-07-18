import * as React from 'react';
import NextLink from 'next/link';
import { ArrowRight, ArrowUpRight, History } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { SKILL_META, formatBand, formatDate } from './utils';

export default function RecentActivity({ items, onViewAll }) {
  const rows = items.slice(0, 5);
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_18px_55px_-38px_rgba(15,23,42,0.5)]" aria-labelledby="recent-heading">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-7">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Latest work</p>
          <h2 id="recent-heading" className="mt-1 text-xl font-black tracking-tight text-slate-950">Recent submissions</h2>
        </div>
        <button type="button" onClick={onViewAll} className="group inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50">
          View all <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
      {rows.length ? (
        <ul className="divide-y divide-slate-100 px-5 sm:px-7">
          {rows.map((item) => {
            const meta = SKILL_META[item.skill] || { label: item.skill, icon: History };
            const Icon = meta.icon;
            const title = (
              <>
                <span className="truncate">{item.title}</span>
                {item.href && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />}
              </>
            );
            return (
              <li key={item.id} className="flex items-center gap-4 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600"><Icon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  {item.href ? (
                    <NextLink href={item.href} className="group flex max-w-max items-center gap-1 text-sm font-bold text-slate-800 no-underline hover:text-emerald-700">{title}</NextLink>
                  ) : <p className="truncate text-sm font-bold text-slate-800">{item.title}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <Badge variant="secondary" className="px-2 py-0 text-[10px]">{meta.label}</Badge>
                    <span>{item.detail || 'Practice submission'}</span><span>·</span><span>{formatDate(item.date)}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right"><p className="text-xl font-black tabular-nums text-slate-950">{formatBand(item.band)}</p><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Band</p></div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="px-7 py-10 text-center"><History className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">Your first submission will appear here.</p></div>
      )}
    </section>
  );
}
