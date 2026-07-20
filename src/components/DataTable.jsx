import React, { useState, useEffect, useMemo } from 'react';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import {
  Search,
  ArrowRight,
  Inbox,
  ChevronLeft,
  ChevronRight,
  Check,
} from 'lucide-react';
import { listPassages, getSupabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { formatAverageUserBand } from '../../lib/averageUserBand';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/utils';
import AdUnit from './AdUnit';

// Difficulty filter options rendered as a segmented control. "all" always
// leads; the skill-specific difficulties are appended only when present in the
// dataset (see difficultiesPresent below), so a list with no "hard" items never
// shows a dead "Hard" tab.
const DIFFICULTY_ORDER = ['easy', 'medium', 'hard'];

// Completed marker shown on rows a signed-in learner has already attempted.
function CompletedTag({ className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent dark:bg-accent/20',
        className
      )}
    >
      <Check className="h-3 w-3" aria-hidden />
      Done
    </span>
  );
}

// Pure Tailwind/shadcn question browser. NO Chakra imports.
//
// Renders a polished, information-dense table of practice passages with a
// client-side title search and pagination over the full list. The full list is
// either passed in via `items` (SectionLanding fetches it in getStaticProps) or
// fetched on the client via listPassages when only a skill/selectedOption is
// given (e.g. a Toggle-driven surface). Rows link to the existing route
// /<skill>question/<legacyId || id> — routing is unchanged.

const RESULTS_PER_PAGE = 10;

// Emerald / amber / red difficulty pills; slate fallback for anything else
// (e.g. "Task 2"). Keyed on a lowercased difficulty string.
const DIFFICULTY_STYLES = {
  easy: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  medium: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  hard: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
};
const DIFFICULTY_FALLBACK =
  'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/20';

function DifficultyBadge({ difficulty }) {
  if (!difficulty) return null;
  const style = DIFFICULTY_STYLES[String(difficulty).toLowerCase()] || DIFFICULTY_FALLBACK;
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        style
      )}
    >
      {difficulty}
    </span>
  );
}

function AverageUserBand({ item, className }) {
  const value = Number(item.averageUserBand);
  if (!Number.isFinite(value)) return null;
  const estimated = item.averageUserBandIsEstimated !== false;
  const formatted = formatAverageUserBand(value);
  const description = estimated
    ? `Estimated average band ${formatted}; this becomes the submitted user average after the first score`
    : `Average user band ${formatted} from ${item.bandSubmissionCount} total ${item.bandSubmissionCount === 1 ? 'submission' : 'submissions'}`;

  return (
    <span
      className={cn('inline-flex items-baseline gap-1 whitespace-nowrap text-sm tabular-nums', className)}
      aria-label={description}
      title={description}
    >
      <span className="font-semibold text-foreground">{formatted}</span>
    </span>
  );
}

function LoadingSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4 sm:px-6">
          <div className="h-4 w-6 shrink-0 animate-pulse rounded bg-muted" />
          <div className="h-4 flex-1 animate-pulse rounded bg-muted" style={{ maxWidth: `${60 - i * 4}%` }} />
          <div className="h-5 w-16 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="hidden h-4 w-14 shrink-0 animate-pulse rounded bg-muted md:block" />
          <div className="hidden h-8 w-24 shrink-0 animate-pulse rounded-md bg-muted sm:block" />
        </div>
      ))}
    </div>
  );
}

const DataTable = ({ items, skill, selectedOption }) => {
  const router = useRouter();
  // Route prefix / fetch key. Accept either an explicit skill or the legacy
  // capitalized selectedOption prop.
  const skillLower = String(skill || selectedOption || 'reading').toLowerCase();
  const itemNoun = skillLower === 'reading' ? 'passage' : skillLower === 'writing' ? 'task' : 'test';

  const { user } = useAuth();

  const [data, setData] = useState(items || []);
  const [loading, setLoading] = useState(!items);
  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [completedSlugs, setCompletedSlugs] = useState(() => new Set());

  useEffect(() => {
    // Prefetched list wins: no client fetch, no spinner.
    if (items) {
      setData(items);
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    // listPassages also includes the stored/estimated average user band.
    listPassages(skillLower)
      .then((res) => {
        if (active) {
          setData(res || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setData([]);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [items, skillLower]);

  // Which passages this learner has already attempted, keyed by slug (the same
  // identifier the list rows use as item.id). The question lists are statically
  // generated, so per-user state can't be baked in — it's fetched client-side
  // once auth resolves. RLS scopes attempts to the signed-in user, and the
  // embedded passages(slug) join bridges attempts.passage_id (a UUID) back to
  // the slug the list is keyed on. Signed-out visitors get an empty set.
  useEffect(() => {
    if (!user?.id) {
      setCompletedSlugs(new Set());
      return undefined;
    }
    let active = true;
    getSupabase()
      .from('attempts')
      .select('passage_id, passages(slug)')
      .eq('skill', skillLower)
      .not('passage_id', 'is', null)
      .then(({ data: rows, error }) => {
        if (!active || error || !Array.isArray(rows)) return;
        const next = new Set();
        for (const row of rows) {
          const slug = row?.passages?.slug;
          if (slug) next.add(slug);
        }
        setCompletedSlugs(next);
      });
    return () => {
      active = false;
    };
  }, [user?.id, skillLower]);

  // Difficulties actually present in this dataset, in a stable easy→hard order.
  // Drives the filter control and lets us hide it when there is nothing to
  // filter (0 or 1 distinct difficulty).
  const difficultiesPresent = useMemo(() => {
    const seen = new Set(
      data.map((item) => String(item.difficulty || '').toLowerCase()).filter(Boolean)
    );
    return DIFFICULTY_ORDER.filter((level) => seen.has(level));
  }, [data]);

  // A filter value stops matching if the dataset changes (e.g. client refetch)
  // and no longer contains that difficulty — fall back to "all".
  useEffect(() => {
    if (difficulty !== 'all' && !difficultiesPresent.includes(difficulty)) {
      setDifficulty('all');
    }
  }, [difficulty, difficultiesPresent]);

  // Reset to first page whenever the dataset, search, or difficulty changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [query, difficulty, skillLower, data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.filter((item) => {
      if (q && !(item.title || '').toLowerCase().includes(q)) return false;
      if (
        difficulty !== 'all'
        && String(item.difficulty || '').toLowerCase() !== difficulty
      ) {
        return false;
      }
      return true;
    });
  }, [data, query, difficulty]);

  // Completed count within the current (unfiltered) list, for the count line.
  const completedInList = useMemo(
    () =>
      completedSlugs.size
        ? data.reduce((n, item) => (completedSlugs.has(item.id) ? n + 1 : n), 0)
        : 0,
    [data, completedSlugs]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / RESULTS_PER_PAGE));
  const page = Math.min(currentPage, totalPages);
  const start = (page - 1) * RESULTS_PER_PAGE;
  const pageItems = filtered.slice(start, start + RESULTS_PER_PAGE);

  const goTo = (p) => setCurrentPage(Math.min(Math.max(1, p), totalPages));

  const pageNumbers = useMemo(() => {
    const maxVisible = 5;
    let s = Math.max(1, page - Math.floor(maxVisible / 2));
    let e = Math.min(totalPages, s + maxVisible - 1);
    if (e - s + 1 < maxVisible) s = Math.max(1, e - maxVisible + 1);
    const nums = [];
    for (let i = s; i <= e; i++) nums.push(i);
    return nums;
  }, [page, totalPages]);

  return (
    <div className="w-full font-sans">
      {/* Toolbar: search + difficulty filter + result count */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title..."
              aria-label={`Search ${itemNoun}s by title`}
              className={cn(
                'h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-base text-foreground sm:text-sm',
                'placeholder:text-muted-foreground shadow-sm outline-none transition-colors',
                'focus:border-accent focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background'
              )}
            />
          </div>
          {difficultiesPresent.length > 1 && (
            <div
              role="group"
              aria-label="Filter by difficulty"
              className="inline-flex items-center gap-0.5 self-start rounded-lg border border-border bg-muted/50 p-0.5"
            >
              {['all', ...difficultiesPresent].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setDifficulty(level)}
                  aria-pressed={difficulty === level}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-semibold capitalize outline-none transition-colors',
                    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                    difficulty === level
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {level === 'all' ? 'All levels' : level}
                </button>
              ))}
            </div>
          )}
        </div>
        {!loading && (
          <p className="shrink-0 text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? itemNoun : `${itemNoun}s`}
            {query.trim() || difficulty !== 'all' ? ' found' : ''}
            {completedInList > 0 ? (
              <>
                {' · '}
                <span className="font-semibold text-accent">{completedInList} done</span>
              </>
            ) : null}
          </p>
        )}
      </div>

      {/* Card */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {loading ? (
          <LoadingSkeleton />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Inbox className="h-6 w-6" />
            </span>
            <p className="text-base font-semibold text-foreground">
              {query.trim() || difficulty !== 'all' ? 'No matching questions' : 'No questions yet'}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {query.trim()
                ? `Nothing matches “${query.trim()}”${difficulty !== 'all' ? ` at ${difficulty} level` : ''}. Try a different search or filter.`
                : difficulty !== 'all'
                  ? `No ${difficulty}-level ${itemNoun}s right now. Try another difficulty.`
                  : 'No questions are available for this section yet. Please check back soon.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {/* Hidden on mobile so Title/Difficulty/Action fit 375px
                      without sideways scrolling. */}
                  <th className="hidden w-14 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell sm:px-6">
                    #
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Title
                  </th>
                  <th className="hidden px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">
                    Difficulty
                  </th>
                  <th className="hidden px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">
                    <abbr title="Average user band" className="no-underline">
                      Avg. band
                    </abbr>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:px-6">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item, index) => {
                  const href = `/${skillLower}question/${item.legacyId || item.id}`;
                  const isDone = completedSlugs.has(item.id);
                  // Whole row navigates. The inner links stay for keyboard
                  // access and middle-click; they stopPropagation so a click
                  // on them doesn't also fire the row handler.
                  const onRowClick = (e) => {
                    if (e.defaultPrevented) return;
                    if (e.metaKey || e.ctrlKey || e.shiftKey) {
                      window.open(href, '_blank', 'noopener');
                    } else {
                      router.push(href);
                    }
                  };
                  return (
                    <tr
                      key={item.id}
                      onClick={onRowClick}
                      data-analytics-id="practice_table_row"
                      data-analytics-label={`Open ${skillLower} practice`}
                      data-analytics-skill={skillLower}
                      data-analytics-slug={String(item.legacyId || item.id)}
                      data-completed={isDone ? 'true' : undefined}
                      className={cn(
                        'group cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-secondary/60',
                        isDone && 'bg-accent/5'
                      )}
                    >
                      <td className="hidden px-4 py-4 align-middle text-sm font-medium tabular-nums text-muted-foreground sm:table-cell sm:px-6">
                        {start + index + 1}
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <NextLink
                            href={href}
                            onClick={(e) => e.stopPropagation()}
                            className="text-sm font-semibold text-foreground no-underline transition-colors hover:text-accent"
                          >
                            {item.title}
                          </NextLink>
                          {isDone ? <CompletedTag /> : null}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 md:hidden">
                          <span className="sm:hidden">
                            <DifficultyBadge difficulty={item.difficulty} />
                          </span>
                          <AverageUserBand item={item} />
                        </div>
                      </td>
                      <td className="hidden px-4 py-4 align-middle sm:table-cell">
                        <DifficultyBadge difficulty={item.difficulty} />
                      </td>
                      <td className="hidden px-4 py-4 align-middle md:table-cell">
                        <AverageUserBand item={item} />
                      </td>
                      <td className="px-4 py-4 text-right align-middle sm:px-6">
                        <Button asChild size="sm" variant="ghost" className="text-accent hover:text-accent">
                          <NextLink
                            href={href}
                            onClick={(e) => e.stopPropagation()}
                            className="no-underline"
                          >
                            Practise
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                          </NextLink>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goTo(page - 1)}
            disabled={page === 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Previous</span>
          </Button>
          {pageNumbers.map((n) => (
            <Button
              key={n}
              variant={n === page ? 'default' : 'ghost'}
              size="sm"
              onClick={() => goTo(n)}
              aria-current={n === page ? 'page' : undefined}
              className="min-w-9 tabular-nums"
            >
              {n}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goTo(page + 1)}
            disabled={page === totalPages}
            aria-label="Next page"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      <AdUnit className="mt-10" />
    </div>
  );
};

export default DataTable;
