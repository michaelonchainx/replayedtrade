'use client';
import { useEffect, useState } from 'react';
import { useApp } from '@/lib/store';
import { sizeBaseFrom, sizeIn } from '@/lib/sizing';
import { finalPnl, returnRatio } from '@/lib/pnl';
import { formatPct, formatPnl, formatUsd } from '@/lib/format';
import { tradeFills, withFills } from '@/lib/fills';
import type { Fill, Trade } from '@/lib/types';
import { Segmented, Tag } from '../ui';

const p2 = (n: number) => String(n).padStart(2, '0');
export function toUtcInput(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}
export function fromUtcInput(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

/** Number input that keeps the user's raw text while typing and commits valid numbers. */
export function NumField({ id, label, value, onCommit, disabled, min, suffix, testId, compact }: { id: string; label?: string; value: number; onCommit: (v: number) => void; disabled?: boolean; min?: number; suffix?: string; testId?: string; compact?: boolean }) {
  const [raw, setRaw] = useState(String(value));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setRaw((r) => (Number(r) === value ? r : String(Math.round(value * 1e6) / 1e6)));
  }, [value]);
  return (
    <div>
      {label && (
        <label className="label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          className={`field ${compact ? '!py-1.5 text-[13px]' : ''}`}
          inputMode="decimal"
          value={raw}
          disabled={disabled}
          aria-invalid={bad}
          aria-label={label ? undefined : id}
          data-testid={testId}
          onChange={(e) => {
            setRaw(e.target.value);
            const v = Number(e.target.value);
            const ok = e.target.value.trim() !== '' && Number.isFinite(v) && (min === undefined || v >= min);
            setBad(!ok);
            if (ok) onCommit(v);
          }}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">{suffix}</span>}
      </div>
    </div>
  );
}

function DateField({ id, label, value, onCommit, disabled, compact }: { id: string; label?: string; value: number; onCommit: (v: number) => void; disabled?: boolean; compact?: boolean }) {
  return (
    <div>
      {label && (
        <label className="label" htmlFor={id}>
          {label}
        </label>
      )}
      <input
        id={id}
        type="datetime-local"
        aria-label={label ? undefined : id}
        className={`field [color-scheme:dark] ${compact ? '!py-1.5 text-[13px]' : ''}`}
        value={toUtcInput(value)}
        disabled={disabled}
        onChange={(e) => {
          const t = fromUtcInput(e.target.value);
          if (t !== null) onCommit(t);
        }}
      />
    </div>
  );
}

export { sizeBaseFrom, sizeIn } from '@/lib/sizing';

/** Coin quantity without trailing noise: 466.968500 → 466.9685 */
const fmtQty = (q: number) => String(Math.round(q * 1e4) / 1e4);

/** A partial exit can't close the whole position — that's the last exit's job. */
const MAX_PARTIAL = 0.999;

export type AddMode = 'in' | 'out' | null;

/** Executions table: scale-ins and partial exits. The last exit always closes the rest. */
function FillsTable({ trade, addMode, onAddMode }: { trade: Trade; addMode?: AddMode; onAddMode?: (m: AddMode) => void }) {
  const patchTrade = useApp((s) => s.patchTrade);
  const tokens = useApp((s) => s.sizeMode === 'tokens');
  const exitUnit = useApp((s) => s.exitUnit);
  const setExitUnit = useApp((s) => s.setExitUnit);
  const coin = trade.coin.toUpperCase();
  const fills = tradeFills(trade);
  const update = (next: Fill[]) => patchTrade(withFills(trade, next));

  let q = 0;
  const rows = fills.map((f, i) => {
    const before = q;
    q = f.kind === 'in' ? q + f.sz : Math.max(0, q - f.sz);
    const lastOut = f.kind === 'out' && !fills.slice(i + 1).some((x) => x.kind === 'out');
    return { f, i, before, lastOut };
  });
  const firstIn = fills.findIndex((f) => f.kind === 'in');

  return (
    <div className="border border-line" data-testid="fills-table">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel px-4 py-3">
        <span className="label !mb-0">Executions · {fills.filter((f) => f.kind === 'in').length} in · {fills.filter((f) => f.kind === 'out').length} out</span>
        <div className="flex flex-wrap items-center gap-3">
          <span className="label !mb-0">Exit size in</span>
          <Segmented
            label="Exit size unit"
            size="sm"
            testId="exit-unit"
            value={exitUnit}
            onChange={setExitUnit}
            options={[
              { v: 'pct', label: '%' },
              { v: 'tokens', label: coin },
              { v: 'usd', label: 'USD' },
            ]}
          />
        {onAddMode && (
          <div className="flex gap-2">
            <button type="button" className={`btn !px-3 !py-1.5 text-xs ${addMode === 'in' ? 'btn-primary' : 'btn-quiet'}`} onClick={() => onAddMode(addMode === 'in' ? null : 'in')} data-testid="add-entry">
              + Add entry
            </button>
            <button type="button" className={`btn !px-3 !py-1.5 text-xs ${addMode === 'out' ? 'btn-primary' : 'btn-quiet'}`} onClick={() => onAddMode(addMode === 'out' ? null : 'out')} data-testid="add-exit">
              + Add exit
            </button>
          </div>
        )}
        </div>
      </div>
      {addMode && <p className="border-b border-line bg-green/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-green">Click the chart where you {addMode === 'in' ? 'added' : 'took profit / reduced'}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-ink-3">
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-2 py-2 font-medium">Time (UTC)</th>
              <th className="px-2 py-2 font-medium">Price</th>
              <th className="px-2 py-2 font-medium">Size</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ f, i, before, lastOut }) => (
              <tr key={i} className="border-t border-line">
                <td className="px-4 py-2">
                  <Tag tone={f.kind === 'in' ? 'green' : 'ink'}>{f.kind === 'in' ? 'In' : 'Out'}</Tag>
                </td>
                <td className="px-2 py-2">
                  <DateField id={`fill-t-${i}`} compact value={f.t} onCommit={(t) => update(fills.map((x, j) => (j === i ? { ...x, t } : x)))} />
                </td>
                <td className="px-2 py-2">
                  <NumField id={`fill-px-${i}`} compact value={f.px} min={0} onCommit={(px) => px > 0 && update(fills.map((x, j) => (j === i ? { ...x, px } : x)))} />
                </td>
                <td className="px-2 py-2">
                  {f.kind === 'in' ? (
                    tokens ? (
                      <NumField id={`fill-sz-${i}`} compact value={Math.round(f.sz * 1e6) / 1e6} min={0} suffix={trade.coin.toUpperCase()} onCommit={(q) => q > 0 && update(fills.map((x, j) => (j === i ? { ...x, sz: q } : x)))} />
                    ) : (
                      <NumField id={`fill-sz-${i}`} compact value={Math.round(f.sz * f.px * 100) / 100} min={0.01} suffix="USD" onCommit={(usd) => usd > 0 && update(fills.map((x, j) => (j === i ? { ...x, sz: usd / x.px } : x)))} />
                    )
                  ) : lastOut ? (
                    <span className="text-xs uppercase tracking-[0.08em] text-ink-3" data-testid="closes-rest">
                      Closes the rest · {exitUnit === 'usd' ? formatUsd(f.sz * f.px) : exitUnit === 'tokens' ? `${fmtQty(f.sz)} ${coin}` : `${Math.round((f.sz / Math.max(1e-12, before)) * 100)}%`}
                    </span>
                  ) : exitUnit === 'tokens' ? (
                    <NumField
                      id={`fill-qty-${i}`}
                      compact
                      value={Math.round(f.sz * 1e6) / 1e6}
                      min={0}
                      suffix={coin}
                      testId={`exit-size-${i}`}
                      onCommit={(q) => q > 0 && update(fills.map((x, j) => (j === i ? { ...x, sz: Math.min(q, before * MAX_PARTIAL) } : x)))}
                    />
                  ) : exitUnit === 'usd' ? (
                    <NumField
                      id={`fill-usd-${i}`}
                      compact
                      value={Math.round(f.sz * f.px * 100) / 100}
                      min={0}
                      suffix="USD"
                      testId={`exit-size-${i}`}
                      onCommit={(usd) => usd > 0 && update(fills.map((x, j) => (j === i ? { ...x, sz: Math.min(usd / x.px, before * MAX_PARTIAL) } : x)))}
                    />
                  ) : (
                    <NumField
                      id={`fill-pct-${i}`}
                      compact
                      value={Math.round((f.sz / Math.max(1e-12, before)) * 100)}
                      min={1}
                      suffix="%"
                      testId={`exit-size-${i}`}
                      onCommit={(pct) => update(fills.map((x, j) => (j === i ? { ...x, sz: Math.min(pct / 100, MAX_PARTIAL) * before } : x)))}
                    />
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  {fills.length > 2 && i !== firstIn && !(lastOut && fills.filter((x) => x.kind === 'out').length === 1) && (
                    <button type="button" className="px-2 text-ink-3 hover:text-red" aria-label="Remove execution" onClick={() => update(fills.filter((_, j) => j !== i))}>
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Side, leverage, size, fees and the executions table. */
export default function TradeFields({ addMode, onAddMode }: { addMode?: AddMode; onAddMode?: (m: AddMode) => void }) {
  const trade = useApp((s) => s.trade);
  const patchTrade = useApp((s) => s.patchTrade);
  const sizeMode = useApp((s) => s.sizeMode);
  const setSizing = useApp((s) => s.setSizing);
  const coin = trade.coin.toUpperCase();

  /** Resize the whole position (all executions scale together). */
  const resize = (sizeBase: number) => {
    if (!(sizeBase > 0)) return;
    const k = sizeBase / trade.sizeBase;
    if (trade.fills) patchTrade(withFills(trade, trade.fills.map((f) => ({ ...f, sz: f.sz * k }))));
    else patchTrade({ sizeBase });
  };

  const pnl = finalPnl(trade);
  const ret = returnRatio(trade, pnl);

  return (
    <div className="flex flex-col gap-5" data-testid="trade-fields">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-[1fr_1fr_auto_1.2fr_1fr]">
        <div>
          <span className="label">Side</span>
          <div className="grid grid-cols-2 border border-line bg-panel" role="radiogroup" aria-label="Side">
            {(['long', 'short'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={trade.side === s}
                onClick={() => patchTrade({ side: s })}
                className={`py-2.5 text-sm font-extrabold uppercase tracking-[0.06em] transition-colors disabled:cursor-not-allowed ${trade.side === s ? (s === 'long' ? 'bg-green text-on-pill' : 'bg-ink text-on-pill') : 'text-ink-2 hover:text-ink'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <NumField id="lev" label="Leverage" value={trade.leverage} min={1} suffix="×" testId="leverage" onCommit={(v) => patchTrade({ leverage: Math.min(50, Math.max(1, v)) })} />
        <>
            <div>
              <span className="label">Size in</span>
              <Segmented
                label="Size mode"
                size="sm"
                value={sizeMode}
                testId="size-mode"
                onChange={(m) => setSizing(m, sizeIn(m, trade))}
                options={[
                  { v: 'position', label: 'USD' },
                  { v: 'margin', label: 'Margin' },
                  { v: 'tokens', label: coin },
                ]}
              />
            </div>
            <NumField
              id="size"
              label={sizeMode === 'position' ? 'Max position (USD)' : sizeMode === 'margin' ? 'Margin (USD)' : `Max position (${coin})`}
              value={sizeIn(sizeMode, trade)}
              suffix={sizeMode === 'tokens' ? coin : 'USD'}
              min={0}
              testId="size-amount"
              onCommit={(v) => {
                if (!(v > 0)) return;
                setSizing(sizeMode, v);
                resize(sizeBaseFrom(sizeMode, v, trade.leverage, trade.entryPx));
              }}
            />
        </>
        <NumField id="fees" label="Fees (USD)" value={trade.feesUsd} min={0} onCommit={(v) => patchTrade({ feesUsd: v })} />
      </div>

      <FillsTable trade={trade} addMode={addMode} onAddMode={onAddMode} />

      <div className="flex flex-wrap items-center justify-between gap-3 border border-line bg-panel px-4 py-3">
        <span className="label !mb-0" title="Funding payments are excluded from PnL.">
          Net PnL · funding excluded
        </span>
        <span className={`tnum text-lg font-extrabold ${pnl >= 0 ? 'text-green' : 'text-red'}`} data-testid="net-pnl">
          {formatPnl(pnl)} · {formatPct(ret)}
        </span>
      </div>
    </div>
  );
}
