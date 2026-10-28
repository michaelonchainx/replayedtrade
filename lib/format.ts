const moneyFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** `$0.00`, `+$1,234.56`, `-$448.73` (rounding to cents decides the sign) */
export function formatPnl(v: number): string {
  const cents = Math.round(v * 100);
  if (cents === 0) return '$0.00';
  const s = moneyFmt.format(Math.abs(cents) / 100);
  return (cents > 0 ? '+$' : '-$') + s;
}

export function formatUsd(v: number): string {
  return '$' + moneyFmt.format(v);
}

/** `+2.36%`, `-1.23%`, `0.00%` */
export function formatPct(ratio: number): string {
  const bp = Math.round(ratio * 10000);
  if (bp === 0) return '0.00%';
  return (bp > 0 ? '+' : '-') + (Math.abs(bp) / 100).toFixed(2) + '%';
}

export function formatPx(v: number, decimals: number): string {
  const d = Math.max(0, Math.min(6, decimals));
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: v >= 100000 }).format(v);
}

/** Decimal places in a raw price string, e.g. "77.966" -> 3 */
export function decimalsOf(raw: string): number {
  const i = raw.indexOf('.');
  if (i < 0) return 0;
  return raw.replace(/0+$/, '').length - i - 1;
}

/** Max decimals seen across raw price strings, clamped to 0..6 */
export function pxDecimalsFromRaw(raws: string[]): number {
  let m = 0;
  for (const r of raws) m = Math.max(m, decimalsOf(r));
  return Math.max(0, Math.min(6, m));
}

/** `9H 2M`, `2D 4H`, `14M`, `45S` */
export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return h > 0 ? `${d}D ${h}H` : `${d}D`;
  if (h > 0) return m > 0 ? `${h}H ${m}M` : `${h}H`;
  if (m > 0) return `${m}M`;
  return `${Math.max(0, Math.floor(ms / 1000))}S`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n: number) => String(n).padStart(2, '0');

/** `HH:MM UTC`, or `DD MMM HH:MM UTC` when multiDay */
export function formatClock(t: number, multiDay: boolean): string {
  const d = new Date(t);
  const hm = `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} UTC`;
  return multiDay ? `${p2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${hm}` : hm;
}

export function formatDateTime(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

export function yyyymmdd(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`;
}

export function shortAddr(a: string): string {
  return a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

export function formatLeverage(l: number): string {
  return `${Number.isInteger(l) ? l : l.toFixed(1)}×`;
}

/** Hyperliquid perps tick rule: ≤5 significant figures (and ≤6 decimals). */
export function sigFigDecimals(px: number, sig = 5): number {
  if (!(px > 0)) return 2;
  const intDigits = Math.max(1, Math.floor(Math.log10(px)) + 1);
  return Math.max(0, Math.min(6, sig - intDigits));
}
