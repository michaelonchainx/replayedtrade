import { z } from 'zod';
import type { Candle, Interval } from '../types';
import { pxDecimalsFromRaw } from '../format';
import { HlFillSchema, type HlFill } from './trades';

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

// ── fills ────────────────────────────────────────────────────
export const HL_FILLS_PER_PAGE = 2000;
export const HL_MAX_FILLS = 10_000;
const FillsSchema = z.array(HlFillSchema);

/** First page: the most recent ≤2000 fills in a single request (fast for busy wallets). */
export async function fetchRecentFills(user: string, signal?: AbortSignal): Promise<{ fills: HlFill[]; nextEnd: number | null }> {
  const fills = await hlInfo({ type: 'userFills', user, aggregateByTime: true }, FillsSchema, signal);
  // aggregation shrinks the count, so a short page doesn't prove the history ended — "load more" finds out.
  if (fills.length === 0) return { fills, nextEnd: null };
  const oldest = Math.min(...fills.map((f) => f.time));
  return { fills, nextEnd: oldest - 1 };
}

/**
 * One page of older fills ending at `endTime`. Shrinks the window when a response is full
 * (≥2000) so pages never leave gaps; widens it when empty, until `minTime`.
 */
export async function fetchFillsPage(user: string, endTime: number, minTime = endTime - 2 * 365 * 86400000, signal?: AbortSignal): Promise<{ fills: HlFill[]; nextEnd: number | null }> {
  let span = 30 * 86400000;
  for (let guard = 0; guard < 24; guard++) {
    const start = Math.max(minTime, endTime - span);
    const fills = await hlInfo({ type: 'userFillsByTime', user, startTime: start, endTime, aggregateByTime: true }, FillsSchema, signal);
    if (fills.length >= HL_FILLS_PER_PAGE && span > 60_000) {
      span = Math.floor(span / 4);
      continue;
    }
    if (fills.length === 0) {
      if (start <= minTime) return { fills: [], nextEnd: null };
      span *= 4;
      continue;
    }
    return { fills, nextEnd: start - 1 };
  }
  return { fills: [], nextEnd: null };
}

const ClearinghouseSchema = z.object({
  assetPositions: z.array(z.object({ position: z.object({ coin: z.string(), leverage: z.object({ value: z.number() }).optional() }) })),
});

const ActiveAssetSchema = z.object({ leverage: z.object({ value: z.number() }) });

/** The coin's current leverage setting (activeAssetData, then clearinghouseState), else 1×. */
export async function fetchHlLeverage(user: string, coin: string): Promise<number> {
  try {
    const a = await hlInfo({ type: 'activeAssetData', user, coin }, ActiveAssetSchema);
    if (a.leverage.value > 0) return a.leverage.value;
  } catch {
    // fall through
  }
  try {
    const s = await hlInfo({ type: 'clearinghouseState', user }, ClearinghouseSchema);
    const p = s.assetPositions.find((a) => a.position.coin === coin);
    return p?.position.leverage?.value ?? 1;
  } catch {
    return 1;
  }
}
