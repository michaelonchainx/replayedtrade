import { z } from 'zod';

const finite = z.number().finite();

const FillSchema = z.object({ kind: z.enum(['in', 'out']), t: z.number().int().positive(), px: finite.positive(), sz: finite.positive() });

export const TradeSchema = z.object({
  venue: z.enum(['hyperliquid', 'lighter']),
  coin: z.string().min(1).max(40),
  marketRef: z.string().min(1).max(60),
  side: z.enum(['long', 'short']),
  entryTime: z.number().int().positive(),
  entryPx: finite.positive(),
  exitTime: z.number().int().positive(),
  exitPx: finite.positive(),
  sizeBase: finite.positive(),
  leverage: finite.min(1).max(200),
  feesUsd: finite.min(0),
  pxDecimals: z.number().int().min(0).max(6),
  fills: z.array(FillSchema).min(2).max(60).optional(),
}).refine((t) => t.exitTime >= t.entryTime, 'exit before entry');

export const OptionsSchema = z.object({
  username: z.string().max(20),
  footer: z.string().max(40),
  showLeverage: z.boolean(),
  showSize: z.boolean(),
  percentOnly: z.boolean(),
  sound: z.boolean().default(true),
  length: z.union([z.literal(15), z.literal(25), z.literal(40)]),
  format: z.enum(['16x9', '9x16']),
});

export const SharePayloadSchema = z.object({ v: z.literal(1), trade: TradeSchema, options: OptionsSchema });
export type SharePayload = z.infer<typeof SharePayloadSchema>;
