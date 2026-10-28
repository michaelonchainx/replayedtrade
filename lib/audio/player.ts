'use client';
import { AUDIO_SAMPLE_RATE, kachingKindFor, synthKaching, type KachingKind } from './kaching';

/**
 * Preview playback of the ka-chings via Web Audio. Created on a user gesture (autoplay policy);
 * uses the exact same synthesized sounds as the MP4 track.
 */
export class KachingPlayer {
  private ctx: AudioContext;
  private buffers = new Map<KachingKind, AudioBuffer>();

  constructor() {
    this.ctx = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE });
    for (const kind of ['in', 'out', 'close'] as const) {
      const data = synthKaching(kind);
      const buf = this.ctx.createBuffer(1, data.length, AUDIO_SAMPLE_RATE);
      buf.copyToChannel(data, 0);
      this.buffers.set(kind, buf);
    }
  }

  resume(): Promise<void> {
    return this.ctx.state === 'suspended' ? this.ctx.resume() : Promise.resolve();
  }

  play(kind: 'in' | 'out', index: number, total: number): void {
    const buf = this.buffers.get(kachingKindFor(kind, index, total));
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    src.start();
  }

  close(): void {
    this.ctx.close().catch(() => undefined);
  }
}

/** Events whose frame lies in (from, to] — handles the loop wrap-around. */
export function crossedEvents<T extends { frame: number }>(events: T[], from: number, to: number): number[] {
  const hit: number[] = [];
  events.forEach((e, i) => {
    const crossed = to >= from ? e.frame > from && e.frame <= to : e.frame > from || e.frame <= to;
    if (crossed) hit.push(i);
  });
  return hit;
}
