import * as React from 'react';
import NextLink from 'next/link';
import { ArrowUpRight, ChevronLeft, ChevronRight, FileText, Search } from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Select } from '../../../components/ui/select';
import { Badge } from '../../../components/ui/badge';
import { SKILL_META, formatBand, formatDate } from './utils';

const PAGE_SIZE = 8;

export default function SubmissionHistory({ items }) {
  const [skill, setSkill] = React.useState('all');
  const [query, setQuery] = React.useState('');
  const [page, setPage] = React.useState(1);

  const filtered = React.useMemo(() => items.filter((item) => {
    if (skill !== 'all' && item.skill !== skill) return false;
    return item.title.toLowerCase().includes(query.trim().toLowerCase());
  }), [items, query, skill]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  React.useEffect(() => {
    setPage(1);
  }, [query, skill]);

  return (
    <section aria-labelledby="submissions-heading">
      <div className="rounded-3xl bg-slate-950 px-5 py-7 text-white shadow-[0_25px_70px_-38px_rgba(2,6,23,0.9)] sm:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Your work, organized</p>
        <h2 id="submissions-heading" className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Past submissions</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Review every scored attempt, compare bands, and reopen the practice that will move you forward.</p>
      </div>

      <div className="-mt-3 rounded-3xl border border-slate-200/80 bg-white shadow-[0_22px_60px_-38px_rgba(15,23,42,0.55)]">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search submissions" className="h-11 rounded-xl border-slate-200 pl-9" />
          </div>
          <Select value={skill} onChange={(event) => setSkill(event.target.value)} className="h-11 rounded-xl border-slate-200 sm:w-44" aria-label="Filter submissions by skill">
            <option value="all">All skills</option>
            {Object.values(SKILL_META).map((meta) => <option key={meta.key} value={meta.key}>{meta.label}</option>)}
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                <th className="px-6 py-4">Submission</th><th className="px-4 py-4">Skill</th><th className="px-4 py-4">Result</th><th className="px-4 py-4">Band</th><th className="px-6 py-4 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((item) => {
                const meta = SKILL_META[item.skill] || { label: item.skill, icon: FileText };
                const Icon = meta.icon;
                return (
                  <tr key={item.id} className="group transition hover:bg-slate-50/80">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Icon className="h-4 w-4" /></span>
                        {item.href ? <NextLink href={item.href} className="inline-flex min-w-0 items-center gap-1 text-sm font-bold text-slate-800 no-underline hover:text-emerald-700"><span className="max-w-[300px] truncate">{item.title}</span><ArrowUpRight className="h-3.5 w-3.5 shrink-0" /></NextLink> : <span className="max-w-[300px] truncate text-sm font-bold text-slate-800">{item.title}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-4"><Badge variant="secondary" className="font-semibold">{meta.label}</Badge></td>
                    <td className="px-4 py-4 text-sm text-slate-500">{item.detail || 'Scored practice'}</td>
                    <td className="px-4 py-4"><span className="inline-flex min-w-12 justify-center rounded-xl bg-emerald-50 px-3 py-1.5 text-sm font-black tabular-nums text-emerald-800">{formatBand(item.band)}</span></td>
                    <td className="px-6 py-4 text-right text-sm text-slate-500">{formatDate(item.date)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && (
            <div className="px-6 py-16 text-center"><FileText className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No submissions match this view</p><p className="mt-1 text-xs text-slate-500">Try a different skill or search term.</p></div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-slate-100 px-5 py-4 text-xs text-slate-500 sm:px-6">
          <span>{filtered.length ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)} of ${filtered.length}` : '0 submissions'}</span>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
            <span className="min-w-16 text-center font-semibold text-slate-600">{currentPage} / {pages}</span>
            <button type="button" aria-label="Next page" disabled={currentPage === pages} onClick={() => setPage((value) => Math.min(pages, value + 1))} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </section>
  );
}
