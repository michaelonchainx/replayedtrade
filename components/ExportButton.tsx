'use client';
import { useEffect, useRef, useState } from 'react';
import { track } from '@vercel/analytics';
import { useApp } from '@/lib/store';
import { exportMp4, CancelledError, type ExportJob } from '@/lib/export/mp4';
import { isExportSupported } from '@/lib/export/encode';
import { createScene, ensureCanvasFonts } from '@/lib/render/scene';
import { renderFrame } from '@/lib/render/renderFrame';
import { layoutFor } from '@/lib/render/layout';
import { downloadBlob } from '@/lib/assets';
import { finalPnl, returnRatio } from '@/lib/pnl';
import { formatLeverage, formatPct, formatPnl, yyyymmdd } from '@/lib/format';
import { shareUrl } from '@/lib/share/url';
import { Segmented } from './ui';

const UNSUPPORTED = 'Export works in Chrome, Edge or a recent Safari';

export function captionFor(trade: ReturnType<typeof useApp.getState>['trade'], percentOnly: boolean): string {
  const pnl = finalPnl(trade);
  const amount = percentOnly ? formatPct(returnRatio(trade, pnl)) : formatPnl(pnl);
  const side = `${trade.side === 'long' ? 'Long' : 'Short'} ${formatLeverage(trade.leverage)}`;
  return `${amount} on $${trade.coin} (${side}) · replayed.trade`;
}

export default function ExportButton() {
  const trade = useApp((s) => s.trade);
  const options = useApp((s) => s.options);
  const setOptions = useApp((s) => s.setOptions);
  const candlesLoading = useApp((s) => s.candlesLoading);
  const candleError = useApp((s) => s.candleError);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [lastBlob, setLastBlob] = useState<{ blob: Blob; name: string } | null>(null);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const jobRef = useRef<ExportJob | null>(null);
  const startRef = useRef(0);

  useEffect(() => {
    try {
      const f = new File([new Blob(['x'], { type: 'video/mp4' })], 'x.mp4', { type: 'video/mp4' });
      setCanShareFiles(typeof navigator.canShare === 'function' && navigator.canShare({ files: [f] }) && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));
    } catch {
      setCanShareFiles(false);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const usernameOk = options.username.trim().length > 0;
  const fileName = () => `replayed-${trade.coin.replace(/[^A-Za-z0-9]/g, '')}-${(options.username || 'anon').replace(/[^A-Za-z0-9_]/g, '')}-${yyyymmdd(trade.exitTime)}.mp4`;

  const sceneInput = () => {
    const s = useApp.getState();
    return { trade: s.trade, candles: s.candles, options: s.options, avatar: s.avatar };
  };

  const start = async () => {
    setError(null);
    const L = layoutFor(options.format);
    if (!(await isExportSupported(L.W, L.H))) {
      setError(UNSUPPORTED);
      track('export_failed', { reason: 'unsupported' });
      return;
    }
    track('export_started', { format: options.format, length: options.length });
    startRef.current = performance.now();
    setProgress({ done: 0, total: options.length * 30 });
    setEta(null);
    const job = exportMp4(sceneInput(), (done, total) => {
      setProgress({ done, total });
      const el = (performance.now() - startRef.current) / 1000;
      if (done > 10) setEta(Math.max(0, Math.round((el / done) * (total - done))));
    });
    jobRef.current = job;
    try {
      const blob = await job.promise;
      const name = fileName();
      setLastBlob({ blob, name });
      downloadBlob(blob, name);
      track('export_done', { format: options.format, length: options.length });
    } catch (e) {
      if (e instanceof CancelledError) {
        setToast('Export cancelled');
      } else {
        const msg = e instanceof Error ? e.message : 'unknown';
        setError(`Export failed: ${msg}. ${UNSUPPORTED}.`);
        track('export_failed', { reason: msg.slice(0, 60) });
      }
    } finally {
      jobRef.current = null;
      setProgress(null);
    }
  };

  const downloadPng = async () => {
    await ensureCanvasFonts(document.fonts);
    const canvas = document.createElement('canvas');
    const { tl, ctx } = createScene(canvas, sceneInput());
    renderFrame(ctx, tl, tl.frames - 1);
    canvas.toBlob((b) => b && downloadBlob(b, fileName().replace(/\.mp4$/, '.png')), 'image/png');
  };

  const copy = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast(msg);
    } catch {
      setToast("Couldn't copy — select and copy manually");
    }
  };

  const share = async () => {
    const blob = lastBlob;
    if (!blob) return;
    try {
      await navigator.share({ files: [new File([blob.blob], blob.name, { type: 'video/mp4' })], text: captionFor(trade, options.percentOnly) });
    } catch {
      // user dismissed
    }
  };

  const busy = progress !== null;
  const disabled = busy || candlesLoading || !!candleError || !usernameOk;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 border border-line bg-panel p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label="Length" size="sm" value={options.length} onChange={(v) => setOptions({ length: v })} options={[{ v: 15, label: '15s' }, { v: 25, label: '25s' }, { v: 40, label: '40s' }]} />
          <Segmented label="Format" size="sm" value={options.format} onChange={(v) => setOptions({ format: v })} options={[{ v: '16x9', label: '16:9' }, { v: '9x16', label: '9:16' }]} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-quiet !px-3 !py-2 text-xs" onClick={downloadPng} disabled={candlesLoading || !!candleError}>
            Final frame PNG
          </button>
          <button type="button" className="btn btn-quiet !px-3 !py-2 text-xs" onClick={() => copy(shareUrl(location.origin, trade, options), 'Replay link copied')} data-testid="copy-link">
            Copy link
          </button>
          <button type="button" className="btn btn-quiet !px-3 !py-2 text-xs" onClick={() => copy(captionFor(trade, options.percentOnly), 'Caption copied')}>
            Copy caption
          </button>
          {canShareFiles && lastBlob && (
            <button type="button" className="btn btn-quiet !px-3 !py-2 text-xs" onClick={share}>
              Share
            </button>
          )}
          {!busy && (
            <button type="button" className="btn btn-primary !px-6 !py-3 text-base" onClick={start} disabled={disabled} data-testid="download-mp4">
              Download MP4 →
            </button>
          )}
        </div>
      </div>
      {busy && (
        <div className="border border-line bg-panel p-4" aria-live="polite">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="tnum font-bold text-ink" data-testid="export-progress">
              Rendering {progress.done} / {progress.total} frames
            </span>
            <span className="tnum text-xs text-ink-3">{eta !== null ? `~${eta}s left` : 'starting…'}</span>
          </div>
          <div className="h-1.5 bg-line">
            <div className="h-full bg-green transition-[width]" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
          <button type="button" className="btn btn-ghost mt-4" onClick={() => jobRef.current?.cancel()}>
            Cancel
          </button>
        </div>
      )}
      {!usernameOk && <p className="text-xs text-red">Add a username to export.</p>}
      {error && (
        <p className="border border-red bg-red/10 px-3 py-2 text-sm text-red" role="alert">
          {error}
        </p>
      )}
      <div className="h-4 text-xs font-bold uppercase tracking-[0.1em] text-green" role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
