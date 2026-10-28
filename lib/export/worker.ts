/// <reference lib="webworker" />
import { createScene, ensureCanvasFonts, type SceneInput } from '../render/scene';
import { CancelledError, encodeMp4 } from './encode';

export type WorkerIn = { type: 'start'; input: SceneInput; origin: string } | { type: 'cancel' };
export type WorkerOut =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; buffer: ArrayBuffer }
  | { type: 'error'; message: string; cancelled?: boolean };

const scope = self as unknown as DedicatedWorkerGlobalScope;
let cancelled = false;

scope.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  if (msg.type === 'cancel') {
    cancelled = true;
    return;
  }
  try {
    await ensureCanvasFonts(scope.fonts, msg.origin);
    const canvas = new OffscreenCanvas(16, 16);
    const { tl, ctx } = createScene(canvas, msg.input);
    let last = 0;
    const buffer = await encodeMp4(canvas, ctx, tl, {
      isCancelled: () => cancelled,
      onProgress: (done, total) => {
        if (done - last >= 5 || done === total) {
          last = done;
          scope.postMessage({ type: 'progress', done, total } satisfies WorkerOut);
        }
      },
    });
    scope.postMessage({ type: 'done', buffer } satisfies WorkerOut, [buffer]);
  } catch (err) {
    scope.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err), cancelled: err instanceof CancelledError } satisfies WorkerOut);
  }
};
