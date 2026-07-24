import * as React from 'react';
import { T, countryName, flagEmoji, timeAgo } from './theme';
import { LiveDot } from './primitives';
import { aliasFor } from './aliases';
import GlobeStage, { Starfield, withDebugPins } from './GlobeStage';
import FlatMap from './FlatMap';

const GOAL_EVENTS = new Set([
  'checkout_start', 'signup_start', 'login', 'writing_submit', 'speaking_submit',
  'attempt_submit', 'paywall_upgrade_click',
]);

const KEY_EVENTS = {
  purchase_success: { label: '💰 PAYMENT', color: T.accent },
  subscription_activated: { label: '💰 PAYMENT', color: T.accent },
  signup_verified: { label: '🎉 SIGN-UP', color: T.live },
};

function ToolbarButton({ title, onClick, active, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded-full border text-[13px] transition-colors"
      style={{
        borderColor: T.border,
        background: active ? T.divider : 'transparent',
        color: active ? T.ink : T.muted,
      }}
    >
      {children}
    </button>
  );
}

function EventIcon({ goal }) {
  return goal ? (
    <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden>
      <circle cx="7" cy="7" r="6" fill="none" stroke={T.accent} strokeWidth="1.4" />
      <circle cx="7" cy="7" r="2.4" fill={T.accent} />
    </svg>
  ) : (
    <svg width="13" height="13" viewBox="0 0 16 12" aria-hidden>
      <path d="M8 1C4 1 1.4 4.2 1 6c.4 1.8 3 5 7 5s6.6-3.2 7-5c-.4-1.8-3-5-7-5z" fill="none" stroke={T.faint} strokeWidth="1.3" />
      <circle cx="8" cy="6" r="2.2" fill={T.faint} />
    </svg>
  );
}

const VERB = {
  page_view: 'visited',
  question_open: 'opened',
  question_answer: 'answered in',
  audio_play: 'played audio in',
  login: 'signed in at',
  signup_verified: 'joined from',
  purchase_success: 'PURCHASED at',
  subscription_activated: 'activated a plan',
  checkout_start: 'started checkout at',
};

function FeedRow({ item, isNew }) {
  const alias = aliasFor(item.vh || item.country || 'anon');
  const goal = GOAL_EVENTS.has(item.event);
  const key = KEY_EVENTS[item.event];
  const verb = VERB[item.event] || `performed ${item.event.replaceAll('_', ' ')} at`;
  const target = item.slug || item.path || '/';
  return (
    <div
      className="relative flex items-start gap-2 rounded-lg px-2 py-1.5"
      style={key ? { background: `${key.color}1a`, borderLeft: `2px solid ${key.color}` } : undefined}
    >
      <span className="mt-0.5"><EventIcon goal={goal} /></span>
      <div className="min-w-0 flex-1 text-[12px] leading-snug">
        <span className="font-bold" style={{ color: item.name ? T.ink : alias.color }}>
          {item.name || alias.name}
        </span>
        <span style={{ color: T.muted }}> from {flagEmoji(item.country)} </span>
        <span style={{ color: goal ? T.ink : T.muted }}>{verb} </span>
        <span className="break-all font-mono text-[11px]" style={{ color: T.ink }}>
          {String(target).slice(0, 42)}
        </span>
        <div className="text-[10px]" style={{ color: T.faint }}>{timeAgo(item.at)}</div>
      </div>
      {key && (
        <span className="mt-0.5 shrink-0 rounded px-1 py-px text-[9px] font-extrabold tracking-wide"
          style={{ background: `${key.color}26`, color: key.color }}>
          {key.label}
        </span>
      )}
      {isNew && <span className="absolute right-1.5 top-2 h-1.5 w-1.5 rounded-full" style={{ background: T.accent }} />}
    </div>
  );
}

// Full-screen immersive view: the shared GlobeStage over a starfield with a
// live summary panel, anonymized event feed, and toolbar (pause / 2D map /
// fullscreen / close).
export default function GlobeView({ realtime, countries, onClose }) {
  const overlayRef = React.useRef(null);
  const [paused, setPaused] = React.useState(false);
  const [mode2d, setMode2d] = React.useState(false);
  const [size, setSize] = React.useState(700);
  const seenRef = React.useRef(new Set());

  const active = React.useMemo(() => withDebugPins(realtime?.data?.active), [realtime]);
  const feed = React.useMemo(() => realtime?.data?.feed || [], [realtime]);

  const newKeys = React.useMemo(() => {
    const fresh = new Set();
    for (const item of feed) {
      const key = `${item.at}${item.vh}${item.event}`;
      if (!seenRef.current.has(key)) fresh.add(key);
    }
    return fresh;
  }, [feed]);
  React.useEffect(() => {
    for (const item of feed) seenRef.current.add(`${item.at}${item.vh}${item.event}`);
  }, [feed]);

  React.useEffect(() => {
    const compute = () =>
      setSize(Math.min(window.innerWidth * 0.92, window.innerHeight * 0.98, 900));
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  React.useEffect(() => {
    const onKey = (evt) => evt.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else overlayRef.current?.requestFullscreen?.();
  };

  const tallies = realtime?.data;
  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 overflow-hidden"
      style={{ background: T.space, fontFeatureSettings: '"tnum"' }}
    >
      <Starfield />

      {/* Globe / 2D map stage */}
      <div className="absolute inset-0 flex items-center justify-center">
        {mode2d ? (
          <div className="w-[min(1100px,94vw)]">
            <FlatMap countries={countries} activeCountries={tallies?.active_countries} tall />
          </div>
        ) : (
          <GlobeStage active={active} countries={countries} size={size} paused={paused} />
        )}
      </div>

      {/* Live summary panel — top left */}
      <div
        className="absolute left-4 top-4 w-[250px] rounded-xl border p-3.5"
        style={{ background: 'rgba(18,22,29,0.92)', borderColor: T.border, backdropFilter: 'blur(6px)' }}
      >
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[13px] font-bold tracking-tight" style={{ color: T.ink }}>
            IELTS Bank <span style={{ color: T.faint }}>· Live</span>
          </span>
          <div className="flex items-center gap-1">
            <ToolbarButton title={paused ? 'Start auto-panning' : 'Stop auto-panning'} active={paused}
              onClick={() => setPaused((value) => !value)}>
              {paused ? '▶' : '⏸'}
            </ToolbarButton>
            <ToolbarButton title={mode2d ? 'Switch to 3D globe' : 'Switch to 2D map'} active={mode2d}
              onClick={() => setMode2d((value) => !value)}>
              🗺
            </ToolbarButton>
            <ToolbarButton title="Enter full screen" onClick={toggleFullscreen}>⛶</ToolbarButton>
            <ToolbarButton title="Close" onClick={onClose}>✕</ToolbarButton>
          </div>
        </div>
        <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold" style={{ color: T.ink }}>
          <LiveDot />
          {tallies ? tallies.active_now : '–'} visitor{tallies?.active_now === 1 ? '' : 's'} on ielts-bank.com
        </div>
        {[
          { title: 'Referrers', rows: (tallies?.active_referrers || []).map((row) => ({ key: row.label, label: row.label, n: row.n })) },
          {
            title: 'Countries',
            rows: (tallies?.active_countries || []).map((row) => ({
              key: row.c, label: `${flagEmoji(row.c)} ${countryName(row.c)}`, n: row.n,
            })),
          },
          { title: 'Devices', rows: (tallies?.active_devices || []).map((row) => ({ key: row.label, label: `💻 ${row.label}`, n: row.n })) },
        ].map((section) => (
          <div key={section.title} className="mb-2">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: T.faint }}>
              {section.title}
            </div>
            {section.rows.length ? (
              section.rows.slice(0, 4).map((row) => (
                <div key={row.key} className="flex items-center justify-between py-0.5 text-[12px]">
                  <span className="truncate" style={{ color: T.muted }}>{row.label}</span>
                  <span className="font-semibold tabular-nums" style={{ color: T.ink }}>{row.n}</span>
                </div>
              ))
            ) : (
              <div className="text-[11px]" style={{ color: T.faint }}>—</div>
            )}
          </div>
        ))}
        <div className="mt-2.5 flex items-center gap-3 border-t pt-2 text-[10px]" style={{ borderColor: T.divider, color: T.faint }}>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: T.live }} /> live now
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-6 rounded-sm"
              style={{ background: `linear-gradient(to right, rgba(90,169,230,0.15), rgba(90,169,230,0.55))` }}
            />
            sign-ups
          </span>
        </div>
      </div>

      {/* Real-time event feed — bottom left */}
      <div
        className="absolute bottom-4 left-4 max-h-[38vh] w-[330px] overflow-y-auto rounded-xl border p-2"
        style={{ background: 'rgba(18,22,29,0.92)', borderColor: T.border, backdropFilter: 'blur(6px)' }}
      >
        {feed.slice(0, 14).map((item, index) => (
          <FeedRow
            key={`${item.at}${item.vh}${index}`}
            item={item}
            isNew={newKeys.has(`${item.at}${item.vh}${item.event}`)}
          />
        ))}
        {!feed.length && (
          <div className="p-3 text-[12px]" style={{ color: T.faint }}>Waiting for events…</div>
        )}
      </div>
    </div>
  );
}
