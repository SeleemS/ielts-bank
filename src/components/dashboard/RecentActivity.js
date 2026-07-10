// src/components/dashboard/RecentActivity.js
// Merged feed of the newest reading/listening attempts and writing scores.
// Each row: passage/prompt title (linked to its page), a skill badge, the
// band + auto-score detail, and the date.

import * as React from 'react';
import NextLink from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { SKILL_META, formatBand, formatDate } from './utils';

const MAX_ROWS = 8;

function Title({ item }) {
  if (item.href) {
    return (
      <NextLink
        href={item.href}
        className="group inline-flex items-center gap-1 font-medium text-foreground no-underline hover:text-accent"
      >
        <span className="truncate">{item.title}</span>
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
      </NextLink>
    );
  }
  return <span className="truncate font-medium text-foreground">{item.title}</span>;
}

function Row({ item }) {
  const meta = SKILL_META[item.skill] || { label: item.skill };
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <Title item={item} />
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="font-medium">{meta.label}</Badge>
          {item.detail && <span>{item.detail}</span>}
          <span aria-hidden>·</span>
          <span>{formatDate(item.date)}</span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-lg font-bold tabular-nums text-foreground">{formatBand(item.band)}</div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">band</div>
      </div>
    </li>
  );
}

export default function RecentActivity({ items }) {
  const rows = items.slice(0, MAX_ROWS);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {rows.map((item) => (
            <Row key={item.id} item={item} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
