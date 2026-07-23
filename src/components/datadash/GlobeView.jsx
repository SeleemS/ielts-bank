import * as React from 'react';
import createGlobe from 'cobe';
import countryLatLng from '../../lib/data/countryLatLng.json';
import { T, countryName, flagEmoji, timeAgo } from './theme';
import { LiveDot } from './primitives';
import { aliasFor, avatarUrl } from './aliases';
import FlatMap from './FlatMap';

const DEG = Math.PI / 180;
const GOAL_EVENTS = new Set([
  'purchase_success', 'subscription_activated', 'checkout_start', 'signup_verified',
  'signup_start', 'login', 'writing_submit', 'speaking_submit', 'attempt_submit',
  'paywall_upgrade_click',
]);

// Deterministic per-visitor jitter so several visitors in one country spread out.
function jitter(vh, span = 5) {
  let h = 0;
  for (let i = 0; i < vh.length; i += 1) h = (h * 31 + vh.charCodeAt(i)) >>> 0;
  return [((h % 1000) / 1000 - 0.5) * span, (((h >> 10) % 1000) / 1000 - 0.5) * span];
}

function markerLatLng(visitor) {
  const base = countryLatLng[visitor.c];
  if (!base) return null;
  const [dLat, dLng] = jitter(visitor.vh || '');
  return [base[0] + dLat, base[1] + dLng];
}

// Orthographic projection matched to cobe's rotation convention: the
// longitude at screen center is (3π/2 − phi); theta tilts around X.
function project(lat, lng, phi, theta, radius) {
  const latR = lat * DEG;
  const delta = lng * DEG - (3 * Math.PI) / 2 + phi;
  const x = Math.cos(latR) * Math.sin(delta);
  const y3 = Math.sin(latR);
  const z3 = Math.cos(latR) * Math.cos(delta);
  const y = y3 * Math.cos(theta) - z3 * Math.sin(theta);
  const z = z3 * Math.cos(theta) + y3 * Math.sin(theta);
  return [x * radius, -y * radius, z];
}

function Starfield() {
  const stars = React.useMemo(() => {
    // Deterministic scatter (mulberry32) so the sky doesn't reshuffle on render.
    let seed = 1337;
    const rand = () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return Array.from({ length: 150 }, () => ({
      x: rand() * 100, y: rand() * 100,
      r: rand() * 1.1 + 0.2, o: rand() * 0.5 + 0.1,
      blue: rand() > 0.8,
    }));
  }, []);
  return (
    <svg className="absolute inset-0 h-full w-full" aria-hidden>
      {stars.map((star, index) => (
        <circle
          key={index}
          cx={`${star.x}%`} cy={`${star.y}%`} r={star.r}
          fill={star.blue ? '#7FC4FF' : '#ffffff'} opacity={star.o}
        />
      ))}
    </svg>
  );
}

function Avatar({ seed, size = 24 }) {
  const [failed, setFailed] = React.useState(false);
  const alias = aliasFor(seed);
  if (failed) {
    return (
      <span
        className="flex items-center justify-center rounded-full text-[9px] font-bold uppercase"
        style={{ width: size, height: size, background: alias.color, color: '#0B0E13' }}
      >
        {alias.name.split(' ').map((word) => word[0]).join('')}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl(seed)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className="rounded-full"
      onError={() => setFailed(true)}
    />
  );
}

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
  const verb = VERB[item.event] || `performed ${item.event.replaceAll('_', ' ')} at`;
  const target = item.slug || item.path || '/';
  return (
    <div className="relative flex items-start gap-2 rounded-lg px-2 py-1.5">
      <span className="mt-0.5"><EventIcon goal={goal} /></span>
      <div className="min-w-0 flex-1 text-[12px] leading-snug">
        <span className="font-bold" style={{ color: alias.color }}>{alias.name}</span>
        <span style={{ color: T.muted }}> from {flagEmoji(item.country)} </span>
        <span style={{ color: goal ? T.ink : T.muted }}>{verb} </span>
        <span className="break-all font-mono text-[11px]" style={{ color: T.ink }}>
          {String(target).slice(0, 42)}
        </span>
        <div className="text-[10px]" style={{ color: T.faint }}>{timeAgo(item.at)}</div>
      </div>
      {isNew && <span className="absolute right-1.5 top-2 h-1.5 w-1.5 rounded-full" style={{ background: T.accent }} />}
    </div>
  );
}

// §5 — the flagship full-screen real-time view: auto-rotating 3D globe on a
// starfield, live visitor avatar pins riding the rotation, a live summary
// panel and a scrolling anonymized event feed. 2D toggle swaps in the flat map.
export default function GlobeView({ realtime, countries, onClose }) {
  const canvasRef = React.useRef(null);
  const pinLayerRef = React.useRef(null);
  const overlayRef = React.useRef(null);
  const phiRef = React.useRef(0.6);
  const pausedRef = React.useRef(false);
  const dragRef = React.useRef(null);
  const [paused, setPaused] = React.useState(false);
  const [mode2d, setMode2d] = React.useState(false);
  const [size, setSize] = React.useState(700);
  const seenRef = React.useRef(new Set());
  const THETA = 0.22;

  // ?debugpin appends fake visitors — lets you demo/verify pin placement when
  // nobody is online. Page is private, so this leaks nothing.
  const active = React.useMemo(() => {
    const list = realtime?.data?.active || [];
    if (typeof window !== 'undefined' && window.location.search.includes('debugpin')) {
      return [
        ...list,
        { vh: 'debugbr01', c: 'BR', path: '/', signed_in: false },
        { vh: 'debugjp01', c: 'JP', path: '/', signed_in: true },
        { vh: 'debugeg01', c: 'EG', path: '/', signed_in: false },
      ];
    }
    return list;
  }, [realtime]);
  const feed = realtime?.data?.feed || [];
  const activeMarkers = React.useMemo(
    () =>
      active
        .map((visitor) => ({ visitor, at: markerLatLng(visitor) }))
        .filter((entry) => entry.at),
    [active]
  );
  const markersRef = React.useRef([]);
  markersRef.current = activeMarkers.map((entry) => ({ location: entry.at, size: 0.05 }));

  // New-event dots: anything not seen on a previous poll is "new".
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

  // Globe + DOM-pin projection loop.
  React.useEffect(() => {
    if (mode2d || !canvasRef.current) return undefined;
    let raf;
    const globe = createGlobe(canvasRef.current, {
      devicePixelRatio: 2,
      width: size * 2,
      height: size * 2,
      phi: phiRef.current,
      theta: THETA,
      dark: 1,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: 6,
      baseColor: [0.3, 0.34, 0.4],
      markerColor: [0.91, 0.47, 0.31],
      glowColor: [0.16, 0.28, 0.45],
      markers: markersRef.current,
      onRender: (state) => {
        if (!pausedRef.current && !dragRef.current) phiRef.current += 0.0032;
        state.phi = phiRef.current;
        state.markers = markersRef.current;
      },
    });
    const positionPins = () => {
      const layer = pinLayerRef.current;
      if (layer) {
        const radius = size / 2;
        for (const pin of layer.children) {
          const lat = Number(pin.dataset.lat);
          const lng = Number(pin.dataset.lng);
          // cobe's sphere occupies |uv| <= 0.8 of the canvas half-extent.
          const [x, y, z] = project(lat, lng, phiRef.current, THETA, radius * 0.8);
          if (z > 0.03) {
            pin.style.opacity = String(Math.min(1, z * 3));
            pin.style.transform = `translate(${radius + x}px, ${radius + y}px) translate(-50%, -50%)`;
          } else {
            pin.style.opacity = '0';
          }
        }
      }
      raf = requestAnimationFrame(positionPins);
    };
    raf = requestAnimationFrame(positionPins);
    return () => {
      cancelAnimationFrame(raf);
      globe.destroy();
    };
  }, [mode2d, size]);

  const onPointerDown = (evt) => {
    dragRef.current = { startX: evt.clientX, startPhi: phiRef.current };
  };
  const onPointerMove = (evt) => {
    if (!dragRef.current) return;
    phiRef.current = dragRef.current.startPhi + (evt.clientX - dragRef.current.startX) * 0.005;
  };
  const endDrag = () => {
    dragRef.current = null;
  };

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
          <div
            className="relative touch-none"
            style={{ width: size, height: size, cursor: 'grab' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
          >
            <canvas ref={canvasRef} style={{ width: size, height: size }} />
            <div ref={pinLayerRef} className="pointer-events-none absolute inset-0">
              {activeMarkers.map(({ visitor, at }) => {
                const alias = aliasFor(visitor.vh);
                return (
                  <div
                    key={visitor.vh}
                    data-lat={at[0]}
                    data-lng={at[1]}
                    className="absolute left-0 top-0 will-change-transform"
                    style={{ opacity: 0 }}
                    title={`${alias.name} · ${countryName(visitor.c)}`}
                  >
                    <span
                      className="relative flex items-center justify-center rounded-full"
                      style={{ width: 30, height: 30, border: `2px solid ${alias.color}`, background: T.panel }}
                    >
                      <Avatar seed={visitor.vh} size={24} />
                      <span
                        className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border"
                        style={{ background: T.live, borderColor: T.space }}
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Live summary panel — top left */}
      <div
        className="absolute left-4 top-4 w-[250px] rounded-xl border p-3.5"
        style={{ background: 'rgba(18,22,29,0.92)', borderColor: T.border, backdropFilter: 'blur(6px)' }}
      >
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[13px] font-extrabold tracking-tight" style={{ color: T.ink }}>
            IELTS Bank <span style={{ color: T.faint }}>· Live</span>
          </span>
          <div className="flex items-center gap-1">
            <ToolbarButton title={paused ? 'Start auto-panning' : 'Stop auto-panning'} active={paused}
              onClick={() => { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); }}>
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
