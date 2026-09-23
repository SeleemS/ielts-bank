import React, { useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import { ArrowRight, SlidersHorizontal } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  BAND_GROUPS,
  ESSAY_TASKS,
  QUESTION_TYPES,
  TOPIC_FAMILIES,
  formatBand,
  questionTypeLabel,
  taskLabel,
  topicLabel,
} from '../../../lib/essayTaxonomy';

// The filterable list on /ielts-essay-bank.
//
// CRAWLABILITY: every item is rendered as a real <a href> in the server HTML;
// filtering only toggles the `hidden` attribute on the client. A crawler (or a
// visitor without JavaScript) therefore sees and can follow the full bank — the
// filters are a convenience layered on top, never a gate in front of the links.
//
// Filter state mirrors to the query string (?task=&topic=&type=&band=) with
// history.replaceState so a filtered view can be shared, without a Next route
// change (the page is static; no refetch is needed).

const FILTER_KEYS = ['task', 'topic', 'type', 'band'];

function matches(item, filters) {
  if (filters.task && item.bucket !== filters.task) return false;
  if (filters.topic && !item.topics.includes(filters.topic)) return false;
  if (filters.type && item.type !== filters.type) return false;
  if (filters.band && item.bandGroup !== filters.band) return false;
  return true;
}

function FilterSelect({ id, label, value, onChange, children }) {
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-medium normal-case tracking-normal text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
      </select>
    </label>
  );
}

function BandPill({ band, group }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-bold',
        group === '6' && 'bg-amber-100 text-amber-900',
        group === '7' && 'bg-sky-100 text-sky-900',
        group === '8' && 'bg-emerald-100 text-emerald-900'
      )}
    >
      {band}
    </span>
  );
}

export default function EssayBankBrowser({ essays = [], catalogue = [] }) {
  // Authored comparison essays first (they are the unique part of the bank),
  // then the model answers from the practice pages.
  const items = useMemo(
    () => [
      ...essays.map((e) => ({
        key: `essay:${e.slug}`,
        href: `/ielts-essay-bank/${e.slug}`,
        title: e.title,
        bucket: e.bucket,
        topics: e.topics,
        type: e.type,
        bandGroup: e.bandGroup,
        bandLabel: `Band ${formatBand(e.band)}`,
        summary: e.opening,
        meta: `${e.wordCount} words · examiner comments`,
      })),
      ...catalogue.map((c) => ({
        key: `model:${c.slug}`,
        href: `/writingquestion/${c.slug}`,
        title: c.title,
        bucket: c.bucket,
        topics: c.topics,
        type: c.type,
        bandGroup: c.bandGroup,
        bandLabel: 'Band 8–9',
        summary: c.summary,
        meta: `Model answer${c.wordCount ? ` · ${c.wordCount} words` : ''} + practice`,
      })),
    ],
    [essays, catalogue]
  );

  const [filters, setFilters] = useState({ task: '', topic: '', type: '', band: '' });

  // Hydrate filters from the URL once, after mount (the server render always
  // shows the full, unfiltered list).
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const next = {};
      FILTER_KEYS.forEach((key) => {
        next[key] = params.get(key) || '';
      });
      if (FILTER_KEYS.some((key) => next[key])) setFilters((prev) => ({ ...prev, ...next }));
    } catch {
      /* no URL access — keep defaults */
    }
  }, []);

  const update = (key, value) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      // A question type belongs to one task; clear it when the task changes
      // to one it does not belong to.
      if (key === 'task' && next.type) {
        const typeTask = QUESTION_TYPES.find((t) => t.id === next.type)?.task;
        const taskFamily = value.startsWith('task2') ? 'task2' : value;
        if (value && typeTask !== taskFamily) next.type = '';
      }
      try {
        const params = new URLSearchParams();
        FILTER_KEYS.forEach((k) => next[k] && params.set(k, next[k]));
        const qs = params.toString();
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}#browse`);
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const visibleCount = items.filter((item) => matches(item, filters)).length;
  const active = FILTER_KEYS.some((key) => filters[key]);

  const typeGroups = [
    { label: 'Task 2 question types', task: 'task2' },
    { label: 'Task 1 Academic visuals', task: 'task1-academic' },
    { label: 'General Training letters', task: 'task1-general' },
  ].filter(
    (group) =>
      !filters.task ||
      group.task === (filters.task.startsWith('task2') ? 'task2' : filters.task)
  );

  return (
    <div>
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden="true" />
          Filter the essay bank
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect id="eb-task" label="Task" value={filters.task} onChange={(v) => update('task', v)}>
            <option value="">All tasks</option>
            {ESSAY_TASKS.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </FilterSelect>
          <FilterSelect id="eb-topic" label="Topic" value={filters.topic} onChange={(v) => update('topic', v)}>
            <option value="">All topics</option>
            {TOPIC_FAMILIES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </FilterSelect>
          <FilterSelect id="eb-type" label="Question type" value={filters.type} onChange={(v) => update('type', v)}>
            <option value="">All question types</option>
            {typeGroups.map((group) => (
              <optgroup key={group.task} label={group.label}>
                {QUESTION_TYPES.filter((t) => t.task === group.task).map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </optgroup>
            ))}
          </FilterSelect>
          <FilterSelect id="eb-band" label="Band" value={filters.band} onChange={(v) => update('band', v)}>
            <option value="">All bands</option>
            {BAND_GROUPS.map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </FilterSelect>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground" aria-live="polite">
          <span>
            Showing <strong className="text-foreground">{visibleCount}</strong> of {items.length} sample answers
          </span>
          {active ? (
            <button
              type="button"
              onClick={() => FILTER_KEYS.forEach((key) => update(key, ''))}
              className="font-semibold text-accent hover:text-accent/80"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      <ul className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.map((item) => (
          <li key={item.key} hidden={!matches(item, filters)}>
            <NextLink
              href={item.href}
              className="group flex h-full flex-col rounded-xl border border-border bg-card p-4 no-underline shadow-sm transition-colors hover:border-accent/50"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold leading-snug text-foreground group-hover:text-accent">
                  {item.title}
                </h3>
                <BandPill band={item.bandLabel} group={item.bandGroup} />
              </div>
              <p className="mt-1 text-xs font-medium text-muted-foreground">
                {taskLabel(item.bucket)} · {questionTypeLabel(item.type)} · {item.topics.map(topicLabel).join(', ')}
              </p>
              {item.summary ? (
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{item.summary}</p>
              ) : null}
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent">
                {item.meta}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </NextLink>
          </li>
        ))}
      </ul>
      {visibleCount === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No sample answers match every filter yet — try removing one.
        </p>
      ) : null}
    </div>
  );
}
