import { mulberry32 } from '../rng';

/**
 * Cash-register "ka-ching", synthesized (no samples to license) and fully deterministic, so the
 * preview and every export sound identical. Mono float32.
 */
export type KachingKind = 'in' | 'out' | 'close';

export const AUDIO_SAMPLE_RATE = 48_000;

interface Partial {
  ratio: number;
  amp: number;
  /** decay time constant (s) */
  tau: number;
}

/** Bell partials: inharmonic ratios give the metallic "ching"; pairs are detuned for shimmer. */
const BELL: Partial[] = [
  { ratio: 1, amp: 1, tau: 0.42 },
  { ratio: 1.0035, amp: 0.7, tau: 0.42 },
  { ratio: 1.51, amp: 0.55, tau: 0.3 },
  { ratio: 2.04, amp: 0.42, tau: 0.24 },
  { ratio: 2.76, amp: 0.28, tau: 0.17 },
  { ratio: 3.32, amp: 0.2, tau: 0.13 },
  { ratio: 4.18, amp: 0.12, tau: 0.09 },
];

const SPEC: Record<KachingKind, { f0: number; ka: number; bell: number; tail: number; coins: number; length: number }> = {
  in: { f0: 2640, ka: 0, bell: 0.7, tail: 0.75, coins: 0, length: 0.7 },
  out: { f0: 2350, ka: 1, bell: 1, tail: 1, coins: 3, length: 1.0 },
  close: { f0: 2350, ka: 1, bell: 1, tail: 1.5, coins: 7, length: 1.5 },
};

export function synthKaching(kind: KachingKind, sr = AUDIO_SAMPLE_RATE): Float32Array<ArrayBuffer> {
  const s = SPEC[kind];
  const n = Math.round(s.length * sr);
  const out = new Float32Array(n);
  const rnd = mulberry32(kind === 'in' ? 11 : kind === 'out' ? 23 : 37);
  const twoPi = Math.PI * 2;

  // "ka": the register drawer — a dull thump plus a short band-limited noise click
  const bellStart = s.ka ? Math.round(0.055 * sr) : 0;
  if (s.ka) {
    let lp = 0;
    for (let i = 0; i < Math.round(0.05 * sr); i++) {
      const t = i / sr;
      const env = Math.exp(-t / 0.012);
      const thump = Math.sin(twoPi * (190 - 900 * t) * t) * Math.exp(-t / 0.02) * 0.55;
      const noise = rnd() * 2 - 1;
      lp += 0.35 * (noise - lp); // one-pole low-pass keeps the click from hissing
      out[i] += (thump + lp * 0.9 * env) * s.ka;
    }
  }

  // "ching": decaying bell partials with a 2 ms attack
  for (let i = bellStart; i < n; i++) {
    const t = (i - bellStart) / sr;
    const attack = Math.min(1, t / 0.002);
    let v = 0;
    for (const p of BELL) v += p.amp * Math.exp(-t / (p.tau * s.tail)) * Math.sin(twoPi * s.f0 * p.ratio * t);
    out[i] += v * attack * 0.28 * s.bell;
  }

  // coin rattle: tiny bright ticks scattered after the bell
  for (let c = 0; c < s.coins; c++) {
    const at = bellStart + Math.round((0.09 + rnd() * 0.45) * sr);
    const f = 4200 + rnd() * 2600;
    const amp = 0.18 * (0.5 + rnd() * 0.5);
    for (let i = 0; i < Math.round(0.035 * sr) && at + i < n; i++) {
      const t = i / sr;
      // 0.6 ms attack keeps the tick bright without a broadband click
      out[at + i] += amp * Math.min(1, t / 0.0006) * Math.exp(-t / 0.006) * Math.sin(twoPi * f * t);
    }
  }

  // normalise to a safe peak and fade the very end to avoid a click
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const gain = peak > 0 ? (kind === 'in' ? 0.6 : 0.8) / peak : 0;
  const fade = Math.round(0.02 * sr);
  for (let i = 0; i < n; i++) out[i] *= gain * Math.min(1, (n - i) / fade);
  return out;
}

/** Which sound an execution gets: entries/adds "ching", partial exits "ka-ching", the final close the big one. */
export function kachingKindFor(kind: 'in' | 'out', index: number, total: number): KachingKind {
  if (kind === 'in') return 'in';
  return index === total - 1 ? 'close' : 'out';
}

/**
 * The whole soundtrack for a replay: silence with a ka-ching at every execution's frame.
 * Overlaps are summed and soft-clipped.
 */
export function buildSoundtrack(events: { kind: 'in' | 'out'; frame: number }[], frames: number, fps: number, sr = AUDIO_SAMPLE_RATE): Float32Array<ArrayBuffer> {
  const len = Math.ceil((frames / fps) * sr);
  const track = new Float32Array(len);
  const cache = new Map<KachingKind, Float32Array<ArrayBuffer>>();
  events.forEach((ev, idx) => {
    if (ev.frame >= frames) return;
    const kind = kachingKindFor(ev.kind, idx, events.length);
    let snd = cache.get(kind);
    if (!snd) {
      snd = synthKaching(kind, sr);
      cache.set(kind, snd);
    }
    const at = Math.round((ev.frame / fps) * sr);
    for (let i = 0; i < snd.length && at + i < len; i++) track[at + i] += snd[i];
  });
  for (let i = 0; i < len; i++) track[i] = Math.tanh(track[i]);
  return track;
}
