import { createCanvas, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';
import path from 'node:path';
import { renderBackground } from '../lib/render/background';
import { buildTimeline, type Branding } from '../lib/render/timeline';
import { CANVAS_FONTS } from '../lib/render/scene';
import { layoutFor } from '../lib/render/layout';
import type { Candle, RenderOptions, Trade } from '../lib/types';

let fontsLoaded = false;
export function loadFonts(): void {
  if (fontsLoaded) return;
  for (const f of CANVAS_FONTS) GlobalFonts.registerFromPath(path.resolve(__dirname, `../public/fonts/${f.file}`), f.family);
  fontsLoaded = true;
}

/** Build a timeline + canvas in Node (tests, frame scripts). */
export function nodeScene(trade: Trade, candles: Candle[], options: RenderOptions, extra: Partial<Branding> = {}) {
  loadFonts();
  const L = layoutFor(options.format);
  const canvas = createCanvas(L.W, L.H);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  const bg = renderBackground((w, h) => createCanvas(w, h) as never, L.W, L.H, L.grid);
  const branding: Branding = { avatar: null, background: bg as unknown as CanvasImageSource, ...extra };
  const tl = buildTimeline(trade, candles, options, branding);
  return { canvas, ctx, tl, raw: canvas.getContext('2d') as SKRSContext2D };
}
