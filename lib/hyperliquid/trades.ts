import { z } from 'zod';
import type { Fill, Trade } from '../types';
import { pxDecimalsFromRaw, sigFigDecimals } from '../format';

export const HlFillSchema = z.object({
  coin: z.string(),
  px: z.string(),
  sz: z.string(),
  side: z.enum(['B', 'A']),
  time: z.number(),
  startPosition: z.string(),
  dir: z.string(),
  closedPnl: z.string(),
  hash: z.string(),
  fee: z.string(),
  oid: z.number().optional(),
  tid: z.number().optional(),
  liquidation: z.unknown().optional(),
});
export type HlFill = z.infer<typeof HlFillSchema>;

export const isSpotCoin = (coin: string) => coin.startsWith('@') || coin.includes('/');

const EPS = 1e-9;
const sgn = (x: number) => (Math.abs(x) < EPS ? 0 : x > 0 ? 1 : -1);

interface Leg {
  sz: number;
  px: number;
  t: number;
  /** Hyperliquid's realized PnL and fee for this execution */
  pnl: number;
  fee: number;
}

interface Open {
  coin: string;
  side: 'long' | 'short';
  entryTime: number;
  inc: Leg[];
  dec: Leg[];
  fees: number;
  closedPnl: number;
  maxAbs: number;
  pxRaw: string[];
}

/** A closed round trip rebuilt from fills. */
export interface ClosedTrade {
  /** hash of the closing fill */
  id: string;
  trade: Trade;
  /** Hyperliquid's own realized PnL for the round trip (Σ closedPnl − Σ fee), excl. funding */
  venuePnl: number;
}

export interface Reconstruction {
  trades: ClosedTrade[];
  /** positions still open at the end of the loaded fills */
  openPositions: number;
  /** fills whose `dir` disagrees with the position walk (should be empty) */
  mismatches: string[];
}

/** Keep individual executions only when there was more than one in or out. */
/** Every execution with the venue's own realized PnL and fee, so the replay ends on Hyperliquid's number. */
function legsToFills(inc: Leg[], dec: Leg[]): Fill[] {
  const map = (kind: 'in' | 'out') => (l: Leg): Fill => ({ kind, t: l.t, px: l.px, sz: l.sz, pnl: l.pnl, fee: l.fee });
  return [...inc.map(map('in')), ...dec.map(map('out'))].sort((a, b) => a.t - b.t || (a.kind === 'in' ? -1 : 1));
}

const vwap = (legs: Leg[]) => {
  const q = legs.reduce((s, l) => s + l.sz, 0);
  return q > 0 ? legs.reduce((s, l) => s + l.sz * l.px, 0) / q : 0;
};

/** What a fill's `dir` string says it did, for cross-checking. */
function expectedKind(dir: string): 'open' | 'close' | 'flip' | 'unknown' {
  const d = dir.toLowerCase();
  if (d.includes('>')) return 'flip';
  if (d.startsWith('open')) return 'open';
  if (d.startsWith('close') || d.includes('liquidat')) return 'close';
  return 'unknown';
}

/**
 * Rebuild round-trip trades from Hyperliquid fills.
 * A trade opens at 0 → non-zero and closes when the position returns to 0; a flip closes
 * and re-opens with the remainder (fee split pro-rata).
 */
export function reconstructHlTrades(fills: HlFill[]): Reconstruction {
  const byCoin = new Map<string, HlFill[]>();
  for (const f of fills) {
    if (isSpotCoin(f.coin)) continue;
    const arr = byCoin.get(f.coin) ?? [];
    arr.push(f);
    byCoin.set(f.coin, arr);
  }

  const trades: ClosedTrade[] = [];
  const mismatches: string[] = [];
  let openPositions = 0;

  for (const [coin, list] of byCoin) {
    list.sort((a, b) => a.time - b.time || (a.tid ?? 0) - (b.tid ?? 0));
    let cur = null as Open | null;

    const close = (f: HlFill) => {
      if (!cur) return;
      const fees = cur.fees;
      const trade: Trade = {
        venue: 'hyperliquid',
        coin: coin.includes(':') ? coin.split(':')[1] : coin,
        marketRef: coin,
        side: cur.side,
        entryTime: cur.entryTime,
        entryPx: vwap(cur.inc),
        exitTime: f.time,
        exitPx: vwap(cur.dec),
        sizeBase: cur.maxAbs,
        leverage: 1,
        feesUsd: fees,
        // aggregated fills carry averaged prices; clamp to the tick precision
        pxDecimals: Math.min(pxDecimalsFromRaw(cur.pxRaw), sigFigDecimals(Number(cur.pxRaw[0]))),
        fills: legsToFills(cur.inc, cur.dec),
      };
      trades.push({ id: f.hash, trade, venuePnl: cur.closedPnl - fees });
      cur = null;
    };

    const open = (f: HlFill, signedQty: number, fee: number, pnl = 0) => {
      cur = {
        coin,
        side: signedQty > 0 ? 'long' : 'short',
        entryTime: f.time,
        inc: [{ sz: Math.abs(signedQty), px: Number(f.px), t: f.time, pnl, fee }],
        dec: [],
        fees: fee,
        closedPnl: pnl,
        maxAbs: Math.abs(signedQty),
        pxRaw: [f.px],
      };
    };

    for (let fi = 0; fi < list.length; fi++) {
      const f = list[fi];
      const nominal = (f.side === 'B' ? 1 : -1) * Number(f.sz);
      const before = Number(f.startPosition);
      // Trust Hyperliquid's own position track: if the next fill starts somewhere else, the position
      // changed by more than this fill's size (merged/system fills), so attribute that change here.
      const next = list[fi + 1];
      const delta = next ? Number(next.startPosition) - before : nominal;
      const signed = Math.abs(delta) > EPS && Math.sign(delta) === Math.sign(nominal) ? delta : nominal;
      const sz = Math.abs(signed);
      const after = before + signed;
      const fee = Number(f.fee);
      const pnl = Number(f.closedPnl);
      const px = Number(f.px);
      const kind = expectedKind(f.dir);

      const sb = sgn(before);
      const sa = sgn(after);
      let actual: 'open' | 'close' | 'flip';
      if (sb === 0) actual = 'open';
      else if (sa !== 0 && sa !== sb) actual = 'flip';
      else if (Math.abs(after) > Math.abs(before) + EPS) actual = 'open';
      else actual = 'close';
      if (kind !== 'unknown' && kind !== actual) mismatches.push(`${coin}@${f.time}: dir "${f.dir}" but walk says ${actual}`);

      if (!cur) {
        // History before the loaded range: wait until the position is flat again.
        if (sb === 0 && sa !== 0) open(f, signed, fee, pnl);
        else if (actual === 'flip') open(f, after, fee * (Math.abs(after) / sz));
        continue;
      }
      const c: Open = cur;
      c.pxRaw.push(f.px);
      if (actual === 'open') {
        c.inc.push({ sz, px, t: f.time, pnl, fee });
        c.fees += fee;
        c.closedPnl += pnl;
        c.maxAbs = Math.max(c.maxAbs, Math.abs(after));
      } else if (actual === 'close') {
        c.dec.push({ sz, px, t: f.time, pnl, fee });
        c.fees += fee;
        c.closedPnl += pnl;
        if (sa === 0) close(f);
      } else {
        const closeQty = Math.abs(before);
        const closeFee = fee * (closeQty / sz);
        c.dec.push({ sz: closeQty, px, t: f.time, pnl, fee: closeFee });
        c.fees += closeFee;
        c.closedPnl += pnl;
        close(f);
        open(f, after, fee - closeFee);
      }
    }
    if (cur) openPositions++;
  }

  trades.sort((a, b) => b.trade.exitTime - a.trade.exitTime);
  return { trades, openPositions, mismatches };
}
