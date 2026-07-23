import * as React from 'react';
import { T } from './theme';
import { Panel, Tabs, SortToggle, RankedList } from './primitives';

// One quadrant of the 2×2 breakdown grid (spec §4/§6): segmented tabs,
// right-aligned sort toggle, ranked dual-bar rows, centered DETAILS expander.
export default function BreakdownPanel({ tabs, valueFmt }) {
  const [active, setActive] = React.useState(tabs[0]?.key);
  const [sort, setSort] = React.useState('visitors');
  const [expanded, setExpanded] = React.useState(false);

  const tab = tabs.find((entry) => entry.key === active) || tabs[0];
  const rows = React.useMemo(() => {
    const list = [...(tab?.rows || [])];
    if (sort === 'revenue') list.sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
    else list.sort((a, b) => b.value - a.value);
    return list;
  }, [tab, sort]);
  const hasRevenue = rows.some((row) => row.revenue > 0);

  return (
    <Panel className="flex flex-col p-3.5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Tabs tabs={tabs} active={tab?.key} onChange={(key) => { setActive(key); setExpanded(false); }} />
        <SortToggle mode={sort} onChange={setSort} hasRevenue={hasRevenue} />
      </div>
      <div className="flex-1">
        <RankedList rows={rows} maxRows={expanded ? 12 : 5} valueFmt={tab?.valueFmt || valueFmt} emptyLabel={tab?.empty || 'No data yet'} />
      </div>
      {rows.length > 5 && (
        <button
          onClick={() => setExpanded((value) => !value)}
          className="mt-2.5 self-center rounded-md px-2 py-0.5 text-[10px] font-bold tracking-widest"
          style={{ color: T.faint }}
        >
          {expanded ? '˄ COLLAPSE' : '˅ DETAILS'}
        </button>
      )}
    </Panel>
  );
}
