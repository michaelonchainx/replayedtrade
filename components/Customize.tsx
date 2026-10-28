'use client';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/store';
import { cropAvatar } from '@/lib/assets';
import { identiconCells } from '@/lib/render/identicon';
import type { RenderOptions } from '@/lib/types';

function Identicon({ name }: { name: string }) {
  const cells = identiconCells(name);
  return (
    <svg viewBox="-1 -1 10 10" className="h-full w-full" shapeRendering="crispEdges" aria-hidden>
      {cells.map((c, i) => (
        <rect key={i} x={i % 8} y={Math.floor(i / 8)} width={1.02} height={1.02} fill={c} />
      ))}
    </svg>
  );
}

function Toggle({ checked, onChange, label, testId }: { checked: boolean; onChange: (v: boolean) => void; label: string; testId?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 border-b border-line py-3 text-sm text-ink last:border-b-0">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        data-testid={testId}
        className={`relative h-6 w-11 shrink-0 border transition-colors ${checked ? 'border-green bg-green' : 'border-line bg-bg'}`}
      >
        <span className={`absolute top-[3px] h-4 w-4 transition-[left] ${checked ? 'left-[22px] bg-on-pill' : 'left-[3px] bg-ink-3'}`} />
      </button>
    </label>
  );
}

export default function Customize() {
  const options = useApp((s) => s.options);
  const setOptions = useApp((s) => s.setOptions);
  const avatarPreview = useApp((s) => s.avatarPreview);
  const avatarSource = useApp((s) => s.avatarSource);
  const setAvatar = useApp((s) => s.setAvatar);
  const useX = useApp((s) => s.useXAvatar);
  const setUseX = useApp((s) => s.setUseXAvatar);
  const xStatus = useApp((s) => s.xAvatarStatus);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(options.username);
  const [avatarErr, setAvatarErr] = useState<string | null>(null);

  // keep the input in sync when a share link replaces the options
  useEffect(() => setName(options.username), [options.username]);

  const set = (p: Partial<RenderOptions>) => setOptions(p);
  const onName = (v: string) => {
    const clean = v.replace(/^@+/, '').replace(/\s/g, '').slice(0, 20);
    setName(clean);
    set({ username: clean });
  };

  const onFile = async (f: File | undefined) => {
    setAvatarErr(null);
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setAvatarErr('Please pick an image file.');
      return;
    }
    try {
      const { bitmap, preview } = await cropAvatar(f);
      setAvatar(bitmap, preview, 'upload');
    } catch {
      setAvatarErr("Couldn't read that image.");
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <div className="border border-line bg-panel p-5">
        <span className="label">X handle</span>
        <div className="flex items-center gap-4">
          <div className={`relative h-16 w-16 shrink-0 border bg-bg ${avatarSource === 'x' ? 'border-green' : 'border-line'}`}>
            {avatarPreview ? <img src={avatarPreview} alt="Your avatar" className="h-full w-full object-cover" data-testid="avatar-preview" /> : <Identicon name={options.username || 'anon'} />}
            {xStatus === 'loading' && avatarSource !== 'upload' && <span className="skeleton absolute inset-0 opacity-70" aria-hidden />}
          </div>
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">@</span>
            <input
              id="username"
              className="field !pl-7 font-bold"
              value={name}
              onChange={(e) => onName(e.target.value)}
              maxLength={21}
              placeholder="replayedtrade"
              aria-label="X handle"
              aria-invalid={name.length === 0}
              autoComplete="off"
              data-testid="username"
            />
          </div>
        </div>
        <p className="mt-3 min-h-4 text-xs text-ink-3" role="status" aria-live="polite" data-testid="x-avatar-status">
          {avatarSource === 'upload'
            ? 'Using your uploaded picture.'
            : !useX
              ? 'Using the pixel avatar.'
              : xStatus === 'loading'
                ? 'Looking up your X profile picture…'
                : xStatus === 'found'
                  ? 'Profile picture loaded from X.'
                  : xStatus === 'missing'
                    ? 'No X profile picture found — using the pixel avatar.'
                    : xStatus === 'error'
                      ? "Couldn't reach X right now — using the pixel avatar."
                      : 'Type your X handle to use its profile picture.'}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <button type="button" className="btn btn-quiet !px-3 !py-2 text-xs" onClick={() => fileRef.current?.click()}>
            Upload instead
          </button>
          {avatarSource === 'upload' ? (
            <button type="button" className="text-ink-2 hover:text-green" onClick={() => setAvatar(null, null)}>
              Remove upload
            </button>
          ) : (
            <button type="button" className="text-ink-2 hover:text-green" onClick={() => setUseX(!useX)} data-testid="toggle-x-avatar">
              {useX ? 'Use pixel avatar' : 'Use X picture'}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          {avatarErr && <span className="text-red">{avatarErr}</span>}
        </div>
      </div>

      <div className="border border-line bg-panel p-5">
        <label className="label" htmlFor="footer">
          Footer line <span className="normal-case tracking-normal text-ink-3/70">(optional)</span>
        </label>
        <input id="footer" className="field" value={options.footer} maxLength={40} onChange={(e) => set({ footer: e.target.value.slice(0, 40) })} placeholder="Code REPLAYED · link in bio" />
        <p className="mt-3 text-xs text-ink-3">Shown under your handle. Max 40 characters.</p>
      </div>

      <div className="border border-line bg-panel px-5 py-2">
        <Toggle label="Show leverage" checked={options.showLeverage} onChange={(v) => set({ showLeverage: v })} />
        <Toggle label="Show position size" checked={options.showSize} onChange={(v) => set({ showSize: v })} />
        <Toggle label="% only (hide $)" checked={options.percentOnly} onChange={(v) => set({ percentOnly: v })} testId="percent-only" />
      </div>
    </div>
  );
}
