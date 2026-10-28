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

  it('renders 9:16 and short/% only variants without throwing', () => {
    const s = nodeScene({ ...DEMO_TRADE, side: 'short' }, DEMO_CANDLES, { ...DEFAULT_OPTIONS, format: '9x16', percentOnly: true, showSize: true, length: 15 });
    expect(s.tl.frames).toBe(450);
    for (const f of [0, 100, 449]) renderFrame(s.ctx, s.tl, f);
    expect(s.tl.pnl[449]).toBeLessThan(0);
  });
});
