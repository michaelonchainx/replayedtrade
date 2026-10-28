'use client';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/store';
import { createScene, ensureCanvasFonts } from '@/lib/render/scene';
import { renderFrame } from '@/lib/render/renderFrame';
import type { SceneTimeline } from '@/lib/render/timeline';
import { Rec } from '../ui';

const tc = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Live preview: loops at real speed with play/pause and a scrubber. Same renderFrame as the export. */
export default function ReplayPlayer() {
  const trade = useApp((s) => s.trade);
  const candles = useApp((s) => s.candles);
  const options = useApp((s) => s.options);
  const avatar = useApp((s) => s.avatar);
  const loading = useApp((s) => s.candlesLoading);
  const candleError = useApp((s) => s.candleError);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<{ tl: SceneTimeline; ctx: CanvasRenderingContext2D } | null>(null);
  const frameRef = useRef(0);
  const [fontsReady, setFontsReady] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [frame, setFrame] = useState(0);
  const [frames, setFrames] = useState(1);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    ensureCanvasFonts(document.fonts).then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  // Rebuild the timeline on any change; keep the playhead at the same relative position.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fontsReady) return;
    try {
      const prev = sceneRef.current;
      const rel = prev ? frameRef.current / prev.tl.frames : 0;
      const scene = createScene(canvas, { trade, candles, options, avatar });
      sceneRef.current = scene;
      frameRef.current = Math.min(scene.tl.frames - 1, Math.floor(rel * scene.tl.frames));
      setFrames(scene.tl.frames);
      renderFrame(scene.ctx, scene.tl, frameRef.current);
      setRenderError(null);
    } catch (e) {
      setRenderError(e instanceof Error ? e.message : 'Could not render this trade');
    }
  }, [trade, candles, options, avatar, fontsReady]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      const s = sceneRef.current;
      if (s) {
        acc += (now - last) / 1000;
        const step = Math.floor(acc * s.tl.fps);
        if (step > 0) {
          acc -= step / s.tl.fps;
          frameRef.current = (frameRef.current + step) % s.tl.frames;
          renderFrame(s.ctx, s.tl, frameRef.current);
          setFrame(frameRef.current);
        }
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const scrub = (v: number) => {
    const s = sceneRef.current;
    frameRef.current = v;
    setFrame(v);
    if (s) renderFrame(s.ctx, s.tl, v);
  };

  const vertical = options.format === '9x16';
  const fps = sceneRef.current?.tl.fps ?? 30;
  const pct = frames > 1 ? (frame / (frames - 1)) * 100 : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Rec />
        <span className="tnum text-sm font-bold text-ink-2">
          {tc(frame / fps)} <span className="text-ink-3">/ {tc(frames / fps)}</span>
        </span>
      </div>
      <div className={`border border-line bg-panel ${vertical ? 'flex justify-center py-4' : ''}`}>
        <div className={`relative ${vertical ? 'h-[min(78vh,880px)]' : 'w-full'}`} style={{ aspectRatio: vertical ? '9 / 16' : '16 / 9' }}>
          <canvas ref={canvasRef} className="block h-full w-full" aria-label="Trade replay preview" role="img" data-testid="preview-canvas" />
          {(loading || !fontsReady) && <div className="absolute right-3 top-3 bg-bg/90 px-3 py-1 text-xs font-bold uppercase tracking-[0.1em] text-ink-2">Loading candles…</div>}
          {(candleError || renderError) && (
            <div className="absolute inset-x-3 bottom-3 border border-red bg-bg/95 px-3 py-2 text-sm text-red" role="alert">
              {candleError ?? renderError}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button type="button" className="btn btn-primary h-10 w-10 !p-0" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'} data-testid="play-toggle">
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <rect x="2" y="1" width="3.5" height="12" fill="currentColor" />
              <rect x="8.5" y="1" width="3.5" height="12" fill="currentColor" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path d="M3 1.5v11l9.5-5.5z" fill="currentColor" />
            </svg>
          )}
        </button>
        {/* brand progress bar: 6px track, green fill — the native range sits on top for input */}
        <div className="relative h-6 flex-1">
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 bg-line" />
          <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 bg-green" style={{ width: `${pct}%` }} />
          <div className="absolute top-0 h-6 w-[3px] -translate-x-1/2 bg-green" style={{ left: `${pct}%` }} />
          <input
            type="range"
            min={0}
            max={frames - 1}
            value={frame}
            onChange={(e) => scrub(Number(e.target.value))}
            onPointerDown={() => setPlaying(false)}
            className="absolute inset-0 h-6 w-full cursor-pointer opacity-0"
            aria-label="Scrub replay"
            data-testid="scrubber"
          />
        </div>
      </div>
    </div>
  );
}
