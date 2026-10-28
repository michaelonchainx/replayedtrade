import { describe, expect, it } from 'vitest';
import { AUDIO_SAMPLE_RATE, buildSoundtrack, kachingKindFor, synthKaching } from '@/lib/audio/kaching';
import { crossedEvents } from '@/lib/audio/player';

const peak = (a: Float32Array) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe('ka-ching audio', () => {
  it('is deterministic and never clips', () => {
    for (const k of ['in', 'out', 'close'] as const) {
      const a = synthKaching(k);
      const b = synthKaching(k);
      expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
      expect(peak(a)).toBeLessThanOrEqual(0.81);
      expect(peak(a)).toBeGreaterThan(0.3);
      expect(Math.abs(a[a.length - 1])).toBeLessThan(1e-3); // faded tail, no click
    }
  });

  it('entries ching, partial exits ka-ching, the last exit is the big close', () => {
    expect(kachingKindFor('in', 0, 4)).toBe('in');
    expect(kachingKindFor('out', 2, 4)).toBe('out');
    expect(kachingKindFor('out', 3, 4)).toBe('close');
  });

  it('places a sound exactly at each execution frame', () => {
    const fps = 30;
    const track = buildSoundtrack([{ kind: 'in', frame: 30 }, { kind: 'out', frame: 300 }], 750, fps);
    expect(track.length).toBe(25 * AUDIO_SAMPLE_RATE);
    const at = (s: number) => peak(track.subarray(Math.round(s * AUDIO_SAMPLE_RATE), Math.round((s + 0.05) * AUDIO_SAMPLE_RATE)));
    expect(at(0.5)).toBe(0); // silence before the entry
    expect(at(1.0)).toBeGreaterThan(0.1); // entry at frame 30 = 1 s
    expect(at(9.0)).toBe(0);
    expect(at(10.0)).toBeGreaterThan(0.1); // exit at frame 300 = 10 s
    expect(peak(track)).toBeLessThan(1);
  });

  it('detects crossings including the loop wrap', () => {
    const ev = [{ frame: 10 }, { frame: 600 }];
    expect(crossedEvents(ev, 5, 12)).toEqual([0]);
    expect(crossedEvents(ev, 10, 12)).toEqual([]);
    expect(crossedEvents(ev, 745, 11)).toEqual([0]); // wrapped
  });
});
