import type { Trade } from './types';

/** How the trade size is entered: USD notional, USD margin, or coin quantity. */
export type SizeMode = 'position' | 'margin' | 'tokens';

/** Size in coin units from the manual sizing inputs. */
export function sizeBaseFrom(mode: SizeMode, amount: number, leverage: number, entryPx: number): number {
  if (mode === 'tokens') return amount;
  const notional = mode === 'position' ? amount : amount * leverage;
  return entryPx > 0 ? notional / entryPx : 0;
}

/** The trade's (max) size expressed in a size mode's unit. */
export function sizeIn(mode: SizeMode, t: Pick<Trade, 'sizeBase' | 'entryPx' | 'leverage'>): number {
  if (mode === 'tokens') return Math.round(t.sizeBase * 1e6) / 1e6;
  const notional = t.sizeBase * t.entryPx;
  return Math.round((mode === 'position' ? notional : notional / Math.max(1, t.leverage)) * 100) / 100;
}
