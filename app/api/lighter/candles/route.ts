import { z } from 'zod';
import { bad, lighterGet } from '@/lib/lighter/upstream';

const Q = z.object({
  market_id: z.coerce.number().int().min(0),
  resolution: z.enum(['1m', '5m', '15m', '30m', '1h', '4h', '12h', '1d']),
  start: z.coerce.number().int().positive(), // ms
  end: z.coerce.number().int().positive(), // ms
});

/** One page (≤500 candles). Lighter takes seconds in, returns ms out (verified against the live API). */
export async function GET(req: Request) {
  const q = Q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return bad('Invalid candle request');
  const { market_id, resolution, start, end } = q.data;
  return lighterGet('candles', {
    market_id,
    resolution,
    start_timestamp: Math.floor(start / 1000),
    end_timestamp: Math.floor(end / 1000),
    count_back: 500,
  });
}
