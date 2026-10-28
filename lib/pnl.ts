import type { Trade } from './types';

export const dirOf = (t: Pick<Trade, 'side'>) => (t.side === 'long' ? 1 : -1);

/** Entry fee share (total fee split 50/50 when only the total is known). */
export const entryFees = (t: Pick<Trade, 'feesUsd'>) => t.feesUsd / 2;

/** Live PnL at price p while the position is open (entry fees already paid). */
export function livePnl(t: Trade, p: number): number {
  return dirOf(t) * t.sizeBase * (p - t.entryPx) - entryFees(t);
}

/** Final net PnL: Σ over all fills (average cost), minus fees. Funding excluded. */
export function finalPnl(t: Trade): number {
  if (t.fills && t.fills.length > 2) {
    // inline average-cost walk (kept here to avoid a pnl ↔ fills import cycle)
    const fs = [...t.fills].sort((a, b) => a.t - b.t || (a.kind === 'in' ? -1 : 1));
    let q = 0;
    let avg = 0;
    let realized = 0;
    for (const f of fs) {
      if (f.kind === 'in') {
        avg = (avg * q + f.px * f.sz) / (q + f.sz);
        q += f.sz;
      } else {
        const sz = Math.min(f.sz, q);
        realized += dirOf(t) * (f.px - avg) * sz;
        q -= sz;
      }
    }
    return realized - t.feesUsd;
  }
  return dirOf(t) * t.sizeBase * (t.exitPx - t.entryPx) - t.feesUsd;
}

export function margin(t: Pick<Trade, 'sizeBase' | 'entryPx' | 'leverage'>): number {
  return (t.sizeBase * t.entryPx) / Math.max(1e-9, t.leverage);
}

/** Return ratio (0.0561 = 5.61%) = net PnL / margin */
export function returnRatio(t: Trade, pnl: number): number {
  const m = margin(t);
  return m > 0 ? pnl / m : 0;
}

export function positionUsd(t: Pick<Trade, 'sizeBase' | 'entryPx'>): number {
  return t.sizeBase * t.entryPx;
}
