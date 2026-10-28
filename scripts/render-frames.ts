/** Render comparison frames next to the reference: reference/compare/t_XX.png (top = reference, bottom = ours). */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import { DEMO_CANDLES, DEMO_TRADE } from '../lib/demo';
import { DEFAULT_OPTIONS, type RenderOptions } from '../lib/types';
import { renderFrame } from '../lib/render/renderFrame';
import { nodeScene } from './node-canvas';

async function main() {
  const fmt = (process.argv[2] as RenderOptions['format']) ?? '16x9';
  const out = path.resolve(__dirname, '../reference/compare');
  fs.mkdirSync(out, { recursive: true });
  const options = { ...DEFAULT_OPTIONS, format: fmt };
  const { canvas, ctx, tl } = nodeScene(DEMO_TRADE, DEMO_CANDLES, options);
  const times = [0, 3, 9, 15, 19, 24];
  for (const t of times) {
    const frame = Math.min(tl.frames - 1, Math.round(t * tl.fps));
    renderFrame(ctx, tl, frame);
    const ours = canvas.toBuffer('image/png');
    if (fmt === '16x9') {
      const refPath = path.resolve(__dirname, `../reference/frames/f_${String(t * 2 + 1).padStart(3, '0')}.png`);
      const cmp = createCanvas(1920, 2160);
      const c2 = cmp.getContext('2d');
      if (fs.existsSync(refPath)) c2.drawImage(await loadImage(refPath), 0, 0);
      c2.drawImage(await loadImage(ours), 0, 1080);
      fs.writeFileSync(path.join(out, `t_${String(t).padStart(2, '0')}.png`), cmp.toBuffer('image/png'));
    }
    fs.writeFileSync(path.join(out, `ours_${fmt}_${String(t).padStart(2, '0')}.png`), ours);
  }
  console.log('entryFrame', tl.entryFrame, 'exitFrame', tl.exitFrame, 'final', tl.pnl[tl.frames - 1].toFixed(2), (tl.ret[tl.frames - 1] * 100).toFixed(2));
}
main();
