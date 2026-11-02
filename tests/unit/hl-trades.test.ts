import { describe, expect, it } from 'vitest';
import { reconstructHlTrades, type HlFill } from '@/lib/hyperliquid/trades';

let tid = 0;
function fill(coin: string, side: 'B' | 'A', sz: number, px: number, start: number, dir: string, time: number, extra: Partial<HlFill> = {}): HlFill {
  return { coin, side, sz: String(sz), px: String(px), startPosition: String(start), dir, time, closedPnl: '0', fee: '1', hash: `0x${time.toString(16)}`, tid: ++tid, ...extra };
}

describe('reconstructHlTrades', () => {
  it('simple long', () => {
    const r = reconstructHlTrades([
      fill('HYPE', 'B', 10, 20, 0, 'Open Long', 1000),
      fill('HYPE', 'A', 10, 22, 10, 'Close Long', 2000, { closedPnl: '20', hash: '0xclose' }),
    ]);
    expect(r.mismatches).toEqual([]);
    expect(r.trades).toHaveLength(1);
    const { trade: t, id, venuePnl } = r.trades[0];
    expect(t).toMatchObject({ side: 'long', entryPx: 20, exitPx: 22, sizeBase: 10, feesUsd: 2, entryTime: 1000, exitTime: 2000 });
    expect(id).toBe('0xclose');
    expect(venuePnl).toBe(18);
  });

  it('simple short', () => {
    const r = reconstructHlTrades([
      fill('BTC', 'A', 1, 100, 0, 'Open Short', 1),
      fill('BTC', 'B', 1, 90, -1, 'Close Short', 2, { closedPnl: '10' }),
    ]);
    expect(r.mismatches).toEqual([]);
    expect(r.trades[0].trade).toMatchObject({ side: 'short', entryPx: 100, exitPx: 90 });
    expect(r.trades[0].venuePnl).toBe(8);
  });

  it('scale-in uses size-weighted entry and max abs size', () => {
    const r = reconstructHlTrades([
      fill('ETH', 'B', 1, 100, 0, 'Open Long', 1),
      fill('ETH', 'B', 3, 120, 1, 'Open Long', 2),
      fill('ETH', 'A', 4, 130, 4, 'Close Long', 3),
    ]);
    expect(r.mismatches).toEqual([]);
    expect(r.trades[0].trade.entryPx).toBeCloseTo(115);
    expect(r.trades[0].trade.sizeBase).toBe(4);
    expect(r.trades[0].trade.feesUsd).toBe(3);
    expect(r.trades[0].trade.fills).toHaveLength(3);
  });

  it('partial closes average the exit', () => {
    const r = reconstructHlTrades([
      fill('ETH', 'B', 4, 100, 0, 'Open Long', 1),
      fill('ETH', 'A', 1, 110, 4, 'Close Long', 2, { closedPnl: '10' }),
      fill('ETH', 'A', 3, 130, 3, 'Close Long', 3, { closedPnl: '90' }),
    ]);
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].trade.exitPx).toBeCloseTo(125);
    expect(r.trades[0].venuePnl).toBeCloseTo(97);
    expect(r.trades[0].trade.exitTime).toBe(3);
  });

  it('flip closes and re-opens with the remainder, fee split pro-rata', () => {
    const r = reconstructHlTrades([
      fill('SOL', 'B', 2, 10, 0, 'Open Long', 1, { fee: '2' }),
      fill('SOL', 'A', 5, 12, 2, 'Long > Short', 2, { fee: '5', closedPnl: '4', hash: '0xflip' }),
      fill('SOL', 'B', 3, 11, -3, 'Close Short', 3, { fee: '3', closedPnl: '3' }),
    ]);
    expect(r.mismatches).toEqual([]);
    expect(r.trades).toHaveLength(2);
    const [short, long] = r.trades; // newest first
    expect(long.trade).toMatchObject({ side: 'long', sizeBase: 2, exitPx: 12 });
    expect(long.id).toBe('0xflip');
    expect(long.trade.feesUsd).toBeCloseTo(2 + 2);
    expect(long.venuePnl).toBeCloseTo(4 - 4);
    expect(short.trade).toMatchObject({ side: 'short', sizeBase: 3, entryPx: 12, exitPx: 11 });
    expect(short.trade.feesUsd).toBeCloseTo(3 + 3);
  });

  it('liquidation closes the trade', () => {
    const r = reconstructHlTrades([
      fill('DOGE', 'B', 100, 1, 0, 'Open Long', 1),
      fill('DOGE', 'A', 100, 0.5, 100, 'Close Long', 2, { liquidation: { method: 'market' }, closedPnl: '-50' }),
    ]);
    expect(r.mismatches).toEqual([]);
    expect(r.trades[0].venuePnl).toBeCloseTo(-52);
  });

  it('interleaved coins are tracked independently and spot is skipped', () => {
    const r = reconstructHlTrades([
      fill('BTC', 'B', 1, 100, 0, 'Open Long', 1),
      fill('ETH', 'A', 2, 50, 0, 'Open Short', 2),
      fill('@107', 'B', 5, 1, 0, 'Buy', 3),
      fill('BTC', 'A', 1, 110, 1, 'Close Long', 4),
      fill('ETH', 'B', 2, 45, -2, 'Close Short', 5),
    ]);
    expect(r.mismatches).toEqual([]);
    expect(r.trades.map((t) => t.trade.coin)).toEqual(['ETH', 'BTC']);
  });

  it('same-candle open/close', () => {
    const r = reconstructHlTrades([
      fill('HYPE', 'B', 1, 20, 0, 'Open Long', 1000),
      fill('HYPE', 'A', 1, 20.5, 1, 'Close Long', 1010),
    ]);
    expect(r.trades[0].trade.exitTime - r.trades[0].trade.entryTime).toBe(10);
  });

  it('open positions are counted, not listed; history before range is ignored', () => {
    const r = reconstructHlTrades([
      fill('BTC', 'A', 1, 100, 1, 'Close Long', 1),
      fill('ETH', 'B', 1, 100, 0, 'Open Long', 2),
    ]);
    expect(r.trades).toHaveLength(0);
    expect(r.openPositions).toBe(1);
  });

  it('flags dir mismatches', () => {
    const r = reconstructHlTrades([fill('BTC', 'B', 1, 100, 0, 'Close Short', 1)]);
    expect(r.mismatches).toHaveLength(1);
  });

  it('follows the position track when fills skip size (merged/system fills)', () => {
    // the 2nd fill reports 1 unit but the next fill starts at 0 → it really closed 3
    const r = reconstructHlTrades([
      fill('ETH', 'A', 3, 100, 0, 'Open Short', 1, { fee: '0' }),
      fill('ETH', 'B', 1, 90, -3, 'Close Short', 2, { fee: '0', closedPnl: '30' }),
      fill('ETH', 'A', 1, 95, 0, 'Open Short', 3, { fee: '0' }),
      fill('ETH', 'B', 1, 94, -1, 'Close Short', 4, { fee: '0', closedPnl: '1' }),
    ]);
    expect(r.trades).toHaveLength(2);
    const first = r.trades[1].trade;
    expect(first.fills!.filter((f) => f.kind === 'out').reduce((a, f) => a + f.sz, 0)).toBe(3);
  });

  it('wallet trades end exactly on the venue-reported PnL', async () => {
    const { finalPnl } = await import('@/lib/pnl');
    const r = reconstructHlTrades([
      fill('BTC', 'B', 1, 100, 0, 'Open Long', 1, { fee: '0.5' }),
      fill('BTC', 'B', 1, 110, 1, 'Open Long', 2, { fee: '0.5' }),
      fill('BTC', 'A', 2, 120, 2, 'Close Long', 3, { fee: '1', closedPnl: '29.37' }),
    ]);
    expect(finalPnl(r.trades[0].trade)).toBeCloseTo(29.37 - 2, 6);
    expect(r.trades[0].venuePnl).toBeCloseTo(27.37, 6);
  });
});
