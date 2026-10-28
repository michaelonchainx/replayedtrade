/** Render specific frames: tsx scripts/render-at.ts <format> <frame,frame,...> [multi] → tmp/at_<fmt>_<frame>.png */
import fs from 'node:fs';
import { DEMO_CANDLES, DEMO_TRADE } from '../lib/demo';
import { DEFAULT_OPTIONS, type RenderOptions, type Trade } from '../lib/types';
import { renderFrame } from '../lib/render/renderFrame';
import { withFills } from '../lib/fills';
import { nodeScene } from './node-canvas';

const fmt = (process.argv[2] as RenderOptions['format']) ?? '16x9';
const frames = (process.argv[3] ?? '0').split(',').map(Number);
let trade: Trade = DEMO_TRADE;
if (process.argv[4] === 'multi') {
  const c = DEMO_CANDLES;
  trade = withFills(DEMO_TRADE, [
    { kind: 'in', t: DEMO_TRADE.entryTime, px: DEMO_TRADE.entryPx, sz: 500 },
    { kind: 'in', t: c[60].t + 120000, px: (c[60].h + c[60].l) / 2, sz: 433.937 },
    { kind: 'out', t: c[95].t + 120000, px: (c[95].h + c[95].l) / 2, sz: 466.97 },
    { kind: 'out', t: DEMO_TRADE.exitTime, px: DEMO_TRADE.exitPx, sz: 466.967 },
  ]);
}
const { canvas, ctx, tl } = nodeScene(trade, DEMO_CANDLES, { ...DEFAULT_OPTIONS, format: fmt });
fs.mkdirSync('tmp', { recursive: true });
for (const f of frames) {
  renderFrame(ctx, tl, f);
  fs.writeFileSync(`tmp/at_${fmt}_${f}.png`, canvas.toBuffer('image/png'));
}
console.log('fills', tl.fills.map((e) => `${e.kind}@${e.frame}`).join(' '), 'outro', tl.outroFrame, 'final', tl.finalPnl.toFixed(2));
