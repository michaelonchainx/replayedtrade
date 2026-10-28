/**
 * RGBA → I420 (BT.709, limited/TV range). Feeding the encoder explicit limited-range YUV makes the
 * output `yuv420p` instead of the full-range `yuvj420p` Chrome produces from canvas frames.
 * Width and height must be even.
 */
export function rgbaToI420(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, out: Uint8Array): void {
  const ySize = w * h;
  const cw = w >> 1;
  const uOff = ySize;
  const vOff = ySize + cw * (h >> 1);
  // fixed-point (×2^16) BT.709 coefficients, pre-scaled to limited range (219/255 luma, 224/255 chroma)
  const YR = 11966, YG = 40254, YB = 4064; // 0.2126/0.7152/0.0722 × 219/255
  const UR = -6596, UG = -22189, UB = 28785; // -0.1146/-0.3854/0.5 × 224/255
  const VR = 28785, VG = -26145, VB = -2640; // 0.5/-0.4542/-0.0458 × 224/255
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      let rs = 0, gs = 0, bs = 0;
      for (let dy = 0; dy < 2; dy++) {
        const row = (y + dy) * w;
        for (let dx = 0; dx < 2; dx++) {
          const p = (row + x + dx) * 4;
          const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
          out[row + x + dx] = 16 + ((YR * r + YG * g + YB * b + 32768) >> 16);
          rs += r;
          gs += g;
          bs += b;
        }
      }
      const ci = (y >> 1) * cw + (x >> 1);
      out[uOff + ci] = 128 + ((UR * rs + UG * gs + UB * bs + 131072) >> 18);
      out[vOff + ci] = 128 + ((VR * rs + VG * gs + VB * bs + 131072) >> 18);
    }
  }
}
