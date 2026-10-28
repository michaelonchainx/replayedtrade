import { BufferTarget, Mp4OutputFormat, Output, VideoSample, VideoSampleSource } from 'mediabunny';
import { renderFrame } from '../render/renderFrame';
import type { SceneTimeline } from '../render/timeline';
import { rgbaToI420 } from './yuv';

/**
 * The spec asked for ~8 Mbps *and* < ~15 MB per 25 s; those conflict (8 Mbps × 25 s ≈ 25 MB).
 * 4.5 Mbps keeps a 25 s 1080p30 replay ≈ 14 MB with no visible loss on this flat, dark content.
 */
export const BITRATE = 4_500_000;
export const KEYFRAME_SECONDS = 2;
const BT709_LIMITED: VideoColorSpaceInit = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false };

export interface EncodeHooks {
  onProgress: (done: number, total: number) => void;
  isCancelled: () => boolean;
  /** yield to the UI every N frames (main-thread fallback) */
  yieldEvery?: number;
}

export class CancelledError extends Error {
  constructor() {
    super('cancelled');
  }
}

/** Render every frame with the shared renderer and encode H.264 yuv420p MP4 (fast start). */
export async function encodeMp4(canvas: HTMLCanvasElement | OffscreenCanvas, ctx: CanvasRenderingContext2D, tl: SceneTimeline, hooks: EncodeHooks): Promise<ArrayBuffer> {
  const { width: w, height: h } = canvas;
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const source = new VideoSampleSource({
    codec: 'avc',
    bitrate: BITRATE,
    keyFrameInterval: KEYFRAME_SECONDS,
    latencyMode: 'quality',
  });
  output.addVideoTrack(source, { frameRate: tl.fps });
  await output.start();
  const yuv = new Uint8Array((w * h * 3) / 2);
  try {
    for (let i = 0; i < tl.frames; i++) {
      if (hooks.isCancelled()) throw new CancelledError();
      renderFrame(ctx, tl, i);
      rgbaToI420(ctx.getImageData(0, 0, w, h).data, w, h, yuv);
      const sample = new VideoSample(yuv, { format: 'I420', codedWidth: w, codedHeight: h, timestamp: i / tl.fps, duration: 1 / tl.fps, colorSpace: BT709_LIMITED });
      try {
        await source.add(sample);
      } finally {
        sample.close();
      }
      hooks.onProgress(i + 1, tl.frames);
      if (hooks.yieldEvery && i % hooks.yieldEvery === 0) await new Promise((r) => setTimeout(r, 0));
    }
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => undefined);
    throw e;
  }
  const buf = output.target.buffer;
  if (!buf) throw new Error('Encoder produced no data');
  return buf;
}

/** Can this browser encode H.264 at the requested size? */
export async function isExportSupported(width: number, height: number): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false;
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42003e']) {
    try {
      const r = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate: BITRATE, framerate: 30 });
      if (r.supported) return true;
    } catch {
      // try the next profile
    }
  }
  return false;
}
