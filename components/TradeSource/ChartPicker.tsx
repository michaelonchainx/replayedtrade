'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { track } from '@vercel/analytics';
import { useApp } from '@/lib/store';
import type { Candle, Fill, Interval, Trade } from '@/lib/types';
import { fetchHlCandles, fetchHlPairs, FriendlyError } from '@/lib/hyperliquid/client';
import { fetchLighterCandles, fetchLighterMarkets } from '@/lib/lighter/client';
import { ALL_INTERVALS, HL_MAX_CANDLES, INTERVAL_MS, LIGHTER_INTERVALS } from '@/lib/interval';
import { finalPnl } from '@/lib/pnl';
import { stateAfter, tradeFills, withFills } from '@/lib/fills';
import { formatDateTime, formatPnl, formatPx, pxDecimalsFromRaw } from '@/lib/format';
import DragHandle from './DragHandle';
import TradeFields, { fromUtcInput, sizeBaseFrom, toUtcInput, type AddMode } from './TradeFields';

type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'custom';
interface Pair {
  label: string;
  ref: string;
}
interface Pick {
  t: number;
  p: number;
}

const DAY = 86_400_000;
const C = { bg: '#0A0C0B', line: '#222A24', ink3: '#7D877F', green: '#6EF278', red: '#F84C45', ink: '#E8EDE9' };

function rangeFor(preset: Preset, custom: number, now: number): { start: number; end: number } {
  const sod = Math.floor(now / DAY) * DAY;
  switch (preset) {
    case 'today':
      return { start: sod, end: now };
    case 'yesterday':
      return { start: sod - DAY, end: sod };
    case '7d':
      return { start: now - 7 * DAY, end: now };
    case '30d':
      return { start: now - 30 * DAY, end: now };
    default:
      return { start: custom - DAY / 2, end: Math.min(now, custom + DAY / 2) };
  }
}

/** Finest interval that keeps the chart under ~500 candles and inside Hyperliquid's 5000-candle history. */
function chartInterval(start: number, end: number, now: number, lighter: boolean): Interval {
  const list = lighter ? LIGHTER_INTERVALS : ALL_INTERVALS;
  for (const iv of list) {
    const ms = INTERVAL_MS[iv];
    if ((end - start) / ms <= 500 && (lighter || start >= now - HL_MAX_CANDLES * ms)) return iv;
  }
  return list[list.length - 1];
}

const ts = (t: number) => Math.floor(t / 1000) as UTCTimestamp;

export default function ChartPicker() {
  const venue = useApp((s) => s.venue);
  const trade = useApp((s) => s.trade);
  const setTrade = useApp((s) => s.setTrade);
  const patchTrade = useApp((s) => s.patchTrade);
  const sizeMode = useApp((s) => s.sizeMode);
  const sizeAmount = useApp((s) => s.sizeAmount);

  const [pairs, setPairs] = useState<Pair[]>([]);
  const [pairText, setPairText] = useState('HYPE');
  const [pair, setPair] = useState<Pair | null>(null);
  const [pairErr, setPairErr] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>('today');
  const [custom, setCustom] = useState<number>(() => Date.now() - DAY);
  const [ivChoice, setIvChoice] = useState<'auto' | Interval>('auto');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [decimals, setDecimals] = useState(4);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [entry, setEntry] = useState<Pick | null>(null);
  const [phase, setPhase] = useState<'entry' | 'exit' | 'done'>('entry');
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [shake, setShake] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const [, setTick] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  candlesRef.current = candles;

  const lighter = venue === 'lighter';
  const ivUsed = useMemo(() => {
    const now = Date.now();
    const r = rangeFor(preset, custom, now);
    return ivChoice === 'auto' ? chartInterval(r.start, r.end, now, lighter) : ivChoice;
  }, [preset, custom, ivChoice, lighter]);
  const ivMs = INTERVAL_MS[ivUsed];

  // pairs
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list: Pair[] = lighter
          ? (await fetchLighterMarkets()).map((m) => ({ label: m.symbol, ref: String(m.id) }))
          : (await fetchHlPairs()).map((p) => ({ label: p.name, ref: p.name }));
        if (!alive) return;
        setPairs(list);
        const want = list.find((p) => p.label.toUpperCase() === pairText.toUpperCase()) ?? list.find((p) => p.label === 'HYPE') ?? null;
        setPair(want);
        if (want) setPairText(want.label);
      } catch (e) {
        if (alive) setPairErr(e instanceof FriendlyError ? e.message : 'Could not load pairs');
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lighter]);

  // chart setup (brand theme; TradingView attribution stays on)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: C.bg }, textColor: C.ink3, fontFamily: '"JetBrains Mono", monospace', fontSize: 12, attributionLogo: true },
      grid: { vertLines: { color: 'rgba(255,255,255,0.03)' }, horzLines: { color: 'rgba(255,255,255,0.03)' } },
      rightPriceScale: { borderColor: C.line },
      timeScale: { borderColor: C.line, timeVisible: true, secondsVisible: false },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: C.green, width: 1, style: 0, labelBackgroundColor: C.green },
        horzLine: { color: 'rgba(232,237,233,0.35)', labelBackgroundColor: '#222A24' },
      },
      localization: { timeFormatter: (t: number) => formatDateTime(t * 1000) + ' UTC' },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: C.green,
      downColor: C.red,
      wickUpColor: C.green,
      wickDownColor: C.red,
      borderVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    markersRef.current = createSeriesMarkers(series, []);
    const bump = () => setTick((t) => t + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(bump);
    const ro = new ResizeObserver(bump);
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(bump);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // candles
  useEffect(() => {
    if (!pair) return;
    let alive = true;
    const now = Date.now();
    const r = rangeFor(preset, custom, now);
    const start = Math.floor(r.start / ivMs) * ivMs;
    setLoading(true);
    setLoadErr(null);
    const t = setTimeout(async () => {
      try {
        let cs: Candle[];
        let dec: number;
        if (lighter) {
          cs = await fetchLighterCandles(Number(pair.ref), ivUsed, start, r.end);
          dec = pxDecimalsFromRaw(cs.flatMap((c) => [String(c.o), String(c.h), String(c.l), String(c.c)]));
        } else {
          const res = await fetchHlCandles(pair.ref, ivUsed, start, r.end);
          cs = res.candles;
          dec = res.pxDecimals;
        }
        if (!alive) return;
        if (cs.length === 0) setLoadErr('Pair not available for this period.');
        setCandles(cs);
        setDecimals(dec);
        const s = seriesRef.current;
        if (s) {
          s.applyOptions({ priceFormat: { type: 'price', precision: dec, minMove: Math.pow(10, -dec) } });
          s.setData(cs.map((c) => ({ time: ts(c.t), open: c.o, high: c.h, low: c.l, close: c.c })));
          chartRef.current?.timeScale().fitContent();
        }
      } catch (e) {
        if (alive) setLoadErr(e instanceof FriendlyError ? e.message : 'Could not load candles.');
      } finally {
        if (alive) setLoading(false);
      }
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [pair, preset, custom, ivUsed, ivMs, lighter]);

  // reset picks when the chart context changes
  useEffect(() => {
    setEntry(null);
    setPhase('entry');
    setAddMode(null);
  }, [pair, lighter]);

  const candleAt = useCallback((time: number): Candle | null => {
    const cs = candlesRef.current;
    if (!cs.length) return null;
    let best = cs[0];
    for (const c of cs) {
      if (c.t <= time) best = c;
      else break;
    }
    return best;
  }, []);

  /** Clicked y → price inside the candle's range, rounded to the pair's tick precision. */
  const clampP = (c: Candle, p: number, shift: boolean) => {
    if (shift) return c.c;
    const f = Math.pow(10, decimals);
    return Math.min(c.h, Math.max(c.l, Math.round(p * f) / f));
  };
  /** Fills sit mid-candle so the replay places them inside the same bar at any interval. */
  const pickAt = (c: Candle, p: number): Pick => ({ t: c.t + Math.floor(ivMs / 2), p });

  const buildTrade = useCallback(
    (e: Pick, x: Pick): Trade => {
      const prev = useApp.getState().trade;
      const leverage = prev.leverage;
      return {
        venue,
        coin: pair!.label,
        marketRef: pair!.ref,
        side: x.p >= e.p ? 'long' : 'short',
        entryTime: e.t,
        entryPx: e.p,
        exitTime: x.t,
        exitPx: x.p,
        sizeBase: sizeBaseFrom(sizeMode, sizeAmount, leverage, e.p),
        leverage,
        feesUsd: prev.feesUsd,
        pxDecimals: decimals,
      };
    },
    [venue, pair, sizeMode, sizeAmount, decimals],
  );

  const manualHere = phase === 'done' && !!pair && trade.marketRef === pair.ref;
  const fills: Fill[] = manualHere ? tradeFills(trade) : [];

  const addFill = (kind: 'in' | 'out', pk: Pick) => {
    const cur = useApp.getState().trade;
    const fs = tradeFills(cur);
    if (pk.t <= fs[0].t) {
      setShake((s) => s + 1);
      return;
    }
    // position open just before this time
    const before = stateAfter(cur, fs, fs.filter((f) => f.t <= pk.t).length).q;
    const sz = kind === 'in' ? fs[0].sz * 0.5 : Math.max(before * 0.5, 1e-9);
    if (kind === 'out' && before <= 0) {
      setShake((s) => s + 1);
      return;
    }
    patchTrade(withFills(cur, [...fs, { kind, t: pk.t, px: pk.p, sz }]));
    setAddMode(null);
  };

  // clicks: 1st = entry, 2nd = exit, then optional extra executions
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    const onClick = (param: MouseEventParams<Time>) => {
      if (!param.point || param.time === undefined || !pair) return;
      if (phase === 'done' && !addMode) return;
      const c = candleAt((param.time as number) * 1000);
      const price = series.coordinateToPrice(param.point.y);
      if (!c || price === null) return;
      const pk = pickAt(c, clampP(c, price, !!param.sourceEvent?.shiftKey));
      if (phase === 'done' && addMode) {
        addFill(addMode, pk);
        return;
      }
      if (phase === 'entry') {
        setEntry(pk);
        setPhase('exit');
      } else if (entry) {
        if (pk.t <= entry.t) {
          setShake((s) => s + 1);
          return;
        }
        setTrade(buildTrade(entry, pk));
        setPhase('done');
        track('trade_loaded', { source: 'chart', venue });
      }
    };
    chart.subscribeClick(onClick);
    return () => chart.unsubscribeClick(onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, entry, pair, candleAt, buildTrade, setTrade, venue, addMode, ivMs]);

  // display-only native markers (arrows) under the DOM handles
  const fillKey = fills.map((f) => `${f.kind}${f.t}`).join('|') + (entry && phase !== 'done' ? `e${entry.t}` : '');
  useEffect(() => {
    const m = markersRef.current;
    if (!m) return;
    const pts: { t: number; kind: 'in' | 'out' }[] = phase === 'done' ? fills.map((f) => ({ t: f.t, kind: f.kind })) : entry ? [{ t: entry.t, kind: 'in' }] : [];
    const long = trade.side === 'long';
    const list = pts
      .map((f) => {
        const c = candleAt(f.t);
        if (!c) return null;
        const below = (f.kind === 'in') === long;
        return { time: ts(c.t), position: below ? ('belowBar' as const) : ('aboveBar' as const), color: f.kind === 'in' ? C.green : C.ink, shape: below ? ('arrowUp' as const) : ('arrowDown' as const), size: 0.5 };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => a.time - b.time);
    m.setMarkers(list);
  }, [fillKey, candles]); // eslint-disable-line react-hooks/exhaustive-deps

  const avgEntry = manualHere ? trade.entryPx : entry?.p;
  useEffect(() => {
    const s = seriesRef.current;
    if (!s || !avgEntry) return;
    const line = s.createPriceLine({ price: avgEntry, color: 'rgba(110,242,120,0.75)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: manualHere && trade.fills ? 'Avg entry' : 'Entry' });
    return () => s.removePriceLine(line);
  }, [avgEntry, manualHere, trade.fills]);

  const pos = (pk: Pick | null) => {
    const chart = chartRef.current;
    const s = seriesRef.current;
    if (!pk || !chart || !s) return null;
    const c = candleAt(pk.t);
    if (!c) return null;
    const x = chart.timeScale().timeToCoordinate(ts(c.t));
    const y = s.priceToCoordinate(pk.p);
    if (x === null || y === null) return null;
    return { x, y };
  };

  const moveFill = (idx: number, pk: Pick) => {
    const cur = useApp.getState().trade;
    const fs = tradeFills(cur);
    const next = fs.map((f, j) => (j === idx ? { ...f, t: pk.t, px: pk.p } : f));
    // keep the first execution an entry and the last one an exit
    const sorted = [...next].sort((a, b) => a.t - b.t);
    if (sorted[0].kind !== 'in' || sorted[sorted.length - 1].kind !== 'out') return;
    const patch = withFills(cur, next);
    if (idx === 0 && !cur.fills) patch.sizeBase = sizeBaseFrom(sizeMode, sizeAmount, cur.leverage, pk.p);
    patchTrade(patch);
  };

  const dragTo = (idx: number, x: number, y: number, shift: boolean) => {
    const chart = chartRef.current;
    const s = seriesRef.current;
    if (!chart || !s) return;
    const t = chart.timeScale().coordinateToTime(x);
    const p = s.coordinateToPrice(y);
    if (t === null || p === null) return;
    const c = candleAt((t as number) * 1000);
    if (!c) return;
    const pk = pickAt(c, clampP(c, p, shift));
    if (idx < 0) setEntry(pk);
    else moveFill(idx, pk);
  };

  const nudge = (idx: number, dx: number, dyPx: number) => {
    const s = seriesRef.current;
    const pk = idx < 0 ? entry : fills[idx] ? { t: fills[idx].t, p: fills[idx].px } : null;
    if (!pk || !s) return;
    const cs = candlesRef.current;
    const cur = candleAt(pk.t);
    const ci = Math.max(0, Math.min(cs.length - 1, cs.findIndex((c) => c.t === cur?.t) + dx));
    const c = cs[ci];
    const y = s.priceToCoordinate(pk.p);
    const p = y === null ? pk.p : s.coordinateToPrice(y + dyPx) ?? pk.p;
    const next = pickAt(c, clampP(c, p, false));
    if (idx < 0) setEntry(next);
    else moveFill(idx, next);
  };

  const hint = addMode ? `Click where you ${addMode === 'in' ? 'added' : 'reduced'}` : phase === 'entry' ? 'Click where you entered' : phase === 'exit' ? 'Click where you exited' : null;
  const handles: { idx: number; kind: 'in' | 'out'; pk: Pick }[] =
    phase === 'done' ? fills.map((f, idx) => ({ idx, kind: f.kind, pk: { t: f.t, p: f.px } })) : entry ? [{ idx: -1, kind: 'in', pk: entry }] : [];
  const dragged = dragging !== null ? handles.find((h) => h.idx === dragging) : undefined;
  const draggedPos = dragged ? pos(dragged.pk) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-44">
          <label className="label" htmlFor="pair">
            Pair
          </label>
          <input
            id="pair"
            className="field font-bold uppercase"
            list="pair-list"
            value={pairText}
            spellCheck={false}
            aria-invalid={!!pairErr}
            data-testid="pair-input"
            onChange={(e) => {
              const v = e.target.value;
              setPairText(v);
              const hit = pairs.find((p) => p.label.toUpperCase() === v.trim().toUpperCase());
              if (hit) {
                setPair(hit);
                setPairErr(null);
              } else setPairErr(v.trim() && pairs.length ? 'Pair not available' : null);
            }}
          />
          <datalist id="pair-list">
            {pairs.map((p) => (
              <option key={p.ref} value={p.label} />
            ))}
          </datalist>
        </div>
        <div>
          <span className="label">Jump to</span>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-grid grid-cols-4 border border-line bg-panel">
              {(['today', 'yesterday', '7d', '30d'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreset(p)}
                  aria-pressed={preset === p}
                  className={`px-3 py-2 text-xs font-bold uppercase tracking-[0.06em] ${preset === p ? 'bg-green text-on-pill' : 'text-ink-2 hover:text-ink'}`}
                >
                  {p === 'today' ? 'Today' : p === 'yesterday' ? 'Yday' : p.toUpperCase()}
                </button>
              ))}
            </div>
            <input
              type="datetime-local"
              aria-label="Jump to date (UTC)"
              className={`field !w-auto !py-2 text-xs [color-scheme:dark] ${preset === 'custom' ? '!border-green' : ''}`}
              value={toUtcInput(custom)}
              onChange={(e) => {
                const t = fromUtcInput(e.target.value);
                if (t !== null) {
                  setCustom(t);
                  setPreset('custom');
                }
              }}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="interval">
            Interval
          </label>
          <select id="interval" className="field !w-auto !py-2 text-xs" value={ivChoice} onChange={(e) => setIvChoice(e.target.value as 'auto' | Interval)}>
            <option value="auto">Auto ({ivUsed})</option>
            {(lighter ? LIGHTER_INTERVALS : ALL_INTERVALS).map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-4 text-xs text-ink-3">
          <span>Shift-click = candle close</span>
          {(entry || phase === 'done') && (
            <button
              type="button"
              className="font-bold uppercase tracking-[0.08em] text-ink-2 hover:text-red"
              onClick={() => {
                setEntry(null);
                setPhase('entry');
                setAddMode(null);
              }}
            >
              Reset picks
            </button>
          )}
        </div>
      </div>
      {pairErr && <p className="-mt-2 text-xs text-red">{pairErr}</p>}

      <div className="relative border border-line">
        <div ref={wrapRef} className={`h-[420px] w-full overflow-hidden sm:h-[560px] ${hint ? 'cursor-crosshair' : ''}`} data-testid="chart" />
        {hint && (
          <div key={shake} className={`pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 bg-green px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.08em] text-on-pill ${shake ? 'shake' : ''}`} role="status">
            ▶ {hint}
          </div>
        )}
        {loading && <div className="pointer-events-none absolute right-16 top-4 z-10 bg-bg/90 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-2">Loading…</div>}
        {loadErr && <div className="absolute inset-x-4 bottom-10 z-10 border border-red bg-bg/95 px-3 py-2 text-xs text-red">{loadErr}</div>}
        {handles.map((h) => {
          const p = pos(h.pk);
          if (!p) return null;
          return (
            <DragHandle
              key={`${h.idx}-${h.kind}`}
              kind={h.kind}
              x={p.x}
              y={p.y}
              testId={`handle-${h.kind}-${h.idx}`}
              label={`${h.kind === 'in' ? 'Entry' : 'Exit'} handle — drag or use arrow keys`}
              container={wrapRef}
              onDrag={(x, y, sh) => dragTo(h.idx, x, y, sh)}
              onDragState={(d) => setDragging(d ? h.idx : null)}
              onNudge={(dx, dy) => nudge(h.idx, dx, dy)}
            />
          );
        })}
        {dragged && draggedPos && (
          <div
            className="tnum pointer-events-none absolute z-30 border border-line bg-bg px-2.5 py-1.5 text-[11px] leading-tight"
            style={{ left: Math.min(draggedPos.x + 22, (wrapRef.current?.clientWidth ?? 300) - 170), top: draggedPos.y - 58 }}
          >
            <div className="font-extrabold">{formatPx(dragged.pk.p, decimals)}</div>
            <div className="text-ink-3">{formatDateTime(dragged.pk.t)} UTC</div>
            {phase === 'done' && <div className={finalPnl(trade) >= 0 ? 'text-green' : 'text-red'}>{formatPnl(finalPnl(trade))}</div>}
          </div>
        )}
      </div>

      {manualHere ? (
        <TradeFields addMode={addMode} onAddMode={setAddMode} />
      ) : (
        <p className="text-sm text-ink-3">Pick your entry and exit on the chart. After that you can add more entries and partial exits; the PnL adds them all up.</p>
      )}
    </div>
  );
}
