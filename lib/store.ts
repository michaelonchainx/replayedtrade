'use client';
import { create } from 'zustand';
import type { Candle, Interval, RenderOptions, Trade, Venue } from './types';
import { DEFAULT_OPTIONS } from './types';
import { DEMO_CANDLES, DEMO_TRADE } from './demo';
import type { SizeMode } from './sizing';

export type { SizeMode };

export interface AppState {
  trade: Trade;
  /** candles for the replay window of `trade` */
  candles: Candle[];
  candleKey: string;
  candlesLoading: boolean;
  candleError: string | null;
  options: RenderOptions;
  avatar: ImageBitmap | null;
  avatarPreview: string | null;
  /** where the avatar came from: an upload wins over the X picture */
  avatarSource: 'upload' | 'x' | null;
  /** auto-load the X profile picture for the typed handle */
  useXAvatar: boolean;
  xAvatarStatus: 'idle' | 'loading' | 'found' | 'missing' | 'error';
  venue: Venue;
  /** banner (e.g. a broken share link) */
  banner: string | null;
  /** manual-pick sizing inputs; `sizeAmount` is in the unit of `sizeMode` */
  sizeMode: SizeMode;
  sizeAmount: number;
  /** unit for partial-exit sizes in the executions table */
  exitUnit: 'pct' | 'tokens' | 'usd';
  forcedInterval: Interval | null;

  setTrade: (t: Trade, candles?: Candle[]) => void;
  patchTrade: (p: Partial<Trade>) => void;
  setCandles: (key: string, c: Candle[] | null, error?: string | null, pxDecimals?: number | null) => void;
  setCandlesLoading: (v: boolean) => void;
  setOptions: (p: Partial<RenderOptions>) => void;
  setAvatar: (bmp: ImageBitmap | null, preview: string | null, source?: 'upload' | 'x' | null) => void;
  setUseXAvatar: (v: boolean) => void;
  setXAvatarStatus: (s: AppState['xAvatarStatus']) => void;
  setVenue: (v: Venue) => void;
  setBanner: (s: string | null) => void;
  setSizing: (mode: SizeMode, amount: number) => void;
  setExitUnit: (u: AppState['exitUnit']) => void;
}

export const tradeKey = (t: Trade) => `${t.venue === 'lighter' ? 'L' : 'H'}|${t.marketRef}|${t.entryTime}|${t.exitTime}`;

export const useApp = create<AppState>((set) => ({
  trade: DEMO_TRADE,
  candles: DEMO_CANDLES,
  candleKey: tradeKey(DEMO_TRADE),
  candlesLoading: false,
  candleError: null,
  options: DEFAULT_OPTIONS,
  avatar: null,
  avatarPreview: null,
  avatarSource: null,
  useXAvatar: true,
  xAvatarStatus: 'idle',
  venue: 'hyperliquid',
  banner: null,
  sizeMode: 'position',
  sizeAmount: Math.round(DEMO_TRADE.sizeBase * DEMO_TRADE.entryPx),
  exitUnit: 'pct',
  forcedInterval: null,

  setTrade: (t, candles) =>
    set(candles ? { trade: t, candles, candleKey: tradeKey(t), candleError: null } : { trade: t }),
  patchTrade: (p) => set((s) => ({ trade: { ...s.trade, ...p } })),
  setCandles: (key, c, error = null, pxDecimals = null) =>
    set((s) => {
      if (tradeKey(s.trade) !== key) return {};
      if (!c) return { candleError: error, candlesLoading: false };
      const trade = pxDecimals !== null ? { ...s.trade, pxDecimals } : s.trade;
      return { candles: c, candleKey: key, candleError: null, candlesLoading: false, trade };
    }),
  setCandlesLoading: (v) => set({ candlesLoading: v }),
  setOptions: (p) => set((s) => ({ options: { ...s.options, ...p } })),
  setAvatar: (avatar, avatarPreview, source = avatar ? 'upload' : null) => set({ avatar, avatarPreview, avatarSource: avatar ? source : null }),
  setUseXAvatar: (useXAvatar) => set({ useXAvatar }),
  setXAvatarStatus: (xAvatarStatus) => set({ xAvatarStatus }),
  setVenue: (venue) => set({ venue }),
  setBanner: (banner) => set({ banner }),
  setSizing: (sizeMode, sizeAmount) => set({ sizeMode, sizeAmount }),
  setExitUnit: (exitUnit) => set({ exitUnit }),
}));
