import { z } from 'zod';
import type { Candle, Interval } from '../types';
import { FriendlyError } from '../hyperliquid/client';
import { INTERVAL_MS } from '../interval';

const MarketsSchema = z.object({
  order_books: z.array(z.object({ symbol: z.string(), market_id: z.number(), market_type: z.string().optional(), status: z.string().optional(), supported_price_decimals: z.number().optional() })),
});

export interface LighterMarket {
  id: number;
  symbol: string;
  pxDecimals: number;
}

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new FriendlyError("Couldn't reach Lighter. Check your connection and try again.", 'network');
  }
  if (res.status === 429) throw new FriendlyError('Lighter is rate-limiting us — try again in a few seconds', 'rate_limit');
  const json = await res.json().catch(() => null);
  if (res.status === 401 || res.status === 403) throw new FriendlyError('auth', 'auth');
  if (!res.ok) throw new FriendlyError(`Lighter returned an error (${res.status}).`, 'http');
  return json;
}

let marketsCache: Promise<LighterMarket[]> | null = null;
export function fetchLighterMarkets(): Promise<LighterMarket[]> {
  if (!marketsCache) {
    marketsCache = getJson('/api/lighter/markets')
      .then((j) => {
        const p = MarketsSchema.safeParse(j);
        if (!p.success) throw new FriendlyError('Lighter sent an unexpected response.', 'schema');
        return p.data.order_books
          .filter((m) => (m.market_type ?? 'perp') === 'perp' && (m.status ?? 'active') === 'active')
          .map((m) => ({ id: m.market_id, symbol: m.symbol, pxDecimals: m.supported_price_decimals ?? 4 }));
      })
      .catch((e) => {
        marketsCache = null;
        throw e;
      });
  }
  return marketsCache;
}

const CandleSchema = z.object({ c: z.array(z.object({ t: z.number(), o: z.number(), h: z.number(), l: z.number(), c: z.number() })).optional() });
const candleCache = new Map<string, Promise<Candle[]>>();

/** Pages 500 candles at a time (Lighter's per-call max). */
export function fetchLighterCandles(marketId: number, interval: Interval, start: number, end: number): Promise<Candle[]> {
  const key = `${marketId}|${interval}|${start}|${end}`;
  const hit = candleCache.get(key);
  if (hit) return hit;
  const p = (async () => {
    const iv = INTERVAL_MS[interval];
    const out = new Map<number, Candle>();
    for (let s = start; s <= end; s += 500 * iv) {
      const e = Math.min(end, s + 499 * iv);
      const j = await getJson(`/api/lighter/candles?market_id=${marketId}&resolution=${interval}&start=${s}&end=${e + iv}`);
      const parsed = CandleSchema.safeParse(j);
      if (!parsed.success) throw new FriendlyError('Lighter sent an unexpected candle response.', 'schema');
      for (const c of parsed.data.c ?? []) if (c.t >= start && c.t <= end) out.set(c.t, { t: c.t, o: c.o, h: c.h, l: c.l, c: c.c });
    }
    return [...out.values()].sort((a, b) => a.t - b.t);
  })();
  p.catch(() => candleCache.delete(key));
  candleCache.set(key, p);
  return p;
}
