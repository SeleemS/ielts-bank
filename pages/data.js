import * as React from 'react';
import Head from 'next/head';
import { DM_Sans } from 'next/font/google';
import { T, fmtNum, fmtMoney, countryName, flagEmoji } from '../src/components/datadash/theme';
import { Panel, Tabs, SortToggle, RankedList, LiveDot } from '../src/components/datadash/primitives';
import KpiStrip from '../src/components/datadash/KpiStrip';
import ComboChart from '../src/components/datadash/ComboChart';
import BreakdownPanel from '../src/components/datadash/BreakdownPanel';
import FlatMap from '../src/components/datadash/FlatMap';
import GlobeView from '../src/components/datadash/GlobeView';
import InsightsPanel from '../src/components/datadash/InsightsPanel';

// Private analytics dashboard — DataFast-spec redesign (Jul 2026).
// Password-gated, noindex, absent from sitemap/telemetry. Single-column stack
// inside a faux browser window: control header → KPI strip → combined
// revenue/visitors chart → 2×2 breakdown grid, plus two floating action
// buttons (live globe, insights).

const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-dm' });

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: 'all', label: 'All time' },
];

export async function getServerSideProps({ res }) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return { props: {} };
}

function useDashboard() {
  const [authed, setAuthed] = React.useState(null);
  const [range, setRange] = React.useState('30');
  const [offset, setOffset] = React.useState(0);
  const [bucket, setBucket] = React.useState('auto');
  const [overview, setOverview] = React.useState(null);
  const [realtime, setRealtime] = React.useState(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const loadOverview = React.useCallback(async (r = range, o = offset, b = bucket) => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams({ range: r, offset: String(o) });
      if (b !== 'auto') params.set('bucket', b);
      const res = await fetch(`/api/data/overview?${params}`);
      if (res.status === 401) return setAuthed(false);
      if (!res.ok) return;
      setOverview(await res.json());
      setAuthed(true);
    } finally {
      setRefreshing(false);
    }
  }, [range, offset, bucket]);

  const loadRealtime = React.useCallback(async () => {
    const res = await fetch('/api/data/realtime');
    if (res.status === 401) return setAuthed(false);
    if (!res.ok) return;
    setRealtime(await res.json());
    setAuthed(true);
  }, []);

  React.useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  React.useEffect(() => {
    if (authed === false) return undefined;
    loadRealtime();
    const live = setInterval(loadRealtime, 15000);
    const hist = setInterval(() => loadOverview(), 60000);
    return () => {
      clearInterval(live);
      clearInterval(hist);
    };
  }, [authed, loadOverview, loadRealtime]);

  return {
    authed, setAuthed, range, setRange, offset, setOffset, bucket, setBucket,
    overview, realtime, refreshing, loadOverview, loadRealtime,
  };
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
      <form onSubmit={submit} className="w-full max-w-xs rounded-2xl border p-6"
        style={{ background: T.panel, borderColor: T.border }}>
        <div className="mb-1 text-[15px] font-bold" style={{ color: T.ink }}>
          <span style={{ color: T.accent }}>{'</>'}</span> ielts-bank.com · data
        </div>
        <p className="mb-4 text-[12px]" style={{ color: T.muted }}>Private dashboard. Enter the access password.</p>
        <input
          type="password" value={password} onChange={(evt) => setPassword(evt.target.value)} autoFocus
          placeholder="Password"
          className="mb-3 w-full rounded-lg border px-3 py-2 text-[13px] outline-none"
          style={{ background: T.canvas, borderColor: T.border, color: T.ink }}
        />
        {error ? <p className="mb-3 text-[12px]" style={{ color: T.down }}>{error}</p> : null}
        <button type="submit" disabled={busy || !password}
          className="w-full rounded-lg py-2 text-[13px] font-bold disabled:opacity-50"
          style={{ background: T.accent, color: '#0B0E13' }}>
          {busy ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </div>
  );
}

function Dropdown({ label, items, onSelect, width = 170 }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const close = (evt) => {
      if (!ref.current?.contains(evt.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold"
        style={{ borderColor: T.border, background: T.panel, color: T.ink }}>
        {label} <span style={{ color: T.faint }}>▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 overflow-hidden rounded-lg border py-1"
          style={{ background: T.panelHover, borderColor: T.border, width }}>
          {items.map((item) => (
            <button key={item.key} disabled={item.disabled}
              onClick={() => { onSelect(item.key); setOpen(false); }}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] font-medium disabled:opacity-40"
              style={{ color: item.active ? T.ink : T.muted }}>
              {item.label}
              {item.active ? <span className="text-[14px] font-bold" style={{ color: T.ink }}>✓</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CountryPanel({ countries, activeCountries }) {
  const [tab, setTab] = React.useState('map');
  const [sort, setSort] = React.useState('visitors');
  const rows = React.useMemo(() => {
    const list = (countries || []).map((row) => ({
      label: countryName(row.c),
      icon: flagEmoji(row.c),
      value: row.engaged ?? row.visitors,
      revenue: row.revenue_minor || 0,
    }));
    if (sort === 'revenue') list.sort((a, b) => b.revenue - a.revenue);
    else list.sort((a, b) => b.value - a.value);
    return list;
  }, [countries, sort]);

  return (
    <Panel className="flex flex-col p-3.5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Tabs
          tabs={[{ key: 'map', label: 'Map' }, { key: 'country', label: 'Country' }]}
          active={tab}
          onChange={setTab}
        />
        <SortToggle mode={sort} onChange={setSort} hasRevenue={tab === 'country' && rows.some((r) => r.revenue > 0)} />
      </div>
      {tab === 'map' ? (
        <FlatMap countries={countries} activeCountries={activeCountries} />
      ) : (
        <RankedList rows={rows} maxRows={9} />
      )}
    </Panel>
  );
}

function rangeButtonLabel(range, offset, overview) {
  if (offset === 0) return RANGES.find((r) => r.key === range)?.label || range;
  if (!overview?.from) return `${offset} back`;
  const fmt = (iso) => new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(overview.from)} – ${fmt(overview.to)}`;
}

export default function DataDashboard() {
  const dash = useDashboard();
  const { authed, overview, realtime, refreshing } = dash;
  const data = overview?.data;
  const live = realtime?.data;
  const [showGlobe, setShowGlobe] = React.useState(false);
  const [showInsights, setShowInsights] = React.useState(false);

  const logout = async () => {
    await fetch('/api/data/login', { method: 'DELETE' });
    dash.setAuthed(false);
  };

  const money = (row) => ({ label: row.label, value: row.visitors, revenue: row.revenue_minor || 0 });
  const plain = (row) => ({ label: row.label, value: row.visitors });
  const breakdowns = data?.breakdowns || {};
  const showDeltas = dash.range !== 'all' && (data?.prev_totals?.visitors || 0) > 0;

  return (
    <div className={`${dmSans.variable} min-h-screen`}
      style={{ background: T.space, color: T.ink, fontFamily: 'var(--font-dm), ui-sans-serif, system-ui, sans-serif' }}>
      <Head>
        <title>Data · IELTS Bank</title>
        <meta name="robots" content="noindex, nofollow, noarchive" />
      </Head>

      {authed === null && (
        <div className="flex min-h-screen items-center justify-center text-[13px]" style={{ color: T.faint }}>
          Loading…
        </div>
      )}
      {authed === false && (
        <LoginGate onSuccess={() => { dash.setAuthed(true); dash.loadOverview(); dash.loadRealtime(); }} />
      )}

      {authed && (
        <main className="mx-auto max-w-[1180px] px-3 py-4 md:px-5 md:py-6">
          {/* Faux browser window chrome */}
          <div className="overflow-hidden rounded-2xl border" style={{ background: T.canvas, borderColor: T.border }}>
            <div className="relative flex items-center px-4 py-2.5" style={{ borderBottom: `1px solid ${T.border}` }}>
              <div className="flex items-center gap-1.5">
                {['#C96A6A', '#E0B45C', '#4EA67A'].map((dot) => (
                  <span key={dot} className="h-2.5 w-2.5 rounded-full" style={{ background: dot }} />
                ))}
              </div>
              <div className="absolute left-1/2 -translate-x-1/2 text-[11px]" style={{ color: T.faint }}>
                https://ielts-bank.com/<span className="font-bold" style={{ color: T.muted }}>data</span>
              </div>
              <button onClick={logout} title="Sign out" className="ml-auto text-[11px]" style={{ color: T.faint }}>
                sign out ↗
              </button>
            </div>

            <div className="space-y-3.5 p-3.5 md:p-4">
              {/* Control header */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-bold"
                  style={{ borderColor: T.border, background: T.panel, color: T.ink }}>
                  <span style={{ color: T.accent }}>{'</>'}</span> ielts-bank.com
                </span>
                <div className="flex items-center overflow-hidden rounded-lg border"
                  style={{ borderColor: T.border, background: T.panel }}>
                  <button onClick={() => dash.setOffset(dash.offset + 1)} disabled={dash.range === 'all'}
                    className="px-2 py-1.5 text-[12px] disabled:opacity-30" style={{ color: T.muted }} title="Previous period">
                    ‹
                  </button>
                  <Dropdown
                    label={rangeButtonLabel(dash.range, dash.offset, overview)}
                    items={RANGES.map((r) => ({ key: r.key, label: r.label, active: dash.range === r.key }))}
                    onSelect={(key) => { dash.setRange(key); dash.setOffset(0); }}
                  />
                  <button onClick={() => dash.setOffset(Math.max(0, dash.offset - 1))}
                    disabled={dash.offset === 0}
                    className="px-2 py-1.5 text-[12px] disabled:opacity-30" style={{ color: T.muted }} title="Next period">
                    ›
                  </button>
                </div>
                <Dropdown
                  label={overview?.bucket === 'hour' ? 'Hourly' : 'Daily'}
                  width={130}
                  items={[
                    { key: 'day', label: 'Daily', active: overview?.bucket === 'day' },
                    { key: 'hour', label: 'Hourly', active: overview?.bucket === 'hour', disabled: !['today', '7'].includes(dash.range) },
                  ]}
                  onSelect={(key) => dash.setBucket(key)}
                />
                <button onClick={() => { dash.loadOverview(); dash.loadRealtime(); }} title="Refresh"
                  className="rounded-lg border px-2.5 py-1.5 text-[12px]"
                  style={{ borderColor: T.border, background: T.panel, color: refreshing ? T.accent : T.muted }}>
                  ⟳
                </button>
                <span className="ml-auto flex items-center gap-1.5 text-[11px]" style={{ color: T.faint }}>
                  <LiveDot size={6} /> live · 15s
                </span>
              </div>

              <div style={{ opacity: refreshing && data ? 0.55 : 1, transition: 'opacity 200ms' }}>
                {/* KPI strip */}
                <KpiStrip totals={data?.totals} prev={data?.prev_totals} activeNow={live?.active_now} showDeltas={showDeltas} />

                {/* Combined chart */}
                <Panel className="mt-3.5 p-2">
                  <ComboChart series={data?.series} bucket={overview?.bucket} />
                </Panel>

                {/* 2×2 breakdown grid */}
                <div className="mt-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
                  <BreakdownPanel
                    tabs={[
                      { key: 'channel', label: 'Channel', rows: (breakdowns.channels || []).map(money) },
                      { key: 'referrer', label: 'Referrer', rows: (breakdowns.referrers || []).map(money) },
                      { key: 'campaign', label: 'Campaign', rows: (breakdowns.campaigns || []).map(plain), empty: 'No UTM campaigns yet' },
                    ]}
                  />
                  <CountryPanel countries={data?.countries} activeCountries={live?.active_countries} />
                  <BreakdownPanel
                    tabs={[
                      { key: 'pages', label: 'Pages', rows: (breakdowns.pages_top || []).map(plain) },
                      { key: 'entry', label: 'Entry pages', rows: (breakdowns.pages_entry || []).map(plain) },
                      { key: 'exit', label: 'Exit pages', rows: (breakdowns.pages_exit || []).map(plain) },
                    ]}
                  />
                  <BreakdownPanel
                    tabs={[
                      { key: 'browser', label: 'Browser', rows: (breakdowns.browsers || []).map(plain), empty: 'Capturing from Jul 24 — check back tomorrow' },
                      { key: 'os', label: 'OS', rows: (breakdowns.oses || []).map(plain), empty: 'Capturing from Jul 24' },
                      { key: 'device', label: 'Device', rows: (breakdowns.devices || []).map(plain), empty: 'Capturing from Jul 24' },
                    ]}
                  />
                </div>
              </div>

              <p className="pb-1 pt-1 text-center text-[10px]" style={{ color: T.faint }}>
                {fmtNum(data?.totals?.engaged_visitors || 0)} engaged of {fmtNum(data?.totals?.visitors || 0)} visitors ·
                revenue {fmtMoney(data?.totals?.revenue_minor || 0)} · bots filtered at ingest · times UTC
              </p>
            </div>
          </div>

          {/* Floating action buttons */}
          <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 gap-2">
            <button onClick={() => setShowGlobe(true)} title="Real-time globe"
              className="flex h-10 w-10 items-center justify-center rounded-full border text-[17px] shadow-xl"
              style={{ background: T.chrome, borderColor: T.border }}>
              🌐
            </button>
            <button onClick={() => setShowInsights(true)} title="Insights"
              className="flex h-10 w-10 items-center justify-center rounded-full border text-[17px] shadow-xl"
              style={{ background: T.chrome, borderColor: T.border }}>
              💡
            </button>
          </div>

          {showGlobe && (
            <GlobeView realtime={realtime} countries={data?.countries} onClose={() => setShowGlobe(false)} />
          )}
          {showInsights && <InsightsPanel data={data} onClose={() => setShowInsights(false)} />}
        </main>
      )}
    </div>
  );
}
