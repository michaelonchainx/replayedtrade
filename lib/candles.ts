import type { Candle, Interval, Trade } from './types';
import { chooseInterval, INTERVAL_MS, windowFor, type ReplayWindow } from './interval';
import { fetchHlCandles } from './hyperliquid/client';
import { fetchLighterCandles } from './lighter/client';
import { FriendlyError } from './hyperliquid/client';

export interface LoadedCandles {
  candles: Candle[];
  window: ReplayWindow;
  pxDecimals: number | null;
}

/** Fetch the replay window's candles for a trade (Lighter → Lighter feed, everything else → Hyperliquid). */
export async function loadTradeCandles(trade: Trade, now: number, forced?: Interval): Promise<LoadedCandles> {
  const window = forced ? windowFor(trade.entryTime, trade.exitTime, forced, now) : chooseInterval(trade.entryTime, trade.exitTime, trade.venue, now);
  let candles: Candle[];
  let pxDecimals: number | null = null;
  if (trade.venue === 'lighter') {
    candles = await fetchLighterCandles(Number(trade.marketRef), window.interval, window.start, window.end);
  } else {
    const r = await fetchHlCandles(trade.marketRef, window.interval, window.start, window.end + INTERVAL_MS[window.interval] - 1);
    candles = r.candles;
    pxDecimals = r.pxDecimals;
  }
  candles = candles.filter((c) => c.t >= window.start && c.t <= window.end);
  if (candles.length < 2) throw new FriendlyError('No price data for this period. Try a more recent trade or another pair.', 'no_candles');
  return { candles, window, pxDecimals };
}
