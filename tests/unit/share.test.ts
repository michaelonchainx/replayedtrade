import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare } from '@/lib/share/url';
import { DEMO_TRADE } from '@/lib/demo';
import { DEFAULT_OPTIONS } from '@/lib/types';
import LZString from 'lz-string';

describe('share links', () => {
  it('round-trips', () => {
    const r = decodeShare(encodeShare(DEMO_TRADE, DEFAULT_OPTIONS));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.trade.entryPx).toBe(77.966);
  });
  it('rejects garbage and invalid payloads', () => {
    expect(decodeShare('nope').ok).toBe(false);
    const bad = LZString.compressToEncodedURIComponent(JSON.stringify({ v: 1, trade: { ...DEMO_TRADE, entryPx: -1 }, options: DEFAULT_OPTIONS }));
    expect(decodeShare(bad).ok).toBe(false);
  });
  it('round-trips multi-fill trades', () => {
    const t = { ...DEMO_TRADE, fills: [
      { kind: 'in' as const, t: DEMO_TRADE.entryTime, px: 77.966, sz: 500 },
      { kind: 'in' as const, t: DEMO_TRADE.entryTime + 600_000, px: 78, sz: 433.937 },
      { kind: 'out' as const, t: DEMO_TRADE.exitTime, px: 80.209, sz: 933.937 },
    ] };
    const r = decodeShare(encodeShare(t, DEFAULT_OPTIONS));
    expect(r.ok && r.payload.trade.fills?.length).toBe(3);
  });
});
