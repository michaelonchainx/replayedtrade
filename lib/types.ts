/** Price feed for the chart. Branding is always replayed.trade. */
export type Venue = 'hyperliquid' | 'lighter';
export type Side = 'long' | 'short';

/** t = open time, ms UTC */
export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

/** One execution. `in` grows the position, `out` reduces it. `sz` is in coin units (>0). */
export interface Fill {
  kind: 'in' | 'out';
  t: number;
  px: number;
  sz: number;
}

export interface Trade {
  venue: Venue;
  /** display symbol, e.g. "HYPE" */
  coin: string;
  /** venue-specific id (HL coin name / Lighter market_id) */
  marketRef: string;
  side: Side;
  entryTime: number;
  entryPx: number;
  exitTime: number;
  exitPx: number;
  /** coin units (max abs position held) */
  sizeBase: number;
  leverage: number;
  feesUsd: number;
  /** display precision */
  pxDecimals: number;
  /**
   * Scale-ins / partial exits. When present, entry/exit px are size-weighted averages of these,
   * entryTime = first `in`, exitTime = last `out`, sizeBase = max position. Absent = one in + one out.
   */
  fills?: Fill[];
}

export type Interval = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '8h' | '12h' | '1d';
export type VideoFormat = '16x9' | '9x16';
export type VideoLength = 15 | 25 | 40;

export interface RenderOptions {
  username: string;
  footer: string;
  showLeverage: boolean;
  showSize: boolean;
  percentOnly: boolean;
  length: VideoLength;
  format: VideoFormat;
}

export const DEFAULT_OPTIONS: RenderOptions = {
  username: 'michaelonchainx',
  footer: '',
  showLeverage: true,
  showSize: false,
  percentOnly: false,
  length: 25,
  format: '16x9',
};
