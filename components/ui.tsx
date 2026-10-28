'use client';

/** `replayed` in ink + `.trade` in green, Archivo 900 (live text, not an image). */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`display inline-block leading-none ${className}`}>
      <span className="text-ink">replayed</span>
      <span className="text-green">.trade</span>
    </span>
  );
}

/** Red REC dot + REPLAY. */
export function Rec({ label = 'Replay' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-sm font-bold uppercase tracking-[0.1em] text-ink-2">
      <svg className="rec-dot" width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <circle cx="7" cy="7" r="7" fill="#F84C45" />
      </svg>
      {label}
    </span>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  testId,
  size = 'md',
}: {
  value: T;
  options: { v: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  label: string;
  testId?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={label} data-testid={testId} className="inline-grid border border-line bg-panel" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, auto))` }}>
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          disabled={o.disabled}
          onClick={() => onChange(o.v)}
          className={`${size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} font-bold uppercase tracking-[0.06em] transition-colors disabled:opacity-40 ${
            value === o.v ? 'bg-green text-on-pill' : 'text-ink-2 hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tag({ children, tone = 'outline' }: { children: React.ReactNode; tone?: 'green' | 'red' | 'outline' | 'ink' }) {
  const cls = {
    green: 'bg-green text-on-pill',
    red: 'bg-red text-on-pill',
    ink: 'bg-ink text-on-pill',
    outline: 'border border-ink text-ink',
  }[tone];
  return <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.06em] ${cls}`}>{children}</span>;
}
