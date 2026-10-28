import type { VideoFormat } from '../types';
import { LAYOUT_16X9 } from './layout16x9';
import { LAYOUT_9X16 } from './layout9x16';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Every measurement used by renderFrame ("Tape × Signal" brand). Text y values are baselines. */
export interface Layout {
  W: number;
  H: number;
  /** background grid cell (brand: 50px) */
  grid: number;
  wordmark: { x: number; baseline: number; size: number };
  /** ticker + side tags, right-aligned */
  tags: { right: number; y: number; h: number; font: number; padX: number; gap: number };
  hero: {
    x: number;
    align: 'left' | 'center';
    labelBaseline: number;
    labelFont: number;
    numberBaseline: number;
    numberMax: number;
    numberMaxWidth: number;
    subBaseline: number;
    subFont: number;
  };
  stats: {
    columns: { x: number; right: number }[];
    rowsPerColumn: number;
    divider: number;
    baseline: number;
    rowGap: number;
    labelFont: number;
    valueFont: number;
  };
  user: { x: number; avatarY: number; avatar: number; nameX: number; nameBaseline: number; nameFont: number; footerBaseline: number; footerFont: number };
  /** REC label + video timecode */
  footerRow: { left: number; right: number; baseline: number; font: number };
  panel: Rect;
  plot: { left: number; right: number; top: number; bottom: number };
  playhead: { top: number; bottom: number; chipFont: number; chipH: number };
  progress: { x: number; y: number; w: number; h: number };
  tag: { x: number; w: number; h: number; font: number };
  label: { right: number; h: number; font: number; padX: number };
  marker: { h: number; font: number; gap: number };
  banner: { x: number; y: number; h: number; font: number };
  /** PnL end card */
  outro: {
    x: number;
    kickerBaseline: number;
    kickerFont: number;
    numberBaseline: number;
    numberMax: number;
    numberMaxWidth: number;
    subBaseline: number;
    subFont: number;
    detailBaseline: number;
    detailFont: number;
    /** mini chart of the whole trade */
    spark: Rect;
  };
}

export function layoutFor(format: VideoFormat): Layout {
  return format === '9x16' ? LAYOUT_9X16 : LAYOUT_16X9;
}
