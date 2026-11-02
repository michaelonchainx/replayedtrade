import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { DEMO_CANDLES, DEMO_TRADE } from '@/lib/demo';
import { DEFAULT_OPTIONS } from '@/lib/types';
import { renderFrame } from '@/lib/render/renderFrame';
import { formatPnl, formatPct } from '@/lib/format';
import { nodeScene } from '@/scripts/node-canvas';

const hash = (buf: Uint8ClampedArray) => createHash('sha256').update(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)).digest('hex');

describe('renderer', () => {
  it('is deterministic: frame N rendered twice (and out of order) is pixel-identical', () => {
    const { canvas, ctx, tl, raw } = nodeScene(DEMO_TRADE, DEMO_CANDLES, DEFAULT_OPTIONS);
    const N = 400;
    renderFrame(ctx, tl, N);
    const a = hash(raw.getImageData(0, 0, canvas.width, canvas.height).data);
    renderFrame(ctx, tl, 10);
    renderFrame(ctx, tl, 700);
    renderFrame(ctx, tl, N);
    const b = hash(raw.getImageData(0, 0, canvas.width, canvas.height).data);
    expect(a).toBe(b);
    // a fresh scene gives the same pixels too
    const s2 = nodeScene(DEMO_TRADE, DEMO_CANDLES, DEFAULT_OPTIONS);
    renderFrame(s2.ctx, s2.tl, N);
    expect(hash(s2.raw.getImageData(0, 0, 1920, 1080).data)).toBe(a);
  });

  it('timeline: $0.00 before entry, frozen final after exit, Exit freeze', () => {
    const { tl } = nodeScene(DEMO_TRADE, DEMO_CANDLES, DEFAULT_OPTIONS);
    expect(tl.frames).toBe(750);
    expect(tl.pnl[0]).toBe(0);
    expect(tl.entryFrame).toBeGreaterThan(0);
    expect(tl.exitFrame).toBeGreaterThan(tl.entryFrame);
    expect(formatPnl(tl.pnl[tl.frames - 1])).toBe('+$2,042.47');
    expect(formatPct(tl.ret[tl.frames - 1])).toBe('+5.61%');
    for (let i = tl.exitFrame; i < tl.frames; i++) expect(tl.pnl[i]).toBe(tl.finalPnl);
    // live price at entry frame neighbourhood is close to the entry price
    expect(Math.abs(tl.livePx[tl.entryFrame] - DEMO_TRADE.entryPx)).toBeLessThan(0.3);
  });

  it('the PnL end card starts after the close and stays on screen', () => {
    for (const length of [15, 25, 40] as const) {
      const { tl } = nodeScene(DEMO_TRADE, DEMO_CANDLES, { ...DEFAULT_OPTIONS, length });
      expect(tl.outroFrame).toBeGreaterThanOrEqual(tl.exitFrame + tl.fps);
      expect(tl.frames - tl.outroFrame).toBeGreaterThanOrEqual(2.5 * tl.fps);
    }
  });

  it('busy trades: one marker per candle + side, sounds spaced, close always kept', async () => {
    const { withFills } = await import('@/lib/fills');
    const { SOUND_MIN_GAP_SECONDS } = await import('@/lib/render/timeline');
    const base = DEMO_CANDLES[13].t;
    const fills = [] as { kind: 'in' | 'out'; t: number; px: number; sz: number }[];
    for (let k = 0; k < 40; k++) fills.push({ kind: 'in', t: base + 60_000 + k * 1000, px: 78, sz: 10 });
    for (let k = 0; k < 400; k++) fills.push({ kind: 'out', t: base + 3_600_000 * 4 + k * 60_000, px: 79, sz: 1 });
    const trade = withFills({ ...DEMO_TRADE }, fills);
    const { tl, ctx } = nodeScene(trade, DEMO_CANDLES, DEFAULT_OPTIONS);
    const keys = tl.markers.map((m) => `${m.candle}:${m.kind}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(tl.markers.length).toBeLessThan(120);
    const gap = Math.round(SOUND_MIN_GAP_SECONDS * tl.fps);
    for (let k = 1; k < tl.sounds.length; k++) expect(tl.sounds[k].frame - tl.sounds[k - 1].frame).toBeGreaterThanOrEqual(gap);
    expect(tl.sounds[tl.sounds.length - 1]).toEqual({ frame: tl.exitFrame, kind: 'close' });
    for (const f of [tl.entryFrame + 5, tl.exitFrame, tl.frames - 1]) renderFrame(ctx, tl, f);
  });

  it('renders 9:16 and short/% only variants without throwing', () => {
    const s = nodeScene({ ...DEMO_TRADE, side: 'short' }, DEMO_CANDLES, { ...DEFAULT_OPTIONS, format: '9x16', percentOnly: true, showSize: true, length: 15 });
    expect(s.tl.frames).toBe(450);
    for (const f of [0, 100, 449]) renderFrame(s.ctx, s.tl, f);
    expect(s.tl.pnl[449]).toBeLessThan(0);
  });
});
