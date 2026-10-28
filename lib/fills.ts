import type { Fill, Trade } from './types';
import { dirOf } from './pnl';

const EPS = 1e-12;

/** The trade's executions in time order (a plain trade = one in + one out). */
export function tradeFills(t: Trade): Fill[] {
  if (t.fills && t.fills.length >= 2) return [...t.fills].sort((a, b) => a.t - b.t || (a.kind === 'in' ? -1 : 1));
  return [
    { kind: 'in', t: t.entryTime, px: t.entryPx, sz: t.sizeBase },
    { kind: 'out', t: t.exitTime, px: t.exitPx, sz: t.sizeBase },
  ];
}

/**
 * Make a fill list consistent: starts with an `in`, outs never exceed the open position,
 * and the last fill closes whatever is left.
 */
export function normalizeFills(fills: Fill[]): Fill[] {
  const sorted = [...fills].filter((f) => f.px > 0 && f.sz > 0).sort((a, b) => a.t - b.t || (a.kind === 'in' ? -1 : 1));
  const out: Fill[] = [];
  let q = 0;
  for (const f of sorted) {
    if (f.kind === 'in') {
      out.push({ ...f });
      q += f.sz;
    } else if (q > EPS) {
      const sz = Math.min(f.sz, q);
      out.push({ ...f, sz });
      q -= sz;
    }
  }
  // the final out closes the position
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].kind === 'out') {
      out[i] = { ...out[i], sz: out[i].sz + q };
      break;
    }
  }
  return out;
}

export interface FillState {
  /** open size (coin units) */
  q: number;
  /** average cost of the open position */
  avg: number;
  /** realized PnL so far (gross, before fees) */
  realized: number;
  /** fees paid so far */
  fees: number;
}

/** Notional-weighted fee per fill (total fees spread across executions). */
function feeShares(t: Trade, fills: Fill[]): number[] {
  const notional = fills.reduce((s, f) => s + f.sz * f.px, 0);
  return fills.map((f) => (notional > 0 ? (t.feesUsd * f.sz * f.px) / notional : 0));
}

/** Position state after applying fills[0..n). Average-cost accounting. */
export function stateAfter(t: Trade, fills: Fill[], n: number): FillState {
  const dir = dirOf(t);
  const fee = feeShares(t, fills);
  let q = 0;
  let avg = 0;
  let realized = 0;
  let fees = 0;
  for (let i = 0; i < Math.min(n, fills.length); i++) {
    const f = fills[i];
    fees += fee[i];
    if (f.kind === 'in') {
      avg = q + f.sz > 0 ? (avg * q + f.px * f.sz) / (q + f.sz) : f.px;
      q += f.sz;
    } else {
      const sz = Math.min(f.sz, q);
      realized += dir * (f.px - avg) * sz;
      q -= sz;
    }
  }
  return { q, avg, realized, fees };
}

/** Net PnL with fills[0..n) executed and the rest marked at price p. */
export function pnlWithFills(t: Trade, fills: Fill[], n: number, p: number): number {
  const s = stateAfter(t, fills, n);
  return s.realized + dirOf(t) * s.q * (p - s.avg) - s.fees;
}

const vwap = (fs: Fill[]) => {
  const q = fs.reduce((s, f) => s + f.sz, 0);
  return q > 0 ? fs.reduce((s, f) => s + f.sz * f.px, 0) / q : 0;
};

/** Recompute the aggregate trade fields from a fill list (fills are normalized first). */
export function withFills(t: Trade, raw: Fill[]): Trade {
  const fills = normalizeFills(raw);
  const ins = fills.filter((f) => f.kind === 'in');
  const outs = fills.filter((f) => f.kind === 'out');
  if (!ins.length || !outs.length) return t;
  let q = 0;
  let max = 0;
  for (const f of fills) {
    q += f.kind === 'in' ? f.sz : -f.sz;
    max = Math.max(max, q);
  }
  const multi = fills.length > 2;
  return {
    ...t,
    fills: multi ? fills : undefined,
    entryTime: ins[0].t,
    entryPx: vwap(ins),
    exitTime: outs[outs.length - 1].t,
    exitPx: vwap(outs),
    sizeBase: max,
  };
}
