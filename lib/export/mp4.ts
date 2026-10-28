import { createScene, ensureCanvasFonts, type SceneInput } from '../render/scene';
import { CancelledError, encodeMp4 } from './encode';
import type { WorkerOut } from './worker';

export interface ExportJob {
  promise: Promise<Blob>;
  cancel: () => void;
}

const WORKER_UNAVAILABLE = 'worker_unavailable';

/**
 * Export in a Web Worker with OffscreenCanvas; falls back to the main thread (yielding to the UI)
 * if the worker can't start or fails before producing any frame.
 */
export function exportMp4(input: SceneInput, onProgress: (done: number, total: number) => void): ExportJob {
  let cancelled = false;
  let worker: Worker | null = null;
  let rejectWorker: ((e: Error) => void) | null = null;

  const mainThread = async (): Promise<Blob> => {
    await ensureCanvasFonts(document.fonts);
    const canvas = document.createElement('canvas');
    const { tl, ctx } = createScene(canvas, input);
    const buf = await encodeMp4(canvas, ctx, tl, { onProgress, isCancelled: () => cancelled, yieldEvery: 2 });
    return new Blob([buf], { type: 'video/mp4' });
  };

  const viaWorker = (): Promise<Blob> =>
    new Promise<Blob>((resolve, reject) => {
      rejectWorker = reject;
      let started = false;
      try {
        worker = new Worker(new URL('./worker.ts', import.meta.url));
      } catch {
        reject(new Error(WORKER_UNAVAILABLE));
        return;
      }
      const w = worker;
      w.onmessage = (e: MessageEvent<WorkerOut>) => {
        const m = e.data;
        if (m.type === 'progress') {
          started = true;
          onProgress(m.done, m.total);
        } else if (m.type === 'done') {
          w.terminate();
          resolve(new Blob([m.buffer], { type: 'video/mp4' }));
        } else {
          w.terminate();
          if (m.cancelled) reject(new CancelledError());
          else reject(new Error(started ? m.message : WORKER_UNAVAILABLE));
        }
      };
      w.onerror = () => {
        w.terminate();
        reject(new Error(started ? 'Export failed in the worker' : WORKER_UNAVAILABLE));
      };
      // ImageBitmaps are structured-cloned (not transferred) so the preview keeps its copies.
      w.postMessage({ type: 'start', input, origin: location.origin });
    });

  const promise = (async () => {
    try {
      return await viaWorker();
    } catch (e) {
      if (e instanceof Error && e.message === WORKER_UNAVAILABLE && !cancelled) return mainThread();
      throw e;
    }
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      const w = worker;
      if (w) {
        w.postMessage({ type: 'cancel' });
        setTimeout(() => w.terminate(), 300);
      }
      rejectWorker?.(new CancelledError());
    },
  };
}

export { CancelledError };
