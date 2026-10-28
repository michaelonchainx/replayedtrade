import { describe, expect, it } from 'vitest';
import { DEMO_TRADE } from '@/lib/demo';
import { normalizeFills, pnlWithFills, stateAfter, tradeFills, withFills } from '@/lib/fills';
import { finalPnl } from '@/lib/pnl';
import type { Fill } from '@/lib/types';

const base = { ...DEMO_TRADE, feesUsd: 0 };

describe('fills', () => {
  it('a plain trade is one in + one out', () => {
    const f = tradeFills(DEMO_TRADE);
    expect(f.map((x) => x.kind)).toEqual(['in', 'out']);
    expect(f[0].sz).toBe(DEMO_TRADE.sizeBase);
  });

  it('scale-in + partial exits: aggregates and average-cost PnL', () => {
    const fills: Fill[] = [
      { kind: 'in', t: 1, px: 100, sz: 1 },
      { kind: 'in', t: 2, px: 110, sz: 1 },
      { kind: 'out', t: 3, px: 120, sz: 1 },
      { kind: 'out', t: 4, px: 130, sz: 1 },
    ];
    const t = withFills({ ...base, side: 'long' }, fills);
    expect(t.entryPx).toBe(105);
    expect(t.exitPx).toBe(125);
    expect(t.sizeBase).toBe(2);
    expect(t.entryTime).toBe(1);
    expect(t.exitTime).toBe(4);
    // avg cost 105: (120-105) + (130-105) = 40
    expect(finalPnl(t)).toBeCloseTo(40);
    // after the first out, 1 unit open marked at 125
    expect(pnlWithFills(t, tradeFills(t), 3, 125)).toBeCloseTo(15 + 20);
  });

  it('short side flips the sign', () => {
    const t = withFills({ ...base, side: 'short' }, [
      { kind: 'in', t: 1, px: 100, sz: 2 },
      { kind: 'out', t: 2, px: 90, sz: 1 },
      { kind: 'out', t: 3, px: 95, sz: 1 },
    ]);
    expect(finalPnl(t)).toBeCloseTo(10 + 5);
  });

  it('normalize clamps outs and makes the last fill close the position', () => {
    const n = normalizeFills([
      { kind: 'out', t: 0, px: 1, sz: 5 }, // before any entry → dropped
      { kind: 'in', t: 1, px: 10, sz: 3 },
      { kind: 'out', t: 2, px: 11, sz: 10 }, // clamped to 3
      { kind: 'in', t: 3, px: 12, sz: 2 },
      { kind: 'out', t: 4, px: 13, sz: 0.5 }, // last → closes the remaining 2
    ]);
    expect(n.map((f) => [f.kind, f.sz])).toEqual([
      ['in', 3],
      ['out', 3],
      ['in', 2],
      ['out', 2],
    ]);
  });

  it('fees are spread across executions by notional', () => {
    const t = DEMO_TRADE;
    const fs = tradeFills(t);
    expect(stateAfter(t, fs, 2).fees).toBeCloseTo(t.feesUsd);
    expect(pnlWithFills(t, fs, 2, 0)).toBeCloseTo(finalPnl(t));
  });
});

describe('size modes', () => {
  it('tokens, USD and margin all describe the same size', async () => {
    const { sizeBaseFrom, sizeIn } = await import('@/lib/sizing');
    const t = { sizeBase: 933.937, entryPx: 77.966, leverage: 2 };
    expect(sizeBaseFrom('tokens', 933.937, 2, 77.966)).toBe(933.937);
    expect(sizeBaseFrom('position', sizeIn('position', t), 2, 77.966)).toBeCloseTo(933.937, 3);
    expect(sizeBaseFrom('margin', sizeIn('margin', t), 2, 77.966)).toBeCloseTo(933.937, 3);
    expect(sizeIn('tokens', t)).toBe(933.937);
  });
});
