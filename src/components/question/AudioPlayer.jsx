import * as React from 'react';
import { Play, Pause, RotateCcw, RotateCw } from 'lucide-react';
import { cn } from '../../lib/utils';

// Custom audio player for Listening practice: large play/pause control, a
// seekable waveform, ±10s skips, and playback speed. Replaces the cramped
// native <audio> element.
//
// The waveform is decoded client-side (fetch -> AudioContext.decodeAudioData
// -> per-bar peaks). If decoding fails for any reason (CORS, unsupported
// codec, fetch error) we fall back to a deterministic placeholder pattern —
// the bar strip stays fully seekable either way.

const BAR_COUNT = 72;
const RATES = [1, 1.25, 1.5, 0.75];
const SKIP_SECONDS = 10;

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Placeholder heights (0..1) when real peaks are unavailable — a smooth,
// deterministic "audio-looking" curve rather than random noise.
function placeholderPeaks() {
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const wave = Math.sin(i * 0.55) * 0.25 + Math.sin(i * 0.21 + 1.4) * 0.2;
    return 0.45 + wave;
  });
}

async function decodePeaks(src, signal) {
  const res = await fetch(src, { signal });
  if (!res.ok) throw new Error(`audio fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('Web Audio unsupported');
  const ctx = new AudioCtx();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const channel = audio.getChannelData(0);
    const block = Math.max(1, Math.floor(channel.length / BAR_COUNT));
    const peaks = [];
    for (let i = 0; i < BAR_COUNT; i += 1) {
      const start = i * block;
      const end = Math.min(start + block, channel.length);
      // Sample sparsely inside each block — full abs() over every sample is
      // needlessly slow for long recordings and looks identical.
      let peak = 0;
      const step = Math.max(1, Math.floor((end - start) / 200));
      for (let j = start; j < end; j += step) {
        const v = Math.abs(channel[j]);
        if (v > peak) peak = v;
      }
      peaks.push(peak);
    }
    const max = Math.max(...peaks, 0.01);
    return peaks.map((p) => Math.max(0.08, p / max));
  } finally {
    ctx.close().catch(() => {});
  }
}

const AudioPlayer = ({ src, onPlay, onEnded, onDurationChange, className }) => {
  const audioRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const wrapRef = React.useRef(null);
  const rafRef = React.useRef(0);
  const peaksRef = React.useRef(placeholderPeaks());
  const draggingRef = React.useRef(false);

  const [playing, setPlaying] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [rateIndex, setRateIndex] = React.useState(0);

  const onDurationChangeRef = React.useRef(onDurationChange);
  onDurationChangeRef.current = onDurationChange;

  const draw = React.useCallback(() => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
    if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const peaks = peaksRef.current;
    const total = audio.duration || 0;
    const progress = total > 0 ? audio.currentTime / total : 0;
    const styles = getComputedStyle(canvas);
    const played = `hsl(${styles.getPropertyValue('--accent').trim()})`;
    const rest = `hsl(${styles.getPropertyValue('--muted-foreground').trim()} / 0.3)`;

    const gap = 2;
    const barWidth = Math.max(2, (width - gap * (peaks.length - 1)) / peaks.length);
    for (let i = 0; i < peaks.length; i += 1) {
      const x = i * (barWidth + gap);
      const h = Math.max(4, peaks[i] * height * 0.92);
      const y = (height - h) / 2;
      ctx.fillStyle = (i + 0.5) / peaks.length <= progress ? played : rest;
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, h, barWidth / 2);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, barWidth, h);
      }
    }
  }, []);

  // The <audio> element is in the server-rendered HTML, so the browser can
  // fire loadedmetadata/canplay BEFORE hydration attaches our listeners. Sync
  // whatever state the element already reached on mount.
  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const seconds = Number(audio.duration);
    if (audio.readyState >= 1 && Number.isFinite(seconds) && seconds > 0) {
      setDuration(seconds);
      setReady(true);
      onDurationChangeRef.current?.(seconds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Decode real waveform peaks; keep the placeholder on any failure.
  React.useEffect(() => {
    if (!src || typeof window === 'undefined') return undefined;
    const controller = new AbortController();
    decodePeaks(src, controller.signal)
      .then((peaks) => {
        peaksRef.current = peaks;
        draw();
      })
      .catch(() => {});
    return () => controller.abort();
  }, [src, draw]);

  // Redraw smoothly while playing.
  React.useEffect(() => {
    if (!playing) return undefined;
    const tick = () => {
      draw();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, draw]);

  // Redraw on container resize and after paused seeks.
  React.useEffect(() => {
    draw();
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => draw());
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [draw, currentTime, duration]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  };

  const skip = (delta) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.min(Math.max(audio.currentTime + delta, 0), audio.duration);
    setCurrentTime(audio.currentTime);
  };

  const cycleRate = () => {
    const next = (rateIndex + 1) % RATES.length;
    setRateIndex(next);
    if (audioRef.current) audioRef.current.playbackRate = RATES[next];
  };

  const seekToPointer = (event) => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const rect = canvas.getBoundingClientRect();
    const fraction = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    audio.currentTime = fraction * audio.duration;
    setCurrentTime(audio.currentTime);
  };

  const handlePointerDown = (event) => {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    seekToPointer(event);
  };
  const handlePointerMove = (event) => {
    if (draggingRef.current) seekToPointer(event);
  };
  const handlePointerUp = () => {
    draggingRef.current = false;
  };

  const handleSliderKeyDown = (event) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      skip(5);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      skip(-5);
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      togglePlay();
    }
  };

  if (!src) {
    return <p className="text-sm text-muted-foreground">Audio unavailable for this item.</p>;
  }

  return (
    <div className={cn('select-none', className)} ref={wrapRef}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => {
          setPlaying(true);
          onPlay?.();
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          onEnded?.();
        }}
        onCanPlay={() => setReady(true)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const seconds = Number(e.currentTarget.duration);
          if (Number.isFinite(seconds) && seconds > 0) {
            setDuration(seconds);
            // Metadata is enough to enable the controls — with
            // preload="metadata" the canplay event may not fire until the
            // user actually presses play.
            setReady(true);
            onDurationChange?.(seconds);
          }
        }}
      />

      {/* Waveform */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="Seek within the recording"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration) || 0}
        aria-valuenow={Math.round(currentTime) || 0}
        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
        className="cursor-pointer touch-none rounded-md py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleSliderKeyDown}
      >
        <canvas ref={canvasRef} className="h-20 w-full sm:h-24" aria-hidden="true" />
      </div>

      {/* Time */}
      <div className="mt-1 flex items-center justify-between text-xs tabular-nums text-muted-foreground">
        <span>{formatTime(currentTime)}</span>
        <span>{duration ? formatTime(duration) : '--:--'}</span>
      </div>

      {/* Controls */}
      <div className="mt-3 flex items-center justify-center gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => skip(-SKIP_SECONDS)}
          aria-label="Back 10 seconds"
          className="relative flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RotateCcw className="h-5 w-5" />
          <span className="absolute text-[8px] font-bold leading-none">10</span>
        </button>

        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
          disabled={!ready}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-md transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60 disabled:hover:scale-100"
        >
          {playing ? (
            <Pause className="h-7 w-7" fill="currentColor" />
          ) : (
            <Play className="ml-1 h-7 w-7" fill="currentColor" />
          )}
        </button>

        <button
          type="button"
          onClick={() => skip(SKIP_SECONDS)}
          aria-label="Forward 10 seconds"
          className="relative flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RotateCw className="h-5 w-5" />
          <span className="absolute text-[8px] font-bold leading-none">10</span>
        </button>

        <button
          type="button"
          onClick={cycleRate}
          aria-label={`Playback speed ${RATES[rateIndex]}x`}
          className="ml-1 h-10 min-w-[3.25rem] rounded-full border border-input px-2 text-xs font-semibold tabular-nums text-foreground transition-colors hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9"
        >
          {RATES[rateIndex]}x
        </button>
      </div>

      {!ready ? (
        <p className="mt-3 text-center text-xs text-muted-foreground" role="status">
          Loading audio…
        </p>
      ) : null}
    </div>
  );
};

export default AudioPlayer;
