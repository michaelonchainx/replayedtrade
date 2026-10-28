import { formatClock, formatDuration, formatLeverage, formatPct, formatPx, formatUsd, formatPnl } from '../format';
import { positionUsd } from '../pnl';
import { BG_COLOR } from './background';
import { drawIdenticon } from './identicon';
import type { FillEvent, SceneTimeline } from './timeline';

/** Brand tokens ("Tape × Signal"). Red only ever means down / loss. */
export const COLORS = {
  bg: BG_COLOR,
  surface: '#111513',
  line: '#222A24',
  ink: '#E8EDE9',
  ink2: '#9AA39C',
  ink3: '#7D877F',
  green: '#6EF278',
  red: '#F84C45',
  onGreen: '#0A0C0B',
} as const;

type Ctx = CanvasRenderingContext2D;
type Align = 'left' | 'right' | 'center';

export const DISPLAY = (size: number) => `900 ${size}px Archivo`;
export const MONO = (weight: number, size: number) => `${weight} ${size}px "JetBrains Mono"`;

/**
 * Text with explicit tracking (em). Canvas letterSpacing isn't available everywhere,
 * so characters are laid out one by one. Returns the drawn width.
 */
export function measureTracked(ctx: Ctx, text: string, font: string, size: number, tracking: number): number {
  ctx.font = font;
  if (!tracking) return ctx.measureText(text).width;
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + tracking * size;
  return w - tracking * size;
}

export function drawTracked(ctx: Ctx, text: string, x: number, y: number, font: string, size: number, tracking = 0, align: Align = 'left'): number {
  const w = measureTracked(ctx, text, font, size, tracking);
  ctx.font = font;
  let cx = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  ctx.textAlign = 'left';
  if (!tracking) {
    ctx.fillText(text, cx, y);
    return w;
  }
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking * size;
  }
  return w;
}

/** Back-compat helper used for layout measurement in tests/scripts. */
export function measureNum(ctx: Ctx, text: string, f: string): number {
  ctx.font = f;
  return ctx.measureText(text).width;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);

/** Spring pop: 0 → 1.15 → 1 over ~250 ms. */
export function popScale(seconds: number): number {
  if (seconds < 0) return 0;
  if (seconds < 0.15) return 1.15 * easeOut(seconds / 0.15);
  if (seconds < 0.25) {
    const x = (seconds - 0.15) / 0.1;
    return 1.15 - 0.15 * (x * x * (3 - 2 * x));
  }
  return 1;
}

/** 1 → 0 decay over `dur` seconds (0 outside). */
export function decay(seconds: number, dur: number): number {
  if (seconds < 0 || seconds > dur) return 0;
  const x = seconds / dur;
  return 1 - x * x * (3 - 2 * x);
}

type Icon = 'play' | 'stop' | 'plus' | 'minus';

/** Glyphs drawn as shapes (the latin font subsets don't include ▶ ■). Returns advance width. */
function drawIcon(ctx: Ctx, icon: Icon, x: number, baseline: number, size: number): number {
  const s = size * 0.62;
  const top = baseline - size * 0.36 - s / 2;
  ctx.beginPath();
  if (icon === 'play') {
    ctx.moveTo(x, top);
    ctx.lineTo(x + s * 0.9, top + s / 2);
    ctx.lineTo(x, top + s);
    ctx.closePath();
    ctx.fill();
  } else if (icon === 'stop') {
    ctx.fillRect(x, top + s * 0.08, s * 0.84, s * 0.84);
  } else if (icon === 'plus') {
    ctx.fillRect(x, top + s * 0.4, s, s * 0.2);
    ctx.fillRect(x + s * 0.4, top, s * 0.2, s);
  } else {
    ctx.fillRect(x, top + s * 0.4, s, s * 0.2);
  }
  return s + size * 0.45;
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** The hero number's font size is fixed per timeline so it never jitters while ticking. */
const heroSizeCache = new WeakMap<SceneTimeline, number>();
function heroSize(ctx: Ctx, tl: SceneTimeline, text: (v: number, r: number) => string): number {
  const hit = heroSizeCache.get(tl);
  if (hit) return hit;
  const H = tl.layout.hero;
  let widest = 0;
  // sample the extremes the number will reach
  let maxAbs = Math.abs(tl.finalPnl);
  let maxRet = Math.abs(tl.finalReturn);
  for (let i = 0; i < tl.frames; i++) {
    maxAbs = Math.max(maxAbs, Math.abs(tl.pnl[i]));
    maxRet = Math.max(maxRet, Math.abs(tl.ret[i]));
  }
  for (const s of [-1, 1]) {
    const w = measureTracked(ctx, text(s * maxAbs, s * maxRet), DISPLAY(H.numberMax), H.numberMax, -0.05);
    widest = Math.max(widest, w);
  }
  const size = Math.min(H.numberMax, Math.floor((H.numberMax * H.numberMaxWidth) / Math.max(1, widest)));
  heroSizeCache.set(tl, size);
  return size;
}

function fillLabel(ev: FillEvent, idx: number, all: FillEvent[], tl: SceneTimeline): { icon: Icon; text: string; final: boolean } {
  const { trade } = tl;
  const dec = trade.pxDecimals;
  const side = trade.side === 'long' ? 'LONG' : 'SHORT';
  if (idx === 0) return { icon: 'play', text: `${side} OPENED · ${formatPx(ev.px, dec)}`, final: false };
  if (idx === all.length - 1) return { icon: 'stop', text: `CLOSED · ${tl.options.percentOnly ? formatPct(tl.finalReturn) : formatPnl(tl.finalPnl)}`, final: true };
  if (ev.kind === 'in') return { icon: 'plus', text: `ADDED · ${formatPx(ev.px, dec)}`, final: false };
  const pct = ev.before > 0 ? Math.round(((ev.before - ev.after) / ev.before) * 100) : 100;
  return { icon: 'minus', text: `TRIMMED ${pct}% · ${formatPx(ev.px, dec)}`, final: false };
}

/** Background, wordmark (top-left) and ticker/side tags (top-right) — shared by the replay and the end card. */
function drawChrome(ctx: Ctx, tl: SceneTimeline): void {
  const L = tl.layout;
  const { trade, options, branding } = tl;
  const long = trade.side === 'long';
  // ── background: Tape Black + 50px grid ──────────────────────
  if (branding.background) ctx.drawImage(branding.background, 0, 0, L.W, L.H);
  else {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, L.W, L.H);
  }

  // ── wordmark (top-left) ─────────────────────────────────────
  {
    const wm = L.wordmark;
    ctx.fillStyle = COLORS.ink;
    const w = drawTracked(ctx, 'replayed', wm.x, wm.baseline, DISPLAY(wm.size), wm.size, -0.05);
    ctx.fillStyle = COLORS.green;
    drawTracked(ctx, '.trade', wm.x + w - 0.02 * wm.size, wm.baseline, DISPLAY(wm.size), wm.size, -0.05);
  }

  // ── tags (top-right): ticker outline + side ─────────────────
  {
    const tg = L.tags;
    const f = MONO(800, tg.font);
    const side = (long ? 'LONG' : 'SHORT') + (options.showLeverage ? ` ${formatLeverage(trade.leverage)}` : '');
    const items = [
      { text: side, fill: long ? COLORS.green : COLORS.ink, color: COLORS.onGreen, outline: false },
      { text: trade.coin.toUpperCase(), fill: null as string | null, color: COLORS.ink, outline: true },
    ];
    let right = tg.right;
    const baseline = tg.y + tg.h / 2 + tg.font * 0.36;
    for (const it of items) {
      const w = measureTracked(ctx, it.text, f, tg.font, 0.02) + tg.padX * 2;
      const x = right - w;
      if (it.fill) {
        ctx.fillStyle = it.fill;
        ctx.fillRect(x, tg.y, w, tg.h);
      } else {
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, tg.y + 1, w - 2, tg.h - 2);
      }
      ctx.fillStyle = it.color;
      drawTracked(ctx, it.text, x + tg.padX, baseline, f, tg.font, 0.02);
      right = x - tg.gap;
    }
  }
}

/** Avatar + @handle + footer line. */
function drawUser(ctx: Ctx, tl: SceneTimeline): void {
  const L = tl.layout;
  const { options, branding } = tl;
  // ── user ────────────────────────────────────────────────────
  {
    const u = L.user;
    const s = u.avatar;
    if (branding.avatar) ctx.drawImage(branding.avatar, u.x, u.avatarY, s, s);
    else {
      ctx.fillStyle = COLORS.surface;
      ctx.fillRect(u.x, u.avatarY, s, s);
      drawIdenticon(ctx, options.username, u.x + s * 0.1, u.avatarY + s * 0.1, s * 0.8);
    }
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(u.x + 0.5, u.avatarY + 0.5, s - 1, s - 1);
    ctx.fillStyle = COLORS.ink;
    drawTracked(ctx, '@' + (options.username || 'anon'), u.nameX, u.nameBaseline, MONO(800, u.nameFont), u.nameFont, 0);
    if (options.footer) {
      ctx.fillStyle = COLORS.ink3;
      drawTracked(ctx, options.footer, u.nameX, u.footerBaseline, MONO(400, u.footerFont), u.footerFont, 0);
    }
  }
}

const outroSizeCache = new WeakMap<SceneTimeline, number>();

/**
 * PnL end card: a green tape-wipe reveals the result on its own — the number counts up and
 * slams, then return/duration, IN → OUT, a mini chart of the whole trade, handle and wordmark.
 */
function drawOutro(ctx: Ctx, tl: SceneTimeline, i: number): void {
  const L = tl.layout;
  const O = L.outro;
  const { trade, candles, options } = tl;
  const t = (i - tl.outroFrame) / tl.fps;
  const wipe = clamp01(t / 0.5);
  const wipeX = L.W * (wipe < 0.5 ? 2 * wipe * wipe : 1 - Math.pow(-2 * wipe + 2, 2) / 2);
  const fin = tl.finalPnl;
  const finRet = tl.finalReturn;
  const up = Math.round(fin * 100) >= 0;
  const color = up ? COLORS.green : COLORS.red;
  const heroText = (v: number, r: number) => (options.percentOnly ? formatPct(r) : formatPnl(v));

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, wipeX, L.H);
  ctx.clip();
  drawChrome(ctx, tl);

  // kicker: ■ CLOSED · HYPE · LONG 2×   (typed in)
  const side = (trade.side === 'long' ? 'LONG' : 'SHORT') + (options.showLeverage ? ` ${formatLeverage(trade.leverage)}` : '');
  const kicker = `TRADE CLOSED · ${trade.coin.toUpperCase()} · ${side}`;
  const kAge = t - 0.3;
  if (kAge > 0) {
    const kf = MONO(700, O.kickerFont);
    ctx.fillStyle = color;
    ctx.fillRect(O.x, O.kickerBaseline - O.kickerFont * 0.72, O.kickerFont * 0.62, O.kickerFont * 0.62);
    ctx.fillStyle = COLORS.ink2;
    drawTracked(ctx, kicker.slice(0, Math.min(kicker.length, Math.floor(kAge * 60) + 1)), O.x + O.kickerFont * 1.1, O.kickerBaseline, kf, O.kickerFont, 0.1);
  }

  // the one huge number: counts up, then slams
  let size = outroSizeCache.get(tl);
  if (!size) {
    const w = measureTracked(ctx, heroText(fin, finRet), DISPLAY(O.numberMax), O.numberMax, -0.05);
    size = Math.min(O.numberMax, Math.floor((O.numberMax * O.numberMaxWidth) / Math.max(1, w)));
    outroSizeCache.set(tl, size);
  }
  const countT = clamp01((t - 0.4) / 0.9);
  const c = easeOut(countT);
  const text = heroText(fin * c, finRet * c);
  const slamAge = t - 1.3;
  const slam = slamAge >= 0 ? decay(slamAge, 0.3) : 0;
  ctx.save();
  ctx.translate(O.x, O.numberBaseline);
  ctx.scale(1 + 0.06 * slam, 1 + 0.06 * slam);
  if (slam > 0) {
    ctx.globalAlpha = 0.45 * slam;
    ctx.fillStyle = COLORS.ink;
    drawTracked(ctx, text, 8 * slam, 0, DISPLAY(size), size, -0.05);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = t < 0.4 ? COLORS.ink : color;
  drawTracked(ctx, text, 0, 0, DISPLAY(size), size, -0.05);
  ctx.restore();

  // return · duration, then IN → OUT
  const subA = clamp01((t - 1.2) / 0.3);
  if (subA > 0) {
    ctx.globalAlpha = subA;
    const sf = MONO(700, O.subFont);
    let x = O.x;
    if (!options.percentOnly) {
      ctx.fillStyle = color;
      x += drawTracked(ctx, formatPct(finRet), x, O.subBaseline, sf, O.subFont, 0);
      ctx.fillStyle = COLORS.ink3;
      x += drawTracked(ctx, '  ·  ', x, O.subBaseline, MONO(500, O.subFont), O.subFont, 0);
    }
    ctx.fillStyle = COLORS.ink2;
    drawTracked(ctx, formatDuration(trade.exitTime - trade.entryTime), x, O.subBaseline, MONO(500, O.subFont), O.subFont, 0);

    const ins = tl.fills.filter((f) => f.kind === 'in').length;
    const outs = tl.fills.length - ins;
    const df = MONO(500, O.detailFont);
    const parts = [
      `${ins > 1 ? 'AVG IN' : 'IN'} ${formatPx(trade.entryPx, trade.pxDecimals)}`,
      `${outs > 1 ? 'AVG OUT' : 'OUT'} ${formatPx(trade.exitPx, trade.pxDecimals)}`,
    ];
    if (tl.fills.length > 2) parts.push(`${ins} IN · ${outs} OUT`);
    ctx.fillStyle = COLORS.ink3;
    drawTracked(ctx, parts.join('   →   ').replace(/→ {3}(\d+ IN)/, '·   $1'), O.x, O.detailBaseline, df, O.detailFont, 0.04);
    ctx.globalAlpha = 1;
  }

  // mini chart of the whole trade, drawn left → right
  const sp = O.spark;
  const draw = clamp01((t - 0.6) / 1.0);
  if (draw > 0) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const k of candles) {
      lo = Math.min(lo, k.l);
      hi = Math.max(hi, k.h);
    }
    const n = candles.length;
    const xs = (k: number) => sp.x + (k / Math.max(1, n - 1)) * sp.w;
    const ys = (v: number) => sp.y + sp.h - ((v - lo) / Math.max(1e-12, hi - lo)) * sp.h;
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(sp.x - 16.5, sp.y - 16.5, sp.w + 33, sp.h + 33);
    ctx.save();
    ctx.beginPath();
    ctx.rect(sp.x - 16, sp.y - 16, (sp.w + 32) * draw, sp.h + 32);
    ctx.clip();
    const first = tl.fills[0].candle;
    const last = tl.fills[tl.fills.length - 1].candle;
    // context (outside the trade) in ink-3, the trade itself in the result colour
    const seg = (from: number, to: number, stroke: string, width: number) => {
      ctx.beginPath();
      for (let k = from; k <= to; k++) {
        const x = xs(k);
        const y = ys(candles[k].c);
        if (k === from) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.stroke();
    };
    seg(0, first, COLORS.ink3, 2);
    seg(last, n - 1, COLORS.ink3, 2);
    seg(first, last, color, 4);
    for (const ev of tl.fills) {
      const s = 14;
      ctx.fillStyle = ev.kind === 'in' ? COLORS.green : COLORS.ink;
      ctx.fillRect(xs(ev.candle) - s / 2, ys(ev.px) - s / 2, s, s);
      ctx.strokeStyle = COLORS.bg;
      ctx.lineWidth = 2;
      ctx.strokeRect(xs(ev.candle) - s / 2, ys(ev.px) - s / 2, s, s);
    }
    ctx.restore();
  }

  drawUser(ctx, tl);

  // footer: REC + wordmark URL
  const fr = L.footerRow;
  const r = fr.font * 0.32;
  ctx.fillStyle = COLORS.red;
  ctx.beginPath();
  ctx.arc(O.x + r, fr.baseline - fr.font * 0.36, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.ink2;
  drawTracked(ctx, 'REPLAY', O.x + r * 2 + 12, fr.baseline, MONO(700, fr.font), fr.font, 0.1);
  ctx.fillStyle = COLORS.green;
  drawTracked(ctx, 'replayed.trade', fr.right, fr.baseline, MONO(800, fr.font * 1.2), fr.font * 1.2, 0, 'right');
  ctx.restore();

  // the wipe's leading edge
  if (wipe < 1) {
    ctx.fillStyle = COLORS.green;
    ctx.fillRect(wipeX - 4, 0, 8, L.H);
  }
}

export function renderFrame(ctx: Ctx, tl: SceneTimeline, frameIndex: number): void {
  const i = Math.max(0, Math.min(tl.frames - 1, Math.floor(frameIndex)));
  const L = tl.layout;
  const { trade, candles, options, branding } = tl;
  const fps = tl.fps;
  const N = candles.length;
  const long = trade.side === 'long';
  const done = tl.done[i];
  const entered = done > 0;
  const closed = done >= tl.fills.length;
  const pnl = tl.pnl[i];
  const ret = tl.ret[i];
  const up = Math.round(pnl * 100) >= 0;
  const pnlColor = up ? COLORS.green : COLORS.red;
  const sinceEntry = (i - tl.entryFrame) / fps;
  const sinceExit = (i - tl.exitFrame) / fps;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  drawChrome(ctx, tl);

  // ── hero: label + one huge number + sub line ────────────────
  const heroText = (v: number, r: number) => (options.percentOnly ? formatPct(r) : formatPnl(v));
  {
    const H = L.hero;
    ctx.fillStyle = COLORS.ink3;
    const label = closed ? (options.percentOnly ? 'RETURN · CLOSED' : 'NET PNL · CLOSED') : entered ? (options.percentOnly ? 'RETURN · LIVE' : 'NET PNL · LIVE') : 'WAITING FOR ENTRY';
    drawTracked(ctx, label, H.x, H.labelBaseline, MONO(500, H.labelFont), H.labelFont, 0.1);
    if (entered && !closed && Math.floor(i / (fps / 2)) % 2 === 0) {
      // live dot
      const lw = measureTracked(ctx, label, MONO(500, H.labelFont), H.labelFont, 0.1);
      ctx.fillStyle = pnlColor;
      ctx.fillRect(H.x + lw + 12, H.labelBaseline - H.labelFont * 0.62, H.labelFont * 0.55, H.labelFont * 0.55);
    }

    const size = heroSize(ctx, tl, heroText);
    const text = heroText(pnl, ret);
    const color = entered ? pnlColor : COLORS.ink;
    // exit slam: scale 1.08 → 1 and a short tape-glitch channel split
    const slam = closed ? decay(sinceExit, 0.35) : entered ? decay(sinceEntry, 0.25) * 0.4 : 0;
    const scale = 1 + 0.08 * slam;
    const glitch = closed ? decay(sinceExit, 0.5) : entered ? decay(sinceEntry, 0.3) : 0;
    ctx.save();
    ctx.translate(H.x, H.numberBaseline);
    ctx.scale(scale, scale);
    if (glitch > 0) {
      const off = 7 * glitch;
      ctx.globalAlpha = 0.45 * glitch;
      ctx.fillStyle = up ? COLORS.ink : COLORS.ink2;
      drawTracked(ctx, text, off, 0, DISPLAY(size), size, -0.05);
      ctx.fillStyle = up ? hexA(COLORS.green, 1) : COLORS.red;
      drawTracked(ctx, text, -off, 0, DISPLAY(size), size, -0.05);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = color;
    drawTracked(ctx, text, 0, 0, DISPLAY(size), size, -0.05);
    ctx.restore();

    // sub line: return % · duration (mono)
    const dur = formatDuration(trade.exitTime - trade.entryTime);
    const sf = MONO(700, H.subFont);
    let x = H.x;
    if (!options.percentOnly) {
      ctx.fillStyle = entered ? pnlColor : COLORS.ink2;
      x += drawTracked(ctx, formatPct(ret), x, H.subBaseline, sf, H.subFont, 0);
      ctx.fillStyle = COLORS.ink3;
      x += drawTracked(ctx, '  ·  ', x, H.subBaseline, MONO(500, H.subFont), H.subFont, 0);
    }
    ctx.fillStyle = COLORS.ink2;
    drawTracked(ctx, dur, x, H.subBaseline, MONO(500, H.subFont), H.subFont, 0);
  }

  // ── stats ───────────────────────────────────────────────────
  {
    const st = L.stats;
    const ins = tl.fills.filter((f) => f.kind === 'in').length;
    const outs = tl.fills.length - ins;
    const dec = trade.pxDecimals;
    const rows: { label: string; value: string; color: string }[] = [
      { label: ins > 1 ? 'AVG ENTRY' : 'ENTRY', value: formatPx(trade.entryPx, dec), color: COLORS.ink },
      closed
        ? { label: outs > 1 ? 'AVG EXIT' : 'EXIT', value: formatPx(trade.exitPx, dec), color: COLORS.ink }
        : { label: 'CURRENT', value: formatPx(tl.livePx[i], dec), color: COLORS.ink },
    ];
    if (options.showSize && !options.percentOnly) rows.push({ label: 'SIZE', value: formatUsd(positionUsd(trade)).replace(/\.\d\d$/, ''), color: COLORS.ink });
    if (tl.fills.length > 2) rows.push({ label: 'FILLS', value: `${ins} IN · ${outs} OUT`, color: COLORS.ink });
    for (const col of st.columns) {
      ctx.fillStyle = COLORS.line;
      ctx.fillRect(col.x, st.divider, col.right - col.x, 1);
    }
    const perCol = Math.max(st.rowsPerColumn, Math.ceil(rows.length / st.columns.length));
    rows.forEach((r, idx) => {
      const col = st.columns[Math.floor(idx / perCol)] ?? st.columns[st.columns.length - 1];
      const y = st.baseline + (idx % perCol) * st.rowGap;
      ctx.fillStyle = COLORS.ink3;
      drawTracked(ctx, r.label, col.x, y, MONO(500, st.labelFont), st.labelFont, 0.1);
      ctx.fillStyle = r.color;
      drawTracked(ctx, r.value, col.right, y, MONO(700, st.valueFont), st.valueFont, 0, 'right');
    });
  }

  drawUser(ctx, tl);

  // ── footer row: REC label + timecode ────────────────────────
  {
    const fr = L.footerRow;
    const t = i / fps;
    const blink = closed || Math.floor(t * 2) % 2 === 0;
    const r = fr.font * 0.32;
    if (blink) {
      ctx.fillStyle = COLORS.red;
      ctx.beginPath();
      ctx.arc(fr.left + r, fr.baseline - fr.font * 0.36, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = COLORS.ink2;
    drawTracked(ctx, 'REPLAY', fr.left + r * 2 + 12, fr.baseline, MONO(700, fr.font), fr.font, 0.1);
    const tc = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    ctx.fillStyle = COLORS.ink3;
    drawTracked(ctx, `${tc(t)} / ${tc(tl.frames / fps)}`, fr.right, fr.baseline, MONO(500, fr.font), fr.font, 0.05, 'right');
  }

  // ── chart panel ─────────────────────────────────────────────
  const P = L.panel;
  ctx.fillStyle = hexA(COLORS.bg, 0.86);
  ctx.fillRect(P.x, P.y, P.w, P.h);
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1;
  ctx.strokeRect(P.x + 0.5, P.y + 0.5, P.w - 1, P.h - 1);

  const plot = L.plot;
  const lo = tl.camMin[i];
  const hi = tl.camMax[i];
  const yOf = (v: number) => plot.bottom - ((v - lo) / (hi - lo)) * (plot.bottom - plot.top);
  const slot = tl.slot[i];
  const xOf = (k: number) => plot.left + (k + 0.5) * slot;
  const p = tl.progress[i];
  const kForm = Math.floor(p);
  const bodyW = Math.max(1, slot * 0.6);
  // wicks thicken a little while zoomed in, settle at the brand's 2px
  const wickW = Math.max(1, Math.min(slot * 0.25, 2 + Math.max(0, slot - 40) * 0.04));

  const drawCandle = (k: number, o: number, h: number, l: number, c: number, alpha: number) => {
    const x = xOf(k);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = c >= o ? COLORS.green : COLORS.red;
    const yh = yOf(h);
    const yl = yOf(l);
    ctx.fillRect(x - wickW / 2, yh, wickW, Math.max(1, yl - yh));
    const yo = yOf(o);
    const yc = yOf(c);
    const bh = Math.max(2, Math.abs(yc - yo));
    ctx.fillRect(x - bodyW / 2, bh === 2 ? (yo + yc) / 2 - 1 : Math.min(yo, yc), bodyW, bh);
    ctx.globalAlpha = 1;
  };

  const ohlcAt = (k: number) => {
    const c = candles[k];
    if (k === kForm) return { o: c.o, h: tl.formH[i], l: tl.formL[i], c: tl.livePx[i] };
    return c;
  };

  // only what has printed: the future stays hidden and the camera zooms out as candles arrive
  ctx.save();
  ctx.beginPath();
  ctx.rect(P.x + 1, P.y + 1, P.w - 2, P.h - 2);
  ctx.clip();
  for (let k = 0; k <= Math.min(N - 1, kForm); k++) {
    const c = ohlcAt(k);
    drawCandle(k, c.o, c.h, c.l, c.c, 1);
  }
  ctx.restore();

  // average-entry line + NET PNL label group
  const tag = L.tag;
  const avg = tl.avgPx[i];
  const entryY = yOf(avg);
  if (entered) {
    const draw = easeOut(sinceEntry / 0.35);
    const ex = xOf(tl.fills[0].candle);
    ctx.fillStyle = hexA(pnlColor, 0.9);
    let groupLeft = tag.x;
    let gx = 0;
    let nameW = 0;
    let valW = 0;
    const lb = L.label;
    const lf = MONO(700, lb.font);
    const valText = formatPnl(pnl);
    if (!options.percentOnly) {
      nameW = measureTracked(ctx, 'NET PNL', lf, lb.font, 0.08) + lb.padX * 2;
      valW = Math.max(measureTracked(ctx, valText, lf, lb.font, 0) + lb.padX * 2, lb.font * 7.2);
      gx = lb.right - nameW - valW;
      groupLeft = gx;
    }
    const left = ex - (ex - P.x) * draw;
    const right = ex + (groupLeft - ex) * draw;
    ctx.fillRect(left, Math.round(entryY), right - left, 1);
    if (draw >= 1) ctx.fillRect(lb.right, Math.round(entryY), tag.x - lb.right, 1);
    if (!options.percentOnly && draw > 0.6) {
      ctx.globalAlpha = clamp01((draw - 0.6) / 0.4);
      const gy = entryY - lb.h / 2;
      ctx.fillStyle = pnlColor;
      ctx.fillRect(gx, gy, nameW, lb.h);
      ctx.fillStyle = COLORS.surface;
      ctx.fillRect(gx + nameW, gy, valW, lb.h);
      ctx.strokeStyle = pnlColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(gx + 0.5, gy + 0.5, nameW + valW - 1, lb.h - 1);
      const by = entryY + lb.font * 0.36;
      ctx.fillStyle = COLORS.onGreen;
      drawTracked(ctx, 'NET PNL', gx + lb.padX, by, lf, lb.font, 0.08);
      ctx.fillStyle = pnlColor;
      drawTracked(ctx, valText, gx + nameW + valW / 2, by, lf, lb.font, 0, 'center');
      ctx.globalAlpha = 1;
    }
  }

  // fill markers: IN = green, OUT = paper. Scan flash + square ripples on execution.
  const stack = new Map<string, number>();
  tl.fills.forEach((ev) => {
    if (i < ev.frame) return;
    const age = (i - ev.frame) / fps;
    const isIn = ev.kind === 'in';
    const below = isIn === long; // long: IN below the low, OUT above the high (shorts mirrored)
    const color = isIn ? COLORS.green : COLORS.ink;
    const m = L.marker;
    const key = `${ev.candle}:${below ? 'b' : 'a'}`;
    const nth = stack.get(key) ?? 0;
    stack.set(key, nth + 1);
    const c = ohlcAt(ev.candle);
    const x = xOf(ev.candle);
    const text = isIn ? 'IN' : 'OUT';
    const tw = measureTracked(ctx, text, MONO(800, m.font), m.font, 0.06) + 16;
    const anchorY = below ? yOf(c.l) : yOf(c.h);
    const offset = m.gap + nth * (m.h + 6);
    const cy = below ? anchorY + offset + m.h / 2 : anchorY - offset - m.h / 2;

    // scan flash: a vertical bar sweeping down the whole plot
    const scan = decay(age, 0.45);
    if (scan > 0) {
      const bw = 2 + 26 * scan;
      ctx.fillStyle = hexA(color, 0.28 * scan);
      ctx.fillRect(x - bw / 2, plot.top - 30, bw, plot.bottom - plot.top + 60);
    }
    // square ripples
    for (const [delay, max] of [
      [0, 3.4],
      [0.12, 2.4],
    ] as const) {
      const a = age - delay;
      const r = decay(a, 0.6);
      if (a >= 0 && r > 0) {
        const grow = 1 + (max - 1) * easeOut(a / 0.6);
        const w = tw * grow;
        const h = m.h * grow;
        ctx.strokeStyle = hexA(color, 0.85 * r);
        ctx.lineWidth = 2;
        ctx.strokeRect(x - w / 2, cy - h / 2, w, h);
      }
    }
    // connector
    ctx.fillStyle = hexA(color, 0.7);
    if (below) ctx.fillRect(x - 0.5, anchorY + 3, 1, cy - m.h / 2 - anchorY - 3);
    else ctx.fillRect(x - 0.5, cy + m.h / 2, 1, anchorY - 3 - cy - m.h / 2);
    // tag
    const sc = popScale(age);
    ctx.save();
    ctx.translate(x, cy);
    ctx.scale(sc, sc);
    ctx.fillStyle = color;
    ctx.fillRect(-tw / 2, -m.h / 2, tw, m.h);
    ctx.fillStyle = COLORS.onGreen;
    drawTracked(ctx, text, 0, m.font * 0.36, MONO(800, m.font), m.font, 0.06, 'center');
    ctx.restore();
  });

  // playhead + timecode chip
  {
    const ph = L.playhead;
    const x = Math.min(plot.right, plot.left + Math.min(p, N) * slot);
    ctx.fillStyle = COLORS.green;
    ctx.fillRect(Math.round(x) - 1, ph.top, 3, ph.bottom - ph.top);
    const k = Math.min(N - 1, kForm);
    const f = p - k;
    const clockT = candles[k].t + Math.floor((Math.min(1, f) * tl.intervalMs) / 60000) * 60000;
    const text = formatClock(clockT, tl.multiDay).replace(' UTC', '');
    const cf = MONO(800, ph.chipFont);
    const iconW = ph.chipFont * 0.62 + ph.chipFont * 0.45;
    const w = measureTracked(ctx, text, cf, ph.chipFont, 0.02) + 20 + iconW;
    // flip to the left of the playhead before it reaches the price-tag column
    const cx = x + w + 6 > L.tag.x ? x - w - 2 : x + 2;
    ctx.fillRect(cx, ph.top, w, ph.chipH);
    ctx.fillStyle = COLORS.onGreen;
    const by = ph.top + ph.chipH / 2 + ph.chipFont * 0.36;
    drawIcon(ctx, 'play', cx + 10, by, ph.chipFont);
    drawTracked(ctx, text, cx + 10 + iconW, by, cf, ph.chipFont, 0.02);
  }

  // progress bar
  {
    const pr = L.progress;
    ctx.fillStyle = COLORS.line;
    ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
    ctx.fillStyle = COLORS.green;
    ctx.fillRect(pr.x, pr.y, pr.w * (i / Math.max(1, tl.frames - 1)), pr.h);
  }

  // price tags (right gutter): live price + average entry
  const drawTag = (y: number, text: string, color: string) => {
    const ty = Math.max(P.y + 4, Math.min(P.y + P.h - tag.h - 4, y - tag.h / 2));
    ctx.fillStyle = color;
    ctx.fillRect(tag.x, ty, tag.w, tag.h);
    ctx.fillStyle = COLORS.onGreen;
    drawTracked(ctx, text, tag.x + tag.w / 2, ty + tag.h / 2 + tag.font * 0.36, MONO(700, tag.font), tag.font, 0, 'center');
  };
  const live = tl.livePx[i];
  const formOpen = candles[Math.min(N - 1, kForm)].o;
  let liveY = yOf(live);
  if (entered) {
    const d = liveY - entryY;
    if (Math.abs(d) < tag.h + 4) liveY = entryY + (d < 0 || (d === 0 && live >= avg) ? -1 : 1) * (tag.h + 4);
    drawTag(entryY, formatPx(avg, trade.pxDecimals), pnlColor);
  }
  drawTag(liveY, formatPx(live, trade.pxDecimals), live >= formOpen ? COLORS.green : COLORS.red);

  // event banner (typed in, mono): opened / added / trimmed / closed
  {
    const bn = L.banner;
    let current: { ev: FillEvent; idx: number } | null = null;
    tl.fills.forEach((ev, idx) => {
      if (i >= ev.frame) current = { ev, idx };
    });
    if (current) {
      const { ev, idx } = current as { ev: FillEvent; idx: number };
      const { icon, text, final } = fillLabel(ev, idx, tl.fills, tl);
      const age = (i - ev.frame) / fps;
      if (final || age < 1.8) {
        const fade = final ? 1 : 1 - clamp01((age - 1.5) / 0.3);
        const chars = Math.min(text.length, Math.floor(age * 70) + 1);
        const shown = text.slice(0, chars);
        const f = MONO(800, bn.font);
        const iconW = bn.font * 0.62 + bn.font * 0.45;
        const w = measureTracked(ctx, text, f, bn.font, 0.06) + 28 + iconW;
        const fillC = final ? pnlColor : idx === 0 ? COLORS.green : COLORS.surface;
        ctx.globalAlpha = fade;
        ctx.fillStyle = fillC;
        ctx.fillRect(bn.x, bn.y, w, bn.h);
        if (fillC === COLORS.surface) {
          ctx.strokeStyle = COLORS.green;
          ctx.lineWidth = 2;
          ctx.strokeRect(bn.x + 1, bn.y + 1, w - 2, bn.h - 2);
        }
        ctx.fillStyle = fillC === COLORS.surface ? COLORS.green : COLORS.onGreen;
        const by = bn.y + bn.h / 2 + bn.font * 0.36;
        drawIcon(ctx, icon, bn.x + 14, by, bn.font);
        drawTracked(ctx, shown, bn.x + 14 + iconW, by, f, bn.font, 0.06);
        // terminal cursor while typing
        if (chars < text.length || Math.floor(age * 4) % 2 === 0) {
          const cw = measureTracked(ctx, shown, f, bn.font, 0.06);
          ctx.fillRect(bn.x + 16 + iconW + cw, bn.y + 8, bn.font * 0.55, bn.h - 16);
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  // close: frame-edge flash in the result colour
  const edge = closed ? decay(sinceExit, 0.6) : 0;
  if (edge > 0) {
    const bw = 10 * edge;
    ctx.fillStyle = hexA(pnlColor, 0.9 * edge);
    ctx.fillRect(0, 0, L.W, bw);
    ctx.fillRect(0, L.H - bw, L.W, bw);
    ctx.fillRect(0, 0, bw, L.H);
    ctx.fillRect(L.W - bw, 0, bw, L.H);
  }

  if (i >= tl.outroFrame) drawOutro(ctx, tl, i);

  ctx.restore();
}
