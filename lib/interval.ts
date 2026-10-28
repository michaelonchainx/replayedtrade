import type { Interval, Venue } from './types';

export const INTERVAL_MS: Record<Interval, number> = {
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '2h': 7_200_000,
  '4h': 14_400_000,
  '8h': 28_800_000,
  '12h': 43_200_000,
  '1d': 86_400_000,
};

export const ALL_INTERVALS = Object.keys(INTERVAL_MS) as Interval[];
export const LIGHTER_INTERVALS: Interval[] = ['1m', '5m', '15m', '30m', '1h', '4h', '12h', '1d'];
/** Hyperliquid only serves the most recent ~5000 candles per interval. */
export const HL_MAX_CANDLES = 5000;

export const TARGET_MIN = 100;
export const TARGET_MAX = 160;
const TARGET_MID = 130;
export const PRE_ROLL = 0.12;
export const POST_ROLL = 0.15;
export const MIN_ROLL_CANDLES = 6;

export interface ReplayWindow {
  interval: Interval;
  start: number;
  end: number;
  /** expected candle count */
  count: number;
}

export function intervalsFor(venue: Venue): Interval[] {
  return venue === 'lighter' ? LIGHTER_INTERVALS : ALL_INTERVALS;
}

const floorTo = (t: number, iv: number) => Math.floor(t / iv) * iv;

export function windowFor(entryTime: number, exitTime: number, interval: Interval, now: number): ReplayWindow {
  const iv = INTERVAL_MS[interval];
  const dur = Math.max(0, exitTime - entryTime);
  const pre = Math.max(PRE_ROLL * dur, MIN_ROLL_CANDLES * iv);
  const post = Math.max(POST_ROLL * dur, MIN_ROLL_CANDLES * iv);
  const start = floorTo(entryTime - pre, iv);
  // Never extend past "now": the timeline turns the missing post-roll into a longer hold.
  const end = Math.min(floorTo(exitTime + post, iv), floorTo(now, iv));
  return { interval, start, end, count: Math.floor((end - start) / iv) + 1 };
}

/** Is the window still inside Hyperliquid's ~5000-candle availability? */
export function isAvailable(w: ReplayWindow, now: number, venue: Venue): boolean {
  if (venue === 'lighter') return true;
  return w.start >= now - HL_MAX_CANDLES * INTERVAL_MS[w.interval];
}

/**
 * Pick the interval giving ≈100–160 candles over the replay window,
 * respecting venue resolutions and Hyperliquid's 5000-candle history.
 */
export function chooseInterval(entryTime: number, exitTime: number, venue: Venue, now: number): ReplayWindow {
  const ivs = intervalsFor(venue);
  const windows = ivs.map((i) => windowFor(entryTime, exitTime, i, now));
  const avail = windows.filter((w) => isAvailable(w, now, venue));
  const pool = avail.length ? avail : [windows[windows.length - 1]];

  // Same-candle trades: finest available interval that separates entry and exit.
  const sameCandleAtBest = (w: ReplayWindow) =>
    floorTo(entryTime, INTERVAL_MS[w.interval]) === floorTo(exitTime, INTERVAL_MS[w.interval]);

  let best = pool[0];
  let bestScore = Infinity;
  for (const w of pool) {
    const inRange = w.count >= TARGET_MIN && w.count <= TARGET_MAX;
    const score = (inRange ? 0 : 10) + Math.abs(Math.log(w.count / TARGET_MID));
    if (score < bestScore) {
      bestScore = score;
      best = w;
    }
  }
  if (sameCandleAtBest(best)) {
    const separating = pool.find((w) => !sameCandleAtBest(w));
    best = separating && INTERVAL_MS[separating.interval] < INTERVAL_MS[best.interval] ? separating : pool[0];
  }
  return best;
}
