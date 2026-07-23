import * as React from 'react';
import { T, fmtNum, fmtMoney, fmtDurShort, countryName, flagEmoji, pct } from './theme';

// The lightbulb FAB's overlay: plain-language insights computed client-side
// from the overview payload (funnel, areas, heatmap kept in the RPC for this).
export default function InsightsPanel({ data, onClose }) {
  const insights = React.useMemo(() => {
    if (!data) return [];
    const out = [];
    const t = data.totals || {};
    const funnel = data.funnel || {};
    const channels = data.breakdowns?.channels || [];
    const areas = data.areas || [];
    const countries = data.countries || [];
    const heatmap = data.hour_heatmap || [];

    if (t.visitors) {
      out.push({
        icon: '💰',
        text: `${fmtNum(t.purchasers || 0)} of ${fmtNum(t.visitors)} visitors became customers (${pct(t.purchasers || 0, t.visitors)}) for ${fmtMoney(t.revenue_minor)} in revenue.`,
      });
    }
    const bestChannel = [...channels].sort(
      (a, b) => (b.signups / Math.max(1, b.visitors)) - (a.signups / Math.max(1, a.visitors))
    )[0];
    if (bestChannel?.signups) {
      out.push({
        icon: '🧲',
        text: `${bestChannel.label} converts best: ${pct(bestChannel.signups, bestChannel.visitors)} of its ${fmtNum(bestChannel.visitors)} engaged visitors signed up.`,
      });
    }
    if (funnel.saw_gate) {
      out.push({
        icon: '🚧',
        text: `${fmtNum(funnel.saw_gate)} visitors hit a paywall gate → ${fmtNum(funnel.upgrade_click || 0)} clicked upgrade → ${fmtNum(funnel.checkout || 0)} reached checkout → ${fmtNum(funnel.purchased || 0)} paid.`,
      });
    }
    if (areas[0]) {
      const top = areas.slice(0, 3).map((area) => `${area.area} ${fmtDurShort(area.secs)}`).join(' · ');
      out.push({ icon: '⏱', text: `Where engaged time goes: ${top}.` });
    }
    if (countries[0]) {
      const top = countries.slice(0, 3)
        .map((row) => `${flagEmoji(row.c)} ${countryName(row.c)} (${fmtNum(row.engaged ?? row.visitors)})`)
        .join(', ');
      out.push({ icon: '🌍', text: `Top engaged markets: ${top}.` });
    }
    if (heatmap.length) {
      const busiest = [...heatmap].sort((a, b) => b.events - a.events)[0];
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      out.push({
        icon: '📅',
        text: `Busiest hour: ${days[busiest.dow - 1]} ${String(busiest.hour).padStart(2, '0')}:00 UTC (${fmtNum(busiest.events)} events).`,
      });
    }
    if (t.sessions_total) {
      out.push({
        icon: '🚪',
        text: `${pct(t.bounce_sessions || 0, t.sessions_total)} of sessions bounce (≤1 page); median engaged session runs ${fmtDurShort(t.median_session_secs)}.`,
      });
    }
    if (data.returning?.visitors) {
      out.push({
        icon: '🔁',
        text: `${pct(data.returning.returning, data.returning.visitors)} of this range's visitors had visited before.`,
      });
    }
    return out;
  }, [data]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(5,7,11,0.7)' }} onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border p-5"
        style={{ background: T.panel, borderColor: T.border }}
        onClick={(evt) => evt.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-extrabold" style={{ color: T.ink }}>💡 Insights</h2>
          <button onClick={onClose} className="text-[13px]" style={{ color: T.muted }}>✕</button>
        </div>
        <div className="space-y-2.5">
          {insights.map((insight, index) => (
            <div key={index} className="flex gap-2.5 rounded-lg border p-2.5 text-[13px] leading-snug"
              style={{ borderColor: T.divider, color: T.muted }}>
              <span>{insight.icon}</span>
              <span>{insight.text}</span>
            </div>
          ))}
          {!insights.length && <div className="text-[13px]" style={{ color: T.faint }}>No data in this range yet.</div>}
        </div>
      </div>
    </div>
  );
}
