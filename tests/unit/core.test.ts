import { describe, expect, it } from 'vitest';
import { DEMO_CANDLES, DEMO_TRADE } from '@/lib/demo';
import { finalPnl, returnRatio, livePnl } from '@/lib/pnl';
import { formatDuration, formatPct, formatPnl, formatClock, pxDecimalsFromRaw } from '@/lib/format';
import { chooseInterval, windowFor, INTERVAL_MS } from '@/lib/interval';

describe('pnl', () => {
  it('reference trade reads +$2,042.47 / +5.61%', () => {
    const p = finalPnl(DEMO_TRADE);
    expect(formatPnl(p)).toBe('+$2,042.47');
    expect(formatPct(returnRatio(DEMO_TRADE, p))).toBe('+5.61%');
  });
  it('live pnl subtracts only entry fees', () => {
    expect(livePnl(DEMO_TRADE, DEMO_TRADE.entryPx)).toBeCloseTo(-52.35 / 2);
  });
});

describe('format', () => {
  it('signs', () => {
    expect(formatPnl(0)).toBe('$0.00');
    expect(formatPnl(0.004)).toBe('$0.00');
    expect(formatPnl(1234.561)).toBe('+$1,234.56');
    expect(formatPnl(-448.73)).toBe('-$448.73');
    expect(formatPct(0)).toBe('0.00%');
    expect(formatPct(-0.0123)).toBe('-1.23%');
  });
  it('durations', () => {
    expect(formatDuration((9 * 60 + 2) * 60000)).toBe('9H 2M');
    expect(formatDuration((52 * 60) * 60000)).toBe('2D 4H');
    expect(formatDuration(14 * 60000)).toBe('14M');
  });
  it('clock', () => {
    expect(formatClock(Date.UTC(2026, 9, 27, 6, 21), false)).toBe('06:21 UTC');
    expect(formatClock(Date.UTC(2026, 9, 27, 6, 21), true)).toBe('27 Oct 06:21 UTC');
  });
  it('decimals from raw strings', () => {
    expect(pxDecimalsFromRaw(['77.966', '80.2', '1.1234567'])).toBe(6);
    expect(pxDecimalsFromRaw(['100', '101.50'])).toBe(1);
  });
});

describe('interval', () => {
  const now = Date.UTC(2026, 9, 28);
  it('9h trade → 5m with ~135 candles', () => {
    const e = now - 2 * 86400000;
    const w = chooseInterval(e, e + 542 * 60000, 'hyperliquid', now);
    expect(w.interval).toBe('5m');
    expect(w.count).toBeGreaterThanOrEqual(100);
    expect(w.count).toBeLessThanOrEqual(160);
  });
  it('multi-week trade picks a coarser interval', () => {
    const e = now - 40 * 86400000;
    const w = chooseInterval(e, e + 20 * 86400000, 'hyperliquid', now);
    expect(INTERVAL_MS[w.interval]).toBeGreaterThanOrEqual(INTERVAL_MS['4h']);
  });
  it('respects the 5000-candle availability for old trades', () => {
    const e = now - 200 * 86400000;
    const w = chooseInterval(e, e + 3600000, 'hyperliquid', now);
    expect(w.start).toBeGreaterThanOrEqual(now - 5000 * INTERVAL_MS[w.interval]);
  });
  it('lighter only uses supported resolutions', () => {
    const e = now - 86400000;
    const w = chooseInterval(e, e + 6 * 3600000, 'lighter', now);
    expect(['1m', '5m', '15m', '30m', '1h', '4h', '12h', '1d']).toContain(w.interval);
  });
  it('never extends past now', () => {
    const e = now - 3600000;
    const w = windowFor(e, now - 60000, '1m', now);
    expect(w.end).toBeLessThanOrEqual(now);
  });
  it('same-candle trade uses the finest interval', () => {
    const e = now - 86400000 + 10_000;
    const w = chooseInterval(e, e + 30_000, 'hyperliquid', now);
    expect(w.interval).toBe('1m');
  });
  it('at least 6 candles of pre/post roll', () => {
    const e = now - 86400000;
    const w = windowFor(e, e + 10 * 60000, '1m', now);
    expect(e - w.start).toBeGreaterThanOrEqual(6 * 60000);
  });
});

describe('demo candles', () => {
  it('entry/exit candles contain the reference prices', () => {
    const iv = 300000;
    const ec = DEMO_CANDLES.find((c) => c.t <= DEMO_TRADE.entryTime && DEMO_TRADE.entryTime < c.t + iv)!;
    const xc = DEMO_CANDLES.find((c) => c.t <= DEMO_TRADE.exitTime && DEMO_TRADE.exitTime < c.t + iv)!;
    expect(ec.l).toBeLessThanOrEqual(77.966);
    expect(ec.h).toBeGreaterThanOrEqual(77.966);
    expect(xc.l).toBeLessThanOrEqual(80.209);
    expect(xc.h).toBeGreaterThanOrEqual(80.209);
  });
});
