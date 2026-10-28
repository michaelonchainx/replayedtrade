import type { Candle, Fill, RenderOptions, Trade } from '../types';
import { finalPnl, returnRatio } from '../pnl';
import { pnlWithFills, stateAfter, tradeFills } from '../fills';
import { MIN_ROLL_CANDLES, POST_ROLL } from '../interval';
import { layoutFor, type Layout } from './layout';

export const FPS = 30;
/** Fraction of the video used to stream candles (pre-roll → trade → post-roll). */
export const REVEAL_END = 0.78;
/** The PnL end card wipes in here (never earlier than 1 s after the close). */
export const OUTRO_START = 0.8;
/** Seconds the end card stays on screen at minimum. */
const OUTRO_MIN_SECONDS = 2.5;
/** Candles already played at frame 0. */
export const INITIAL_CANDLES = 5;
/** Zoomed-in start: the plot is sized for at least this many candles, then zooms out as more print. */
export const MIN_VISIBLE_CANDLES = 10;
/** Y camera: critically damped spring (rad/s) and padding (fraction of the visible range). */
const CAM_OMEGA = 5;
const CAM_PAD = 0.1;

export type MeasureText = (text: string, font: string) => number;

export interface Branding {
  avatar: CanvasImageSource | null;
  /** prerendered background (renderBackground) */
  background: CanvasImageSource | null;
}

export interface FillEvent extends Fill {
  /** candle index and continuous progress at which it executes */
  candle: number;
  p: number;
  /** frame at which it executes */
  frame: number;
  /** position size before / after (coin units) */
  before: number;
  after: number;
}

export interface SceneTimeline {
  trade: Trade;
  candles: Candle[];
  options: RenderOptions;
  layout: Layout;
  branding: Branding;
  fps: number;
  frames: number;
  intervalMs: number;
  multiDay: boolean;
  fills: FillEvent[];
  /** frame of the first `in` / last `out` */
  entryFrame: number;
  exitFrame: number;
  /** first frame of the PnL end card (wipe-in) */
  outroFrame: number;
  finalPnl: number;
  finalReturn: number;
  /** camera per frame: candle slot width (px) and visible price range */
  slot: Float64Array;
  camMin: Float64Array;
  camMax: Float64Array;
  /** per-frame arrays */
  progress: Float64Array; // continuous candle progress (k + intra)
  livePx: Float64Array;
  formH: Float64Array; // running high/low of the forming candle
  formL: Float64Array;
  pnl: Float64Array;
  ret: Float64Array;
  /** average cost of the open position (0 before entry) */
  avgPx: Float64Array;
  /** executed fills count */
  done: Uint16Array;
}

/** Index of the candle containing time t (clamped). */
export function candleIndexAt(candles: Candle[], t: number): number {
  let lo = 0;
  let hi = candles.length - 1;
  if (t <= candles[0].t) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (candles[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

interface Waypoint {
  f: number;
  p: number;
}

/** Intra-candle price path: bullish o→l→h→c, bearish o→h→l→c, plus pinned fill prices. */
export function candlePath(c: Candle, pins: Waypoint[]): Waypoint[] {
  const bull = c.c >= c.o;
  const pts: Waypoint[] = [
    { f: 0, p: c.o },
    { f: 0.3, p: bull ? c.l : c.h },
    { f: 0.7, p: bull ? c.h : c.l },
    { f: 1, p: c.c },
  ];
  for (const pin of pins) {
    const f = Math.min(0.999, Math.max(0.001, pin.f));
    pts.push({ f, p: Math.min(c.h, Math.max(c.l, pin.p)) });
  }
  pts.sort((a, b) => a.f - b.f);
  return pts;
}

export function pathAt(path: Waypoint[], f: number): number {
  if (f <= 0) return path[0].p;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (f <= b.f) {
      const span = b.f - a.f;
      const x = span > 0 ? (f - a.f) / span : 1;
      return a.p + (b.p - a.p) * easeInOut(x);
    }
  }
  return path[path.length - 1].p;
}

/** Exact running extremes: waypoints up to f plus the current point (eased segments are monotone). */
function pathExtremes(path: Waypoint[], f: number): { h: number; l: number } {
  let h = path[0].p;
  let l = path[0].p;
  for (let i = 1; i < path.length && path[i].f <= f; i++) {
    h = Math.max(h, path[i].p);
    l = Math.min(l, path[i].p);
  }
  const cur = pathAt(path, f);
  return { h: Math.max(h, cur), l: Math.min(l, cur) };
}

export function buildTimeline(trade: Trade, candles: Candle[], options: RenderOptions, branding: Branding, fps = FPS): SceneTimeline {
  if (candles.length < 2) throw new Error('Need at least 2 candles');
  const layout = layoutFor(options.format);
  const frames = Math.round(options.length * fps);
  const N = candles.length;
  const intervalMs = candles[1].t - candles[0].t;
  const fills = tradeFills(trade);

  // where each fill lands on the candle track (strictly increasing so events stay ordered)
  let lastP = -1;
  const placed = fills.map((f) => {
    const k = candleIndexAt(candles, f.t);
    const frac = Math.min(0.999, Math.max(0.001, (f.t - candles[k].t) / intervalMs));
    const p = Math.max(k + frac, lastP + 1e-4);
    lastP = p;
    return { f, k: Math.floor(p), p };
  });
  const firstIn = placed[0];
  const lastOut = placed[placed.length - 1];

  // Missing post-roll (trade closed recently) → the reveal ends earlier and the hold gets longer.
  const durCandles = (trade.exitTime - trade.entryTime) / intervalMs;
  const nominalPost = Math.max(MIN_ROLL_CANDLES, Math.ceil(POST_ROLL * durCandles));
  const actualPost = N - 1 - lastOut.k;
  const revealScale = actualPost < nominalPost ? N / (N - actualPost + nominalPost) : 1;
  const revealFrames = Math.max(1, Math.round(frames * REVEAL_END * revealScale));
  const n0 = Math.min(INITIAL_CANDLES, firstIn.k);

  const pinsByCandle = new Map<number, Waypoint[]>();
  for (const pl of placed) {
    const arr = pinsByCandle.get(pl.k) ?? [];
    arr.push({ f: pl.p - pl.k, p: pl.f.px });
    pinsByCandle.set(pl.k, arr);
  }
  const paths = candles.map((c, k) => candlePath(c, pinsByCandle.get(k) ?? []));

  const progress = new Float64Array(frames);
  const livePx = new Float64Array(frames);
  const formH = new Float64Array(frames);
  const formL = new Float64Array(frames);
  const pnl = new Float64Array(frames);
  const ret = new Float64Array(frames);
  const avgPx = new Float64Array(frames);
  const done = new Uint16Array(frames);
  const slot = new Float64Array(frames);
  const camMin = new Float64Array(frames);
  const camMax = new Float64Array(frames);

  // prefix extremes of closed candles (for the revealed-range camera)
  const preH = new Float64Array(N + 1);
  const preL = new Float64Array(N + 1);
  preH[0] = -Infinity;
  preL[0] = Infinity;
  for (let k = 0; k < N; k++) {
    preH[k + 1] = Math.max(preH[k], candles[k].h);
    preL[k + 1] = Math.min(preL[k], candles[k].l);
  }
  const plotW = layout.plot.right - layout.plot.left;
  const dt = 1 / fps;
  let yLo = 0;
  let yHi = 0;
  let vLo = 0;
  let vHi = 0;

  const fin = finalPnl(trade);
  const finRet = returnRatio(trade, fin);
  const fillFrames = placed.map(() => frames);
  const states = placed.map((_, n) => stateAfter(trade, fills, n + 1));

  for (let i = 0; i < frames; i++) {
    const p = Math.min(N, n0 + (N - n0) * Math.min(1, i / revealFrames));
    progress[i] = p;
    const k = Math.floor(p);
    let px: number;
    if (k >= N) {
      px = candles[N - 1].c;
      formH[i] = candles[N - 1].h;
      formL[i] = candles[N - 1].l;
    } else {
      const f = p - k;
      px = pathAt(paths[k], f);
      const ex = pathExtremes(paths[k], f);
      formH[i] = ex.h;
      formL[i] = ex.l;
    }
    livePx[i] = px;

    let n = 0;
    while (n < placed.length && p >= placed[n].p) {
      if (fillFrames[n] === frames) fillFrames[n] = i;
      n++;
    }
    done[i] = n;
    if (n === 0) {
      pnl[i] = 0;
      ret[i] = 0;
    } else if (n >= placed.length) {
      pnl[i] = fin;
      ret[i] = finRet;
    } else {
      pnl[i] = pnlWithFills(trade, fills, n, px);
      ret[i] = returnRatio(trade, pnl[i]);
    }
    avgPx[i] = n === 0 ? 0 : states[n - 1].q > 0 ? states[n - 1].avg : avgPx[i - 1] || states[n - 1].avg;

    // X camera: starts zoomed in, every new candle zooms out (continuous, no jumps)
    slot[i] = plotW / Math.max(p + 0.5, MIN_VISIBLE_CANDLES);

    // Y camera: fit what has printed so far (+ the average entry), eased by a critically damped spring
    let hi = k >= N ? preH[N] : Math.max(preH[k], formH[i]);
    let lo = k >= N ? preL[N] : Math.min(preL[k], formL[i]);
    if (n > 0) {
      hi = Math.max(hi, avgPx[i]);
      lo = Math.min(lo, avgPx[i]);
    }
    const span = Math.max(hi - lo, Math.abs(hi) * 2e-4);
    const tLo = lo - span * CAM_PAD;
    const tHi = hi + span * CAM_PAD;
    if (i === 0) {
      yLo = tLo;
      yHi = tHi;
    } else {
      vLo += (CAM_OMEGA * CAM_OMEGA * (tLo - yLo) - 2 * CAM_OMEGA * vLo) * dt;
      yLo += vLo * dt;
      vHi += (CAM_OMEGA * CAM_OMEGA * (tHi - yHi) - 2 * CAM_OMEGA * vHi) * dt;
      yHi += vHi * dt;
    }
    camMin[i] = yLo;
    camMax[i] = yHi;
  }

  let q = 0;
  const events: FillEvent[] = placed.map((pl, n) => {
    const before = q;
    q = pl.f.kind === 'in' ? q + pl.f.sz : Math.max(0, q - pl.f.sz);
    return { ...pl.f, candle: pl.k, p: pl.p, frame: fillFrames[n], before, after: q };
  });

  return {
    trade,
    candles,
    options,
    layout,
    branding,
    fps,
    frames,
    intervalMs,
    multiDay: candles[N - 1].t - candles[0].t >= 86_400_000,
    fills: events,
    entryFrame: fillFrames[0],
    exitFrame: fillFrames[fillFrames.length - 1],
    outroFrame: Math.min(
      Math.max(Math.round(frames * OUTRO_START), fillFrames[fillFrames.length - 1] + fps),
      frames - Math.round(OUTRO_MIN_SECONDS * fps),
    ),
    finalPnl: fin,
    finalReturn: finRet,
    slot,
    camMin,
    camMax,
    progress,
    livePx,
    formH,
    formL,
    pnl,
    ret,
    avgPx,
    done,
  };
}
