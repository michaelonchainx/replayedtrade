import type { Candle, Trade } from '../types';
import data from './hype-candles.json';

/**
 * Demo trade = the reference video's trade. Candles are real Hyperliquid HYPE 5m candles
 * (27 Oct 2026 06:20–17:50 UTC), affinely re-anchored so the entry/exit candles close at the
 * reference prices (see DECISIONS.md).
 */
export const DEMO_CANDLES: Candle[] = data.candles;

const ENTRY_CANDLE = 13;
export const DEMO_TRADE: Trade = {
  venue: 'hyperliquid',
  coin: 'HYPE',
  marketRef: 'HYPE',
  side: 'long',
  entryTime: DEMO_CANDLES[ENTRY_CANDLE].t + 2 * 60_000,
  entryPx: 77.966,
  exitTime: DEMO_CANDLES[ENTRY_CANDLE].t + 2 * 60_000 + (9 * 60 + 2) * 60_000,
  exitPx: 80.209,
  sizeBase: 933.937,
  leverage: 2,
  feesUsd: 52.35,
  pxDecimals: 4,
};
