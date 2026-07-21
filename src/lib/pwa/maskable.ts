/**
 * W2c §5 — upload-time maskable icon rendering (client canvas; no server work).
 *
 * A raw logo is usually a rectangle; declaring it `192x192 maskable` in the
 * manifest was a lie the audit called out (DA-16). This renders the REAL thing:
 * a square canvas filled with the gym's brand-color matte, the logo contain-fit
 * into the maskable SAFE ZONE (the outer ~20% may be cropped by the platform's
 * mask, so the logo occupies the middle 66%), exported as PNG at each size.
 *
 * Runs in the browser at logo-upload time (gym-settings) — the manifest builder
 * probes for the emitted files and only then declares maskable squares.
 */

/** Fraction of the square the logo may occupy — inside the maskable safe zone. */
const SAFE_ZONE = 0.66;

export async function renderMaskableIcon(
  bitmap: ImageBitmap,
  size: number,
  matte: string,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = matte;
  ctx.fillRect(0, 0, size, size);

  const box = size * SAFE_ZONE;
  const scale = Math.min(box / bitmap.width, box / bitmap.height);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  ctx.drawImage(bitmap, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  );
}
