import LZString from 'lz-string';
import type { RenderOptions, Trade } from '../types';
import { SharePayloadSchema, type SharePayload } from './schema';

/** `?r=<lz-string JSON>` — trade + options only (never the avatar image or any token). */
export function encodeShare(trade: Trade, options: RenderOptions): string {
  const payload: SharePayload = { v: 1, trade: { ...trade }, options: { ...options } };
  return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

export function shareUrl(origin: string, trade: Trade, options: RenderOptions): string {
  return `${origin}/?r=${encodeShare(trade, options)}`;
}

export type DecodeResult = { ok: true; payload: SharePayload } | { ok: false };

export function decodeShare(r: string): DecodeResult {
  try {
    const json = LZString.decompressFromEncodedURIComponent(r);
    if (!json) return { ok: false };
    const parsed = SharePayloadSchema.safeParse(JSON.parse(json));
    return parsed.success ? { ok: true, payload: parsed.data } : { ok: false };
  } catch {
    return { ok: false };
  }
}
