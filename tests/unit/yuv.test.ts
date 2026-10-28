import { describe, expect, it } from 'vitest';
import { rgbaToI420 } from '@/lib/export/yuv';

const px = (r: number, g: number, b: number) => {
  const rgba = new Uint8ClampedArray(2 * 2 * 4);
  for (let i = 0; i < 4; i++) rgba.set([r, g, b, 255], i * 4);
  const out = new Uint8Array(6);
  rgbaToI420(rgba, 2, 2, out);
  return { y: out[0], u: out[4], v: out[5] };
};

describe('rgbaToI420 (BT.709 limited range)', () => {
  it('maps black/white to 16/235 with neutral chroma', () => {
    expect(px(0, 0, 0)).toEqual({ y: 16, u: 128, v: 128 });
    expect(px(255, 255, 255)).toEqual({ y: 235, u: 128, v: 128 });
  });
  it('brand green has the right chroma signs', () => {
    const g = px(0x34, 0xce, 0x8c);
    expect(g.y).toBeGreaterThan(120);
    expect(g.v).toBeLessThan(128);
  });
});
