import { hashString, mulberry32 } from '../rng';

const PALETTE = ['#6EF278', '#5BD965', '#6EF278', '#4FC45A'];
const DARK = '#0A0C0B';

/** Deterministic symmetric 8×8 pixel-art grid (colors, row-major) from a username. */
export function identiconCells(username: string): string[] {
  const rnd = mulberry32(hashString(username.toLowerCase() || 'anon'));
  const main = PALETTE[Math.floor(rnd() * PALETTE.length)];
  const cells: string[] = new Array(64);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 4; x++) {
      // bias towards the main color so it reads as a face/creature, like the reference
      const r = rnd();
      const c = r < 0.66 ? main : DARK;
      cells[y * 8 + x] = c;
      cells[y * 8 + (7 - x)] = c;
    }
  }
  return cells;
}

/** Draw the identicon filling the square (x, y, size). */
export function drawIdenticon(ctx: CanvasRenderingContext2D, username: string, x: number, y: number, size: number): void {
  const cells = identiconCells(username);
  const s = size / 8;
  for (let i = 0; i < 64; i++) {
    ctx.fillStyle = cells[i];
    // +0.5 overlap avoids hairline seams between cells
    ctx.fillRect(x + (i % 8) * s, y + Math.floor(i / 8) * s, s + 0.5, s + 0.5);
  }
}
