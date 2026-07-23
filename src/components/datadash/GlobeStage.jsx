import * as React from 'react';
import worldBorders from '../../lib/data/worldBorders.json';
import countryLatLng from '../../lib/data/countryLatLng.json';
import { T, countryName } from './theme';
import { aliasFor, avatarUrl } from './aliases';

// The live vector globe itself — a plain canvas renderer (real country
// borders, graticule, atmosphere) with DOM avatar pins riding the rotation.
// Embedded both in the landing "Around the world" card and the full-screen
// GlobeView overlay. Rotation is time-based and eases to a crawl while a
// live visitor is near screen center.

const DEG = Math.PI / 180;
const THETA = 0.22; // fixed camera tilt
const BASE_SPEED = 0.055; // rad/sec — slow cruise (~2 min per revolution)
const LINGER_SPEED = 0.008; // rad/sec — near-pause while live visitors are in view

// ?debugpin appends fake visitors — demo/verify pin placement when nobody is
// online. The page is private, so this leaks nothing.
export function withDebugPins(active) {
  const list = active || [];
  if (typeof window !== 'undefined' && window.location.search.includes('debugpin')) {
    return [
      ...list,
      { vh: 'debugbr01', c: 'BR', path: '/', signed_in: false },
      { vh: 'debugjp01', c: 'JP', path: '/', signed_in: true },
      { vh: 'debugeg01', c: 'EG', path: '/', signed_in: false },
    ];
  }
  return list;
}

// Deterministic per-visitor jitter so several visitors in one country spread out.
function jitter(vh, span = 4) {
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

// Orthographic projection. Center longitude = −phi; +phi spins the globe
// eastward. Returns [x(right), y(up), z(toward viewer)] on the unit sphere.
function project(lat, lng, phi, theta) {
  const latR = lat * DEG;
  const delta = lng * DEG + phi;
  const x = Math.cos(latR) * Math.sin(delta);
  const y3 = Math.sin(latR);
  const z3 = Math.cos(latR) * Math.cos(delta);
  return [x, y3 * Math.cos(theta) - z3 * Math.sin(theta), z3 * Math.cos(theta) + y3 * Math.sin(theta)];
}

// Draw one lat/lng polyline, breaking the path at the horizon.
function strokeRing(ctx, ring, phi, cx, cy, radius) {
  let pen = false;
  ctx.beginPath();
  for (let i = 0; i < ring.length; i += 1) {
    const [lng, lat] = ring[i];
    const [x, y, z] = project(lat, lng, phi, THETA);
    if (z > 0) {
      const px = cx + x * radius;
      const py = cy - y * radius;
      if (pen) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
      pen = true;
    } else {
      pen = false;
    }
  }
  ctx.stroke();
}

// Fill a ring only when it is entirely on the front hemisphere (limb-crossing
// polygons stay stroke-only — avoids horizon-clipping artifacts).
function fillRingIfVisible(ctx, ring, phi, cx, cy, radius) {
  ctx.beginPath();
  for (let i = 0; i < ring.length; i += 1) {
    const [lng, lat] = ring[i];
    const [x, y, z] = project(lat, lng, phi, THETA);
    if (z <= 0) return;
    if (i) ctx.lineTo(cx + x * radius, cy - y * radius);
    else ctx.moveTo(cx + x * radius, cy - y * radius);
  }
  ctx.closePath();
  ctx.fill();
}

function drawGlobe(ctx, size, phi, liveCountries, signupDots) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.44;
  ctx.clearRect(0, 0, size, size);

  // Atmosphere halo + night-side sphere.
  const halo = ctx.createRadialGradient(cx, cy, radius * 0.92, cx, cy, radius * 1.12);
  halo.addColorStop(0, 'rgba(90,169,230,0)');
  halo.addColorStop(0.55, 'rgba(90,169,230,0.20)');
  halo.addColorStop(0.8, 'rgba(74,167,181,0.06)');
  halo.addColorStop(1, 'rgba(30,58,95,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.12, 0, Math.PI * 2);
  ctx.fill();

  const sphere = ctx.createRadialGradient(cx - radius * 0.25, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
  sphere.addColorStop(0, '#121A26');
  sphere.addColorStop(0.7, '#0C1219');
  sphere.addColorStop(1, '#0A1017');
  ctx.fillStyle = sphere;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,169,230,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Faint graticule every 20°.
  ctx.strokeStyle = 'rgba(91,100,114,0.16)';
  ctx.lineWidth = 0.6;
  for (let lat = -60; lat <= 60; lat += 20) {
    const ring = [];
    for (let lng = -180; lng <= 180; lng += 4) ring.push([lng, lat]);
    strokeRing(ctx, ring, phi, cx, cy, radius);
  }
  for (let lng = -180; lng < 180; lng += 20) {
    const ring = [];
    for (let lat = -85; lat <= 85; lat += 4) ring.push([lng, lat]);
    strokeRing(ctx, ring, phi, cx, cy, radius);
  }

  // Country fills + borders; live-visitor countries glow green.
  for (const country of worldBorders) {
    const live = country.a2 && liveCountries.has(country.a2);
    ctx.fillStyle = live ? 'rgba(62,207,142,0.13)' : 'rgba(120,140,168,0.10)';
    for (const ring of country.rings) fillRingIfVisible(ctx, ring, phi, cx, cy, radius);
    ctx.strokeStyle = live ? 'rgba(62,207,142,0.75)' : 'rgba(139,147,161,0.38)';
    ctx.lineWidth = live ? 1.2 : 0.7;
    for (const ring of country.rings) strokeRing(ctx, ring, phi, cx, cy, radius);
  }

  // Sign-up origins: glowing blue dots sized by sign-ups in the selected range.
  for (const dot of signupDots) {
    const [x, y, z] = project(dot.lat, dot.lng, phi, THETA);
    if (z <= 0.03) continue;
    const px = cx + x * radius;
    const py = cy - y * radius;
    const r = Math.min(7, 2.5 + Math.sqrt(dot.n) * 1.4) * Math.min(1, 0.6 + z * 0.5);
    ctx.save();
    ctx.shadowColor = 'rgba(90,169,230,0.9)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(90,169,230,0.95)';
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (dot.n >= 3) {
      ctx.fillStyle = '#0B0E13';
      ctx.font = '700 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(dot.n), px, py + 0.5);
    }
  }
}

// How close (radians) the nearest visible live marker sits to the screen
// center meridian — used to ease the rotation down over live regions.
function nearestMarkerDistance(markers, phi) {
  let best = Infinity;
  for (const marker of markers) {
    const [, , z] = project(marker.at[0], marker.at[1], phi, THETA);
    if (z <= 0.05) continue;
    const delta = Math.abs(((marker.at[1] * DEG + phi + Math.PI) % (2 * Math.PI)) - Math.PI);
    if (delta < best) best = delta;
  }
  return best;
}

export function Starfield() {
  const stars = React.useMemo(() => {
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

export default function GlobeStage({ active, countries, size, paused = false }) {
  const canvasRef = React.useRef(null);
  const pinLayerRef = React.useRef(null);
  const phiRef = React.useRef(0.6);
  const speedRef = React.useRef(BASE_SPEED);
  const pausedRef = React.useRef(paused);
  pausedRef.current = paused;
  const dragRef = React.useRef(null);

  const activeMarkers = React.useMemo(
    () =>
      (active || [])
        .map((visitor) => ({ visitor, at: markerLatLng(visitor) }))
        .filter((entry) => entry.at),
    [active]
  );
  const markersRef = React.useRef([]);
  markersRef.current = activeMarkers;
  const liveCountriesRef = React.useRef(new Set());
  liveCountriesRef.current = new Set((active || []).map((visitor) => visitor.c).filter(Boolean));
  const signupDotsRef = React.useRef([]);
  signupDotsRef.current = (countries || [])
    .filter((row) => row.signups > 0 && countryLatLng[row.c])
    .map((row) => ({
      lat: countryLatLng[row.c][0],
      lng: countryLatLng[row.c][1],
      n: row.signups,
    }));

  // Render loop: adaptive rotation + globe draw + DOM pin positioning.
  React.useEffect(() => {
    if (!canvasRef.current || !size) return undefined;
    const canvas = canvasRef.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf;
    let lastTime = null;

    const frame = (now) => {
      // Time-based rotation so speed is identical on 60Hz and 120Hz displays.
      const dt = lastTime == null ? 0 : Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      if (!pausedRef.current && !dragRef.current) {
        const distance = nearestMarkerDistance(markersRef.current, phiRef.current);
        const target = distance < 0.55 ? LINGER_SPEED : distance < 1.1 ? BASE_SPEED * 0.45 : BASE_SPEED;
        speedRef.current += (target - speedRef.current) * Math.min(1, dt * 2.5);
        phiRef.current += speedRef.current * dt;
      }
      drawGlobe(ctx, size, phiRef.current, liveCountriesRef.current, signupDotsRef.current);

      const layer = pinLayerRef.current;
      if (layer) {
        const radius = size * 0.44;
        for (const pin of layer.children) {
          const lat = Number(pin.dataset.lat);
          const lng = Number(pin.dataset.lng);
          const [x, y, z] = project(lat, lng, phiRef.current, THETA);
          if (z > 0.03) {
            pin.style.opacity = String(Math.min(1, z * 3));
            pin.style.transform = `translate(${size / 2 + x * radius}px, ${size / 2 - y * radius}px) translate(-50%, -50%)`;
          } else {
            pin.style.opacity = '0';
          }
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size]);

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

  return (
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
              title={`${visitor.name || alias.name} · ${countryName(visitor.c)}`}
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
  );
}
