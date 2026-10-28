import { z } from 'zod';
import type { Candle, Interval } from '../types';
import { pxDecimalsFromRaw } from '../format';

const HL_URL = 'https://api.hyperliquid.xyz/info';
/** Same-origin fallback proxy, used only if the direct (CORS) call fails at the network level. */
const PROXY_URL = '/api/hl/info';

export class FriendlyError extends Error {
  constructor(message: string, public code: string = 'error') {
    super(message);
  }
}

export const RATE_LIMIT_MSG = 'Hyperliquid is rate-limiting us — try again in a few seconds';

let useProxy = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function hlInfo<T>(body: unknown, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(useProxy ? PROXY_URL : HL_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      lastErr = e;
      if (!useProxy && typeof window !== 'undefined') {
        useProxy = true; // CORS / network failure → fall back to the proxy
        continue;
      }
      throw new FriendlyError("Couldn't reach Hyperliquid. Check your connection and try again.", 'network');
    }
    if (res.status === 429) {
      lastErr = new FriendlyError(RATE_LIMIT_MSG, 'rate_limit');
      await sleep(800 * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new FriendlyError(`Hyperliquid returned an error (${res.status}). Try again in a moment.`, 'http');
    const json = await res.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new FriendlyError('Hyperliquid sent an unexpected response.', 'schema');
    return parsed.data;
  }
  throw lastErr instanceof FriendlyError ? lastErr : new FriendlyError(RATE_LIMIT_MSG, 'rate_limit');
}

// ── meta ─────────────────────────────────────────────────────
const MetaSchema = z.object({
  universe: z.array(z.object({ name: z.string(), szDecimals: z.number(), isDelisted: z.boolean().optional(), maxLeverage: z.number().optional() })),
});

let metaCache: Promise<{ name: string; maxLeverage: number }[]> | null = null;
export function fetchHlPairs(): Promise<{ name: string; maxLeverage: number }[]> {
  if (!metaCache) {
    metaCache = hlInfo({ type: 'meta' }, MetaSchema)
      .then((m) => m.universe.filter((u) => !u.isDelisted).map((u) => ({ name: u.name, maxLeverage: u.maxLeverage ?? 50 })))
      .catch((e) => {
        metaCache = null;
        throw e;
      });
  }
  return metaCache;
}

// ── candles ──────────────────────────────────────────────────
const RawCandle = z.object({ t: z.number(), o: z.string(), h: z.string(), l: z.string(), c: z.string() });
const CandlesSchema = z.array(RawCandle);

export interface CandleResult {
  candles: Candle[];
  pxDecimals: number;
}

const candleCache = new Map<string, Promise<CandleResult>>();

export function fetchHlCandles(coin: string, interval: Interval, startTime: number, endTime: number): Promise<CandleResult> {
  const key = `${coin}|${interval}|${startTime}|${endTime}`;
  const hit = candleCache.get(key);
  if (hit) return hit;
  const p = hlInfo({ type: 'candleSnapshot', req: { coin, interval, startTime, endTime } }, CandlesSchema).then((raw) => {
    const raws: string[] = [];
    const candles = raw.map((c) => {
      raws.push(c.o, c.h, c.l, c.c);
      return { t: c.t, o: Number(c.o), h: Number(c.h), l: Number(c.l), c: Number(c.c) };
    });
    return { candles, pxDecimals: pxDecimalsFromRaw(raws) };
  });
  p.catch(() => candleCache.delete(key));
  candleCache.set(key, p);
  return p;
}
