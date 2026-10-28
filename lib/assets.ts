'use client';
/** Center-crop an image (upload or fetched) to a square bitmap, client-side. */
export async function cropAvatar(file: Blob, size = 384): Promise<{ bitmap: ImageBitmap; preview: string }> {
  const src = await createImageBitmap(file);
  const s = Math.min(src.width, src.height);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, size, size);
  src.close();
  const bitmap = await createImageBitmap(c);
  return { bitmap, preview: c.toDataURL('image/png') };
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** X handles: 1–15 letters, digits or underscores. */
export const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;

/**
 * X profile picture for a handle via unavatar.io (public, CORS-enabled; X's own API needs paid auth).
 * Called from the browser so rate limits are per visitor. Returns null when the handle has no picture.
 */
export async function fetchXAvatar(handle: string, signal?: AbortSignal): Promise<{ bitmap: ImageBitmap; preview: string } | null> {
  if (!X_HANDLE.test(handle)) return null;
  const res = await fetch(`https://unavatar.io/x/${encodeURIComponent(handle)}?fallback=false`, { signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`avatar ${res.status}`);
  const blob = await res.blob();
  if (!blob.type.startsWith('image/') || blob.size > 5_000_000) return null;
  return cropAvatar(blob);
}

