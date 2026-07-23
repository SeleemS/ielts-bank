import * as React from 'react';
import Head from 'next/head';
import { T, fmtNum, fmtDurShort, pct, countryName, flagEmoji } from '../src/components/datadash/theme';
import {
  Card,
  StatTile,
  HBarList,
  LivePulse,
} from '../src/components/datadash/primitives';
import WorldMap from '../src/components/datadash/WorldMap';
import TrafficChart from '../src/components/datadash/TrafficChart';
import HourHeatmap from '../src/components/datadash/HourHeatmap';
import Funnel from '../src/components/datadash/Funnel';
import LiveFeed from '../src/components/datadash/LiveFeed';

// Private analytics dashboard. Password-gated (see /api/data/login), noindex,
// and deliberately absent from the sitemap; /data is also excluded from
// first-party telemetry so the dashboard never pollutes its own numbers.

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: '7', label: '7 days' },
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
  { key: 'all', label: 'All time' },
];

const BUCKET_LABELS = ['<30s', '30s–3m', '3–10m', '10–30m', '30–60m', '>1h'];

export async function getServerSideProps({ res }) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return { props: {} };
}

function useDashboard() {
  const [authed, setAuthed] = React.useState(null); // null = checking
  const [range, setRange] = React.useState('7');
  const [overview, setOverview] = React.useState(null);
  const [realtime, setRealtime] = React.useState(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [tick, setTick] = React.useState(0);

  const loadOverview = React.useCallback(async (nextRange) => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/data/overview?range=${nextRange}`);
      if (res.status === 401) return setAuthed(false);
      if (!res.ok) return;
      setOverview(await res.json());
      setAuthed(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const loadRealtime = React.useCallback(async () => {
    const res = await fetch('/api/data/realtime');
    if (res.status === 401) return setAuthed(false);
    if (!res.ok) return;
    setRealtime(await res.json());
    setAuthed(true);
  }, []);

  React.useEffect(() => {
    loadOverview(range);
  }, [range, loadOverview]);

  React.useEffect(() => {
    if (authed === false) return undefined;
    loadRealtime();
    const feed = setInterval(loadRealtime, 15000);
    const hist = setInterval(() => loadOverview(range), 60000);
    const clock = setInterval(() => setTick((t) => t + 1), 5000);
    return () => {
      clearInterval(feed);
      clearInterval(hist);
      clearInterval(clock);
    };
  }, [authed, range, loadOverview, loadRealtime]);

  return { authed, setAuthed, range, setRange, overview, realtime, refreshing, tick, loadOverview, loadRealtime };
}

function LoginGate({ onSuccess }) {
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const submit = async (evt) => {
    evt.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/data/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) return onSuccess();
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Login failed.');
    } catch {
      setError('Login failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-xs rounded-2xl border p-6"
        style={{ background: T.surface, borderColor: T.border }}
      >
        <div className="mb-1 text-[15px] font-semibold" style={{ color: T.ink }}>
          IELTS Bank · Data
        </div>
        <p className="mb-4 text-[12px]" style={{ color: T.muted }}>
          Private dashboard. Enter the access password.
        </p>
        <input
          type="password"
          value={password}
          onChange={(evt) => setPassword(evt.target.value)}
          autoFocus
          placeholder="Password"
          className="mb-3 w-full rounded-lg border px-3 py-2 text-[13px] outline-none focus:ring-1"
          style={{ background: T.plane, borderColor: T.border, color: T.ink }}
        />
        {error ? (
          <p className="mb-3 text-[12px]" style={{ color: T.down }}>
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full rounded-lg py-2 text-[13px] font-semibold disabled:opacity-50"
          style={{ background: T.blue, color: '#fff' }}
        >
          {busy ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </div>
  );
}

function Delta({ current, previous, invert = false }) {
  if (!previous) return null;
  const diff = ((current - previous) / previous) * 100;
  if (!Number.isFinite(diff)) return null;
  const good = invert ? diff < 0 : diff >= 0;
  return { text: `${diff >= 0 ? '+' : ''}${Math.round(diff)}%`, good };
}

export default function DataDashboard() {
  const dash = useDashboard();
  const { authed, overview, realtime, refreshing, tick } = dash;

  const data = overview?.data;
  const live = realtime?.data;
  const totals = data?.totals || {};
  const prev = data?.prev_totals || {};
  const showDeltas = (prev.visitors || 0) > 0 && dash.range !== 'all';
  const rangeLabel = RANGES.find((r) => r.key === dash.range)?.label || '';
  const engagedSecs = (data?.areas || []).reduce((sum, area) => sum + (area.secs || 0), 0);

  const logout = async () => {
    await fetch('/api/data/login', { method: 'DELETE' });
    dash.setAuthed(false);
  };

  const deltaFor = (key) => (showDeltas ? Delta({ current: totals[key] || 0, previous: prev[key] || 0 }) : null);

  return (
    <div className="min-h-screen" style={{ background: T.plane, color: T.ink }}>
      <Head>
        <title>Data · IELTS Bank</title>
        <meta name="robots" content="noindex, nofollow, noarchive" />
      </Head>

      {authed === null && (
        <div className="flex min-h-screen items-center justify-center text-[13px]" style={{ color: T.muted }}>
          Loading…
        </div>
      )}
      {authed === false && <LoginGate onSuccess={() => { dash.setAuthed(true); dash.loadOverview(dash.range); dash.loadRealtime(); }} />}

      {authed && (
        <main className="mx-auto max-w-[1240px] px-4 py-5 md:px-6">
          {/* Header + the one filter row that scopes everything below it. */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="mr-auto">
              <h1 className="text-[17px] font-semibold tracking-tight">IELTS Bank · Mission Control</h1>
              <p className="text-[11px]" style={{ color: T.muted }}>
                First-party activity_events · updates live every 15s
              </p>
            </div>
            <div
              className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium"
              style={{ borderColor: T.border, background: T.surface }}
            >
              <LivePulse />
              <span style={{ color: T.ink }}>{live ? fmtNum(live.active_now) : '–'} online now</span>
            </div>
            <div
              className="flex overflow-hidden rounded-full border text-[12px]"
              style={{ borderColor: T.border, background: T.surface }}
            >
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => dash.setRange(r.key)}
                  className="px-3 py-1.5 font-medium transition-colors"
                  style={
                    dash.range === r.key
                      ? { background: T.blue, color: '#fff' }
                      : { color: T.ink2 }
                  }
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button onClick={logout} className="text-[11px] underline-offset-2 hover:underline" style={{ color: T.muted }}>
              Sign out
            </button>
          </div>

          <div style={{ opacity: refreshing && data ? 0.55 : 1, transition: 'opacity 200ms' }}>
            {/* KPI row */}
            <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatTile
                label="Online now"
                value={live ? fmtNum(live.active_now) : '–'}
                sub={live ? `${fmtNum(live.last_hour_visitors)} visitors last hour` : ' '}
              />
              <StatTile label={`Visitors · ${rangeLabel}`} value={fmtNum(totals.visitors)} delta={deltaFor('visitors')?.text} deltaGood={deltaFor('visitors')?.good} />
              <StatTile label="Engaged time" value={fmtDurShort(engagedSecs)} sub="active heartbeat time" />
              <StatTile label="Practice submits" value={fmtNum(totals.submits)} delta={deltaFor('submits')?.text} deltaGood={deltaFor('submits')?.good} />
              <StatTile label="Sign-ups" value={fmtNum(totals.signups)} delta={deltaFor('signups')?.text} deltaGood={deltaFor('signups')?.good} />
              <StatTile
                label="Purchases"
                value={fmtNum(totals.purchases)}
                delta={deltaFor('purchases')?.text}
                deltaGood={deltaFor('purchases')?.good}
                sub={totals.revenue_minor > 0 ? `$${(totals.revenue_minor / 100).toFixed(0)} gross` : undefined}
              />
            </div>

            {/* World + live column */}
            <div className="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
              <Card
                title="AROUND THE WORLD"
                subtitle={`Visitors by country · ${rangeLabel.toLowerCase()} · pulses are sessions active in the last 5 minutes`}
                className="xl:col-span-2"
              >
                <WorldMap countries={data?.countries} activeCountries={live?.active_countries} />
              </Card>
              <Card
                title="HAPPENING NOW"
                subtitle="Latest activity · heartbeats & raw clicks filtered"
                right={
                  live?.active_countries?.length ? (
                    <div className="flex max-w-[150px] flex-wrap justify-end gap-1">
                      {live.active_countries.slice(0, 4).map((c) => (
                        <span
                          key={c.c}
                          title={countryName(c.c)}
                          className="rounded-full border px-1.5 py-0.5 text-[10px]"
                          style={{ borderColor: T.border, color: T.ink2 }}
                        >
                          {flagEmoji(c.c)} {c.n}
                        </span>
                      ))}
                    </div>
                  ) : null
                }
              >
                <LiveFeed feed={live?.feed} tick={tick} />
              </Card>
            </div>

            {/* Traffic + funnel */}
            <div className="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
              <Card
                title="TRAFFIC OVER TIME"
                subtitle={overview?.bucket === 'hour' ? 'Hourly · UTC' : 'Daily · UTC'}
                className="xl:col-span-7"
              >
                <TrafficChart series={data?.series} bucket={overview?.bucket} />
              </Card>
              <Card
                title="CONVERSION FUNNEL"
                subtitle="Distinct visitors reaching each stage"
                className="xl:col-span-5"
              >
                <Funnel funnel={data?.funnel} />
              </Card>
            </div>

            {/* Rhythm + time allocation */}
            <div className="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
              <Card title="WEEKLY RHYTHM" subtitle="Events by hour of week" className="xl:col-span-7">
                <HourHeatmap cells={data?.hour_heatmap} />
              </Card>
              <Card
                title="WHERE TIME GOES"
                subtitle="Engaged time by section (60s heartbeats)"
                className="xl:col-span-5"
              >
                <HBarList
                  rows={(data?.areas || []).map((area) => ({
                    label: area.area,
                    value: area.secs,
                    sub: area.sessions,
                  }))}
                  valueFmt={fmtDurShort}
                  subFmt={(sessions) => `${fmtNum(sessions)} sess.`}
                  maxRows={9}
                />
              </Card>
            </div>

            {/* Countries / acquisition / sessions */}
            <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12">
              <Card title="TOP COUNTRIES" subtitle="By visitors · sign-ups alongside" className="xl:col-span-4">
                <HBarList
                  rows={(data?.countries || []).slice(0, 9).map((row) => ({
                    label: countryName(row.c),
                    icon: flagEmoji(row.c),
                    value: row.visitors,
                    sub: row.signups,
                  }))}
                  subFmt={(signups) => (signups ? `${signups} ↑` : '')}
                  maxRows={9}
                />
              </Card>
              <Card title="ACQUISITION" subtitle="First-touch source → sign-ups" className="xl:col-span-4">
                <HBarList
                  rows={(data?.acquisition || []).map((row) => ({
                    label: row.source,
                    value: row.visitors,
                    sub: row.signups,
                  }))}
                  subFmt={(signups, row) => `${pct(signups, row.value)} convert`}
                  maxRows={8}
                />
              </Card>
              <Card
                title="SESSION LENGTH"
                subtitle={
                  data?.returning
                    ? `${pct(data.returning.returning, data.returning.visitors)} returning visitors`
                    : undefined
                }
                className="xl:col-span-4"
              >
                <HBarList
                  rows={(data?.session_buckets || []).map((bucket) => ({
                    label: BUCKET_LABELS[Number(bucket.bucket)] || bucket.bucket,
                    value: bucket.sessions,
                  }))}
                  maxRows={6}
                />
              </Card>
            </div>

            {/* Top content */}
            <Card title="TOP CONTENT" subtitle="Page views in range">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left" style={{ color: T.muted }}>
                      <th className="py-1.5 pr-2 font-medium">Path</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Views</th>
                      <th className="py-1.5 text-right font-medium">Visitors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.top_pages || []).map((page) => (
                      <tr key={page.path} className="border-t" style={{ borderColor: T.grid }}>
                        <td className="max-w-[440px] truncate py-1.5 pr-2" style={{ color: T.ink2 }}>
                          {page.path}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums" style={{ color: T.ink }}>
                          {fmtNum(page.views)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums" style={{ color: T.ink2 }}>
                          {fmtNum(page.visitors)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <p className="mt-4 text-center text-[10px]" style={{ color: T.muted }}>
              {overview?.fixture ? 'FIXTURE DATA (dev) · ' : ''}
              Range: {rangeLabel} · logins deduped by session · all times UTC
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
