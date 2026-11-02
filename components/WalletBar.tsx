'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { track } from '@vercel/analytics';
import { tradeKey, useApp } from '@/lib/store';
import { fetchFillsPage, fetchHlLeverage, fetchRecentFills, FriendlyError, HL_MAX_FILLS } from '@/lib/hyperliquid/client';
import { reconstructHlTrades, type ClosedTrade, type HlFill } from '@/lib/hyperliquid/trades';
import { formatDuration, formatPnl, formatUsd } from '@/lib/format';
import { sizeIn } from '@/lib/sizing';

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const LS_KEY = 'replayed:hlAddress';

const readLs = () => {
  try {
    return localStorage.getItem(LS_KEY) ?? '';
  } catch {
    return '';
  }
};
const writeLs = (v: string) => {
  try {
    localStorage.setItem(LS_KEY, v);
  } catch {
    // storage unavailable — fine
  }
};

const fmtDate = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Resolves once the store has candles for the current trade (or gave up with an error). */
function waitForCandles(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      const s = useApp.getState();
      return s.candleKey === tradeKey(s.trade) || !!s.candleError;
    };
    if (done()) return resolve();
    const unsub = useApp.subscribe(() => {
      if (done()) {
        unsub();
        resolve();
      }
    });
  });
}

/**
 * Bottom dock: paste a Hyperliquid address, see its closed trades, one click replays a trade
 * exactly as it was executed (every fill, scale-ins and partial exits included).
 * The address only goes to Hyperliquid's public API from the browser — never to our server.
 */
export default function WalletBar() {
  const setTrade = useApp((s) => s.setTrade);
  const patchTrade = useApp((s) => s.patchTrade);
  const setVenue = useApp((s) => s.setVenue);
  const setSizing = useApp((s) => s.setSizing);
  const restartReplay = useApp((s) => s.restartReplay);

  const [address, setAddress] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trades, setTrades] = useState<ClosedTrade[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [canMore, setCanMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [pair, setPair] = useState('all');
  const fillsRef = useRef<HlFill[]>([]);
  const nextEndRef = useRef<number | null>(null);
  const userRef = useRef('');
  const leverageCache = useRef(new Map<string, Promise<number>>());

  useEffect(() => setAddress(readLs()), []);

  const valid = ADDR.test(address.trim());
  const pairs = useMemo(() => [...new Set(trades.map((t) => t.trade.coin))].sort(), [trades]);
  const shown = pair === 'all' ? trades : trades.filter((t) => t.trade.coin === pair);

  const load = async (more = false) => {
    if (!valid) return;
    const user = address.trim().toLowerCase();
    writeLs(address.trim());
    setLoading(true);
    setError(null);
    setOpen(true);
    try {
      if (!more || user !== userRef.current) {
        userRef.current = user;
        fillsRef.current = [];
        nextEndRef.current = null;
        leverageCache.current.clear();
        setTrades([]);
        setSelected(null);
        setPair('all');
      }
      const page = more && nextEndRef.current !== null ? await fetchFillsPage(user, nextEndRef.current) : await fetchRecentFills(user);
      fillsRef.current = [...fillsRef.current, ...page.fills];
      nextEndRef.current = page.nextEnd;
      const capped = fillsRef.current.length >= HL_MAX_FILLS;
      const r = reconstructHlTrades(fillsRef.current);
      setTrades(r.trades);
      setOpenCount(r.openPositions);
      setCanMore(page.nextEnd !== null && !capped);
      setExhausted(page.nextEnd === null || capped);
      setLoaded(true);
      if (r.trades.length === 0 && (page.nextEnd === null || capped)) setError(`No closed trades found in this wallet's last ${HL_MAX_FILLS.toLocaleString('en-US')} fills.`);
      else if (r.trades.length === 0) setError('No closed trades in the most recent fills — try “Load older”.');
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'Could not load trades from Hyperliquid. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const leverageFor = (coin: string) => {
    let p = leverageCache.current.get(coin);
    if (!p) {
      p = fetchHlLeverage(userRef.current, coin);
      leverageCache.current.set(coin, p);
    }
    return p;
  };

  /** One click: load the real executions, jump to the player, replay from 0:00. */
  const replay = async (ct: ClosedTrade) => {
    setSelected(ct.id);
    setVenue('hyperliquid');
    const leverage = await Promise.race([leverageFor(ct.trade.marketRef), new Promise<number>((r) => setTimeout(() => r(1), 1200))]);
    const trade = { ...ct.trade, leverage };
    setTrade(trade);
    setSizing('position', sizeIn('position', trade));
    track('trade_loaded', { source: 'wallet', venue: 'hyperliquid' });
    document.getElementById('studio')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (window.matchMedia('(max-width: 768px)').matches) setOpen(false);
    await waitForCandles();
    restartReplay();
    // leverage may land after the timeout; it only changes the shown return %, not prices
    leverageFor(ct.trade.marketRef).then((lev) => {
      const cur = useApp.getState().trade;
      if (cur.entryTime === trade.entryTime && cur.marketRef === trade.marketRef && cur.leverage !== lev) patchTrade({ leverage: lev });
    });
  };

  const notes: string[] = [];
  if (openCount > 0) notes.push(`${openCount} open position${openCount === 1 ? '' : 's'} not shown`);
  if (exhausted && trades.length > 0) notes.push('Older trades aren’t available from Hyperliquid');

  return (
    <div className="fixed inset-x-0 bottom-0 z-50" data-testid="wallet-bar">
      {open && (loaded || loading || error) && (
        <div className="border-t border-line bg-bg/97 backdrop-blur" data-testid="wallet-panel">
          <div className="mx-auto max-h-[46vh] max-w-[1280px] overflow-y-auto px-5 py-4 sm:px-8">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <span className="label !mb-0">
                {loading && !trades.length ? 'Loading fills…' : `${shown.length} closed trade${shown.length === 1 ? '' : 's'} · click one to replay it`}
              </span>
              {pairs.length > 1 && (
                <select className="field !w-auto !py-1.5 text-xs" value={pair} onChange={(e) => setPair(e.target.value)} aria-label="Filter by pair">
                  <option value="all">All pairs</option>
                  {pairs.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {error && (
              <p className="mb-3 border border-red bg-red/10 px-3 py-2 text-sm text-red" role="alert">
                {error}
              </p>
            )}
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="listbox" aria-label="Closed trades" data-testid="wallet-trades">
              {shown.map((ct) => {
                const t = ct.trade;
                const pnl = ct.venuePnl;
                const sel = ct.id === selected;
                const ins = t.fills ? t.fills.filter((f) => f.kind === 'in').length : 1;
                const outs = t.fills ? t.fills.length - ins : 1;
                return (
                  <li key={`${ct.id}-${t.entryTime}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={sel}
                      onClick={() => replay(ct)}
                      className={`group w-full border px-3 py-2.5 text-left transition-colors ${sel ? 'border-2 border-green bg-green/5' : 'border-line bg-panel hover:border-green'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <span className="font-extrabold">{t.coin}</span>
                          <span className={`px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${t.side === 'long' ? 'bg-green text-on-pill' : 'bg-ink text-on-pill'}`}>{t.side}</span>
                        </span>
                        <span className={`tnum text-sm font-extrabold ${pnl >= 0 ? 'text-green' : 'text-red'}`}>{formatPnl(pnl)}</span>
                      </div>
                      <div className="tnum mt-1 flex items-center justify-between text-[11px] text-ink-3">
                        <span>
                          {fmtDate(t.exitTime)} · {formatDuration(t.exitTime - t.entryTime)}
                        </span>
                        <span>
                          {ins} in · {outs} out · {formatUsd(t.sizeBase * t.entryPx).replace(/\.\d\d$/, '')}
                        </span>
                      </div>
                      <div className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3 group-hover:text-green">{sel ? '▶ Replaying' : '▶ Replay this trade'}</div>
                    </button>
                  </li>
                );
              })}
              {loading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <li key={`sk${i}`} aria-hidden>
                    <div className="skeleton h-[86px]" />
                  </li>
                ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-3">
              <span>{notes.join(' · ')}</span>
              {canMore && !loading && (
                <button type="button" className="btn btn-quiet !px-3 !py-1.5 text-xs" onClick={() => load(true)}>
                  Load older
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <form
        className="border-t border-line bg-bg/97 backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault();
          load(false);
        }}
      >
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-5 py-3 sm:flex-nowrap sm:px-8">
          <label htmlFor="hl-address" className="flex shrink-0 items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] text-ink-2">
            <span className="inline-block h-2.5 w-2.5 bg-green" aria-hidden />
            HL wallet
          </label>
          <input
            id="hl-address"
            className="field order-last min-w-0 flex-1 basis-full !py-2 sm:order-none sm:basis-0"
            placeholder="0x… paste a Hyperliquid address to replay its trades"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            aria-invalid={address.length > 0 && !valid}
            spellCheck={false}
            autoComplete="off"
            data-testid="wallet-input"
          />
          <button type="submit" className="btn btn-primary shrink-0 !py-2" disabled={!valid || loading} data-testid="load-trades">
            {loading ? 'Loading…' : 'Load trades →'}
          </button>
          {loaded && (
            <button type="button" className="btn btn-quiet shrink-0 !px-3 !py-2 text-xs" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="wallet-toggle">
              {open ? 'Hide ▼' : `${trades.length} trades ▲`}
            </button>
          )}
        </div>
        {address.length > 0 && !valid && <p className="mx-auto max-w-[1280px] px-5 pb-2 text-xs text-red sm:px-8">That doesn’t look like a 0x address (42 characters).</p>}
      </form>
    </div>
  );
}
