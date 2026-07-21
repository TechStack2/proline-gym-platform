/**
 * W2c §5 — the ONE derivation for processed PWA icon paths.
 *
 * The gym-logo uploader (client) WRITES maskable squares next to the logo at
 * these paths; the manifest builder + apple-icon metadata (server) READ them.
 * Both sides importing this module is what keeps the convention from drifting —
 * there is no DB column recording the processed set (no migration), existence
 * is probed instead.
 */

/** The sizes the uploader emits: 512/192 (manifest maskable) + 180 (apple-touch). */
export const PROCESSED_ICON_SIZES = [512, 192, 180] as const;

/**
 * Sibling path of a stored logo for a processed square, e.g.
 * `<gymId>/gym-logo.jpg` → `<gymId>/gym-icon-192.png`.
 */
export function processedIconPath(logoUrl: string, size: number): string {
  const slash = logoUrl.lastIndexOf('/');
  const dir = slash >= 0 ? logoUrl.slice(0, slash + 1) : '';
  return `${dir}gym-icon-${size}.png`;
}
