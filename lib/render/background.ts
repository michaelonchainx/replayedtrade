export const BG_COLOR = '#0A0C0B';

type AnyCanvas = { width: number; height: number; getContext(type: '2d'): unknown };
export type CanvasFactory = (w: number, h: number) => AnyCanvas;

/**
 * Brand background: Tape Black + the 50px grid (white at 3%). No gradients, no texture.
 * Rendered once per format; renderFrame just blits it.
 */
export function renderBackground(factory: CanvasFactory, W: number, H: number, grid: number): AnyCanvas {
  const canvas = factory(W, H);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let x = 0; x <= W; x += grid) ctx.fillRect(x, 0, 1, H);
  for (let y = 0; y <= H; y += grid) ctx.fillRect(0, y, W, 1);
  return canvas;
}
