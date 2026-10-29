'use client';
import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { track } from '@vercel/analytics';
import { tradeKey, useApp } from '@/lib/store';
import type { Venue } from '@/lib/types';
import { loadTradeCandles } from '@/lib/candles';
import { FriendlyError } from '@/lib/hyperliquid/client';
import { decodeShare } from '@/lib/share/url';
import { fetchXAvatar, X_HANDLE } from '@/lib/assets';
import { DEMO_CANDLES, DEMO_TRADE } from '@/lib/demo';
import ReplayPlayer from './Preview/ReplayPlayer';
import Customize from './Customize';
import ExportButton from './ExportButton';
import { sizeIn } from '@/lib/sizing';
import { Rec, Segmented, Wordmark } from './ui';

// lightweight-charts touches `window` — client only.
const ChartPicker = dynamic(() => import('./TradeSource/ChartPicker'), { ssr: false, loading: () => <div className="skeleton h-[560px]" /> });

function Section({ n, title, aside, children, id }: { n: string; title: string; aside?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="border-t border-line py-10 sm:py-14" aria-labelledby={`sec-${n}`}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker mb-3">{n} —</p>
          <h2 id={`sec-${n}`} className="display text-[40px] sm:text-[56px]">
            {title}
          </h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function useCandleLoader() {
  const trade = useApp((s) => s.trade);
  const candleKey = useApp((s) => s.candleKey);
  const forced = useApp((s) => s.forcedInterval);
  const key = tradeKey(trade);
  useEffect(() => {
    if (key === candleKey) return;
    const { setCandles, setCandlesLoading } = useApp.getState();
    setCandlesLoading(true);
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const r = await loadTradeCandles(useApp.getState().trade, Date.now(), forced ?? undefined);
        if (alive) setCandles(key, r.candles, null, r.pxDecimals);
      } catch (e) {
        if (alive) setCandles(key, null, e instanceof FriendlyError ? e.message : 'Could not load candles for this trade.');
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [key, candleKey, forced]);
}

/** Typing an X handle loads its profile picture (unless the user uploaded one or turned it off). */
function useXAvatarLoader() {
  const handle = useApp((s) => s.options.username);
  const enabled = useApp((s) => s.useXAvatar);
  const uploaded = useApp((s) => s.avatarSource === 'upload');
  useEffect(() => {
    const st = useApp.getState();
    if (uploaded) return;
    if (!enabled) {
      if (st.avatarSource === 'x') st.setAvatar(null, null);
      st.setXAvatarStatus('idle');
      return;
    }
    if (!X_HANDLE.test(handle)) {
      if (st.avatarSource === 'x') st.setAvatar(null, null);
      st.setXAvatarStatus('idle');
      return;
    }
    const ctrl = new AbortController();
    st.setXAvatarStatus('loading');
    const t = setTimeout(async () => {
      try {
        const r = await fetchXAvatar(handle, ctrl.signal);
        const cur = useApp.getState();
        if (cur.options.username !== handle || cur.avatarSource === 'upload') return;
        if (r) {
          cur.setAvatar(r.bitmap, r.preview, 'x');
          cur.setXAvatarStatus('found');
        } else {
          if (cur.avatarSource === 'x') cur.setAvatar(null, null);
          cur.setXAvatarStatus('missing');
        }
      } catch {
        if (!ctrl.signal.aborted) useApp.getState().setXAvatarStatus('error');
      }
    }, 600);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [handle, enabled, uploaded]);
}

function useShareLink() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const r = new URLSearchParams(location.search).get('r');
    if (!r) return;
    const s = useApp.getState();
    const res = decodeShare(r);
    if (!res.ok) {
      s.setBanner("That replay link looks broken, so here's the demo instead.");
      s.setTrade(DEMO_TRADE, DEMO_CANDLES);
      return;
    }
    const { trade, options } = res.payload;
    s.setOptions(options);
    s.setVenue(trade.venue);
    s.setSizing(s.sizeMode, sizeIn(s.sizeMode, trade));
    s.setTrade(trade);
    track('trade_loaded', { source: 'link', venue: trade.venue });
  }, []);
}

export default function App() {
  const venue = useApp((s) => s.venue);
  const setVenue = useApp((s) => s.setVenue);
  const banner = useApp((s) => s.banner);
  const setBanner = useApp((s) => s.setBanner);
  const patchTrade = useApp((s) => s.patchTrade);

  useCandleLoader();
  useShareLink();
  useXAvatarLoader();

  const chooseVenue = (v: Venue) => {
    setVenue(v);
    patchTrade({ venue: v });
  };

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-4 px-5 sm:px-8">
          <a href="/" className="no-underline hover:no-underline" aria-label="replayed.trade home">
            <Wordmark className="text-[26px]" />
          </a>
          <div className="flex items-center gap-6">
            <a href="#trade" className="hidden text-sm text-ink-2 hover:text-ink hover:no-underline sm:inline">
              Your trade
            </a>
            <a href="#customize" className="hidden text-sm text-ink-2 hover:text-ink hover:no-underline sm:inline">
              Customize
            </a>
            <a href="#studio" className="btn btn-primary !px-4 !py-2 no-underline hover:no-underline">
              Export →
            </a>
          </div>
        </div>
      </nav>

      <header className="rt-grid-bg border-b border-line">
        <div className="mx-auto grid max-w-[1280px] gap-8 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.35fr_1fr] lg:items-end">
          <div>
            <div className="mb-8 flex items-center gap-4">
              <Rec />
              <span className="inline-flex items-center gap-2 bg-green px-2.5 py-1 text-sm font-extrabold text-on-pill">▶ 14:17</span>
            </div>
            <h1 className="display text-[clamp(56px,8.5vw,128px)]">
              Your trade.
              <br />
              <span className="text-green">As a video.</span>
            </h1>
          </div>
          <div className="max-w-md lg:pb-3">
            <p className="text-[17px] leading-relaxed text-ink-2">Screenshots show the result. Replays show the trade. Click your entry and exit on the chart, add scale-ins and partials, then export a video in seconds.</p>
            <ol className="mt-6 grid grid-cols-3 border border-line text-xs">
              {['Pick', 'Style', 'Export'].map((s, i) => (
                <li key={s} className="border-r border-line px-3 py-3 last:border-r-0">
                  <span className="text-ink-3">0{i + 1}</span>
                  <span className="mt-1 block font-bold uppercase tracking-[0.1em] text-ink">{s}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-5 sm:px-8">
        {banner && (
          <div className="mt-6 flex items-center justify-between gap-3 border border-red bg-red/10 px-4 py-3 text-sm text-red" role="alert" data-testid="banner">
            {banner}
            <button type="button" className="text-xs text-red/80 hover:text-red" onClick={() => setBanner(null)} aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}

        <section id="studio" className="scroll-mt-20 py-10 sm:py-14" aria-label="Replay preview and export">
          <ReplayPlayer />
          <div className="mt-6">
            <ExportButton />
          </div>
        </section>

        <Section
          n="01"
          id="trade"
          title="Your trade."
          aside={
            <div className="flex flex-wrap items-center gap-3">
              <span className="label !mb-0">Prices from</span>
              <Segmented
                label="Price feed"
                value={venue}
                onChange={chooseVenue}
                testId="venue"
                options={[
                  { v: 'hyperliquid', label: 'Hyperliquid' },
                  { v: 'lighter', label: 'Lighter' },
                ]}
              />
            </div>
          }
        >
          <ChartPicker />
        </Section>

        <Section n="02" id="customize" title="Make it yours.">
          <Customize />
        </Section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-5 py-8 text-xs text-ink-3 sm:px-8">
          <div className="flex flex-wrap items-center gap-5">
            <Wordmark className="text-[18px]" />
            <a
              href="https://github.com/michaelonchainx/replayedtrade"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-bold text-green hover:text-ink hover:no-underline"
              data-testid="github-link"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              github.com/michaelonchainx/replayedtrade
            </a>
            {['replayedtrade', 'michaelonchainx'].map((handle) => (
              <a
                key={handle}
                href={`https://x.com/${handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 font-bold text-green hover:text-ink hover:no-underline"
                data-testid={`x-link-${handle}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                @{handle}
              </a>
            ))}
          </div>
          <p>Not financial advice. Not affiliated with Hyperliquid or Lighter. Videos are rendered in your browser — nothing is uploaded.</p>
        </div>
      </footer>
    </div>
  );
}
