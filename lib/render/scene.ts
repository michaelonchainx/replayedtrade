import type { Candle, RenderOptions, Trade } from '../types';
import { layoutFor } from './layout';
import { renderBackground } from './background';
import { buildTimeline, type SceneTimeline } from './timeline';

export interface SceneInput {
  trade: Trade;
  candles: Candle[];
  options: RenderOptions;
  avatar: ImageBitmap | null;
}

/** Fonts the canvas renderer uses (same files as the page). */
export const CANVAS_FONTS: { family: string; file: string; weight: string }[] = [
  { family: 'Archivo', file: 'archivo-latin-900-normal.woff2', weight: '900' },
  { family: 'JetBrains Mono', file: 'jetbrains-mono-latin-400-normal.woff2', weight: '400' },
  { family: 'JetBrains Mono', file: 'jetbrains-mono-latin-500-normal.woff2', weight: '500' },
  { family: 'JetBrains Mono', file: 'jetbrains-mono-latin-700-normal.woff2', weight: '700' },
  { family: 'JetBrains Mono', file: 'jetbrains-mono-latin-800-normal.woff2', weight: '800' },
];

const fontSets = new WeakSet<FontFaceSet>();

/** Load the brand fonts into a document or worker FontFaceSet. */
export async function ensureCanvasFonts(set: FontFaceSet, base = ''): Promise<void> {
  if (!fontSets.has(set)) {
    // Load from bytes: URL-sourced FontFaces can stall inside workers.
    await Promise.all(
      CANVAS_FONTS.map(async (f) => {
        const res = await fetch(`${base}/fonts/${f.file}`);
        const face = new FontFace(f.family, await res.arrayBuffer(), { weight: f.weight, style: 'normal' });
        await face.load();
        set.add(face);
      }),
    );
    fontSets.add(set);
  }
  // `ready` never settles in some worker implementations; only await it in documents.
  if (typeof document !== 'undefined') await set.ready;
}

type Canvasish = HTMLCanvasElement | OffscreenCanvas;
const bgCache = new Map<string, CanvasImageSource>();

function makeCanvas(w: number, h: number): Canvasish {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Background is rendered once per format and reused for every frame / export. */
export function backgroundFor(W: number, H: number, grid: number): CanvasImageSource {
  const key = `${W}x${H}:${grid}`;
  let bg = bgCache.get(key);
  if (!bg) {
    bg = renderBackground((w, h) => makeCanvas(w, h) as never, W, H, grid) as unknown as CanvasImageSource;
    bgCache.set(key, bg);
  }
  return bg;
}

export function createScene(canvas: Canvasish, input: SceneInput): { tl: SceneTimeline; ctx: CanvasRenderingContext2D } {
  const L = layoutFor(input.options.format);
  if (canvas.width !== L.W) canvas.width = L.W;
  if (canvas.height !== L.H) canvas.height = L.H;
  const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
  const tl = buildTimeline(input.trade, input.candles, input.options, {
    avatar: input.avatar,
    background: backgroundFor(L.W, L.H, L.grid),
  });
  return { tl, ctx };
}
