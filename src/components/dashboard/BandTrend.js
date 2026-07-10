// src/components/dashboard/BandTrend.js
// Dependency-free band-trend visualization. Renders a lightweight inline SVG
// sparkline (band 0..9 on the y-axis, attempts in chronological order on the
// x-axis) plus per-skill avg / best summaries. No charting library.

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { SKILL_META, SKILL_ORDER, formatBand } from './utils';

const BAND_MAX = 9;
const W = 260; // viewBox width
const H = 72; // viewBox height (plot area)
const PAD_X = 6;
const PAD_Y = 6;

// Map a (index, band) pair to SVG coordinates within the padded plot area.
function point(i, band, count) {
  const usableW = W - PAD_X * 2;
  const usableH = H - PAD_Y * 2;
  // A single point sits centered; otherwise spread evenly across the width.
  const x = count <= 1 ? W / 2 : PAD_X + (usableW * i) / (count - 1);
  const y = PAD_Y + usableH * (1 - band / BAND_MAX);
  return [x, y];
}

function Sparkline({ series }) {
  const count = series.length;
  const coords = series.map((band, i) => point(i, band, count));
  const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  // Area fill under the line for a subtle emerald wash.
  const areaPath =
    count > 1
      ? `${linePath} L ${coords[count - 1][0].toFixed(1)} ${H - PAD_Y} L ${coords[0][0].toFixed(1)} ${H - PAD_Y} Z`
      : '';

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-20 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Band trend across ${count} attempt${count === 1 ? '' : 's'}`}
    >
      {/* Reference gridlines at band 5 and 7 (typical targets). */}
      {[5, 7].map((b) => {
        const y = PAD_Y + (H - PAD_Y * 2) * (1 - b / BAND_MAX);
        return (
          <line
            key={b}
            x1={PAD_X}
            x2={W - PAD_X}
            y1={y}
            y2={y}
            className="stroke-border"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        );
      })}

      {areaPath && <path d={areaPath} className="fill-accent/10" stroke="none" />}
      {count > 1 && (
        <path d={linePath} className="stroke-accent" strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      )}
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={count === 1 ? 4 : 3} className="fill-accent" />
      ))}
    </svg>
  );
}

function TrendCard({ skillKey, stats }) {
  const meta = SKILL_META[skillKey];
  const Icon = meta.icon;
  const hasSeries = stats.series.length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-accent" />
            {meta.label}
          </span>
          <Badge variant="emerald">{stats.count} attempt{stats.count === 1 ? '' : 's'}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasSeries ? (
          <>
            <Sparkline series={stats.series} />
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Avg <span className="font-semibold text-foreground">{formatBand(stats.avg)}</span>
              </span>
              <span className="text-muted-foreground">
                Best <span className="font-semibold text-accent">{formatBand(stats.best)}</span>
              </span>
            </div>
          </>
        ) : (
          <div className="flex h-20 items-center justify-center rounded-md bg-secondary/50 text-sm text-muted-foreground">
            No {meta.label.toLowerCase()} attempts yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function BandTrend({ skills }) {
  return (
    <section aria-labelledby="trends-heading">
      <h2 id="trends-heading" className="mb-4 text-lg font-semibold tracking-tight text-foreground">
        Band trend by skill
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SKILL_ORDER.map((key) => (
          <TrendCard key={key} skillKey={key} stats={skills[key]} />
        ))}
      </div>
    </section>
  );
}
