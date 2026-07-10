// src/components/dashboard/StatsOverview.js
// High-level headline stats: total passages practised + average/best band per
// skill. Reading/Listening bands come from `attempts`, Writing from `scores`.

import * as React from 'react';
import { Activity } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { SKILL_META, SKILL_ORDER, formatBand } from './utils';

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-start gap-4 p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-2xl font-bold tracking-tight text-foreground">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function StatsOverview({ totalPractised, skills }) {
  return (
    <section aria-label="Progress summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={Activity}
        label="Passages practised"
        value={totalPractised}
        sub="Reading, Listening & Writing"
      />
      {SKILL_ORDER.map((key) => {
        const meta = SKILL_META[key];
        const stats = skills[key];
        return (
          <StatCard
            key={key}
            icon={meta.icon}
            label={`${meta.label} band`}
            value={formatBand(stats.avg)}
            sub={stats.best !== null ? `Best ${formatBand(stats.best)} · ${stats.count} attempt${stats.count === 1 ? '' : 's'}` : 'No attempts yet'}
          />
        );
      })}
    </section>
  );
}
