import * as React from 'react';
import NextLink from 'next/link';
import { Button } from '../../../components/ui/button';
import { Select } from '../../../components/ui/select';
import { getSupabase } from '../../../lib/supabase';

const LABELS = {
  taskResponse: 'Task response',
  taskAchievement: 'Task achievement',
  coherenceCohesion: 'Coherence & cohesion',
  lexicalResource: 'Lexical resource',
  grammaticalRange: 'Grammar',
  fluencyCoherence: 'Fluency & coherence',
};

function pretty(value) {
  return String(value || 'other').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function LearningInsights({ data, userId }) {
  const [target, setTarget] = React.useState(data.targetBand == null ? '' : String(data.targetBand));
  const [saved, setSaved] = React.useState(false);

  const saveTarget = async () => {
    const value = target === '' ? null : Number(target);
    const { error } = await getSupabase().from('users').update({ target_band: value }).eq('id', userId);
    if (!error) {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-bold text-foreground">Practice mistakes</h2>
        <p className="mt-1 text-sm text-muted-foreground">Retry the oldest unresolved weak spots first.</p>
        {data.mistakes.length ? (
          <ul className="mt-4 space-y-3">
            {data.mistakes.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="text-xs capitalize text-muted-foreground">{item.wrong} mistake{item.wrong === 1 ? '' : 's'} · {item.skill}</p>
                </div>
                {item.href ? <Button asChild size="sm" variant="outline"><NextLink href={item.href}>Retry</NextLink></Button> : null}
              </li>
            ))}
          </ul>
        ) : <p className="mt-4 text-sm text-muted-foreground">No recorded mistakes yet.</p>}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-lg font-bold text-foreground">Accuracy by question type</h2><p className="mt-1 text-sm text-muted-foreground">Lowest accuracy appears first.</p></div>
          <div className="rounded-lg bg-accent/10 px-3 py-2 text-center"><div className="text-2xl font-extrabold text-accent">{data.streak}</div><div className="text-[10px] font-bold uppercase text-muted-foreground">day streak</div></div>
        </div>
        <div className="mt-4 space-y-3">
          {data.typeAccuracy.slice(0, 8).map((item) => (
            <div key={item.type}>
              <div className="mb-1 flex justify-between text-xs"><span className="font-medium text-foreground">{pretty(item.type)}</span><span className="text-muted-foreground">{item.correct}/{item.total} · {item.percentage}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-accent" style={{ width: `${item.percentage}%` }} /></div>
            </div>
          ))}
          {!data.typeAccuracy.length ? <p className="text-sm text-muted-foreground">Submit a Reading or Listening attempt to see this breakdown.</p> : null}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-bold text-foreground">Writing & speaking criteria</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {Object.entries(data.criteria).map(([key, bands]) => {
            const latest = bands.at(-1);
            const previous = bands.at(-2);
            const delta = previous == null ? null : latest - previous;
            return <div key={key} className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">{LABELS[key] || pretty(key)}</p><p className="mt-1 text-xl font-bold">{latest.toFixed(1)} {delta != null ? <span className={delta >= 0 ? 'text-xs text-accent' : 'text-xs text-destructive'}>{delta >= 0 ? '+' : ''}{delta.toFixed(1)}</span> : null}</p></div>;
          })}
          {!Object.keys(data.criteria).length ? <p className="text-sm text-muted-foreground">AI-scored practice will show criterion trends here.</p> : null}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-bold text-foreground">Target band</h2>
        <p className="mt-1 text-sm text-muted-foreground">Set the score you are working toward.</p>
        <div className="mt-4 flex gap-3">
          <Select value={target} onChange={(event) => setTarget(event.target.value)} aria-label="Target IELTS band">
            <option value="">Not set</option>
            {Array.from({ length: 13 }, (_, index) => 3 + index * 0.5).map((band) => <option key={band} value={band}>{band.toFixed(1)}</option>)}
          </Select>
          <Button onClick={saveTarget}>{saved ? 'Saved' : 'Save'}</Button>
        </div>
      </section>
    </div>
  );
}
