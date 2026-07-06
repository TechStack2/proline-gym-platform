/**
 * AVATAR-PATHS — resolve a stored storage VALUE to a public URL at READ time.
 *
 * The write sites (avatar upload, gym logo, coach-photo publish) now persist the
 * RELATIVE object path (`<gym>/<file>.jpg`) for images in PUBLIC buckets, so the
 * data is portable across Supabase projects — no `https://<ref>.supabase.co` host
 * is baked into the DB. This turns such a stored value into a renderable URL:
 *
 *   · legacy ABSOLUTE url ('http…')  → returned unchanged (transition shim for
 *     rows written before this change / not yet normalized; the auditor's one-time
 *     backfill SQL strips those hosts after merge)
 *   · app-local asset ('/logo.jpg')  → returned unchanged (a committed public
 *     asset, not a bucket object — e.g. the default logo / manifest icon)
 *   · empty / nullish                → '' (falsy, so callers keep `|| fallback`)
 *   · otherwise a relative path      → `${SUPABASE_URL}/storage/v1/object/public/<bucket>/<value>`
 *
 * Pure string concat — no Supabase client instantiation — so it is safe in BOTH
 * server and client components (NEXT_PUBLIC_SUPABASE_URL is inlined at build).
 *
 * Cache-busting: same-path overwrites (avatar/logo replace the object in place)
 * are served stale by the CDN until its TTL. Pass `v` — a row timestamp such as
 * `updated_at` — to append a read-time `?v=` buster. NEVER store `v` in the DB;
 * it is derived at read time only, wherever a timestamp is cheaply at hand.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

export function storagePublicUrl(
  bucket: string,
  value?: string | null,
  v?: string | number | null,
): string {
  if (!value) return '';
  // Legacy absolute URL or an app-local public asset → render as-is.
  if (value.startsWith('http') || value.startsWith('/')) return value;
  const url = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${value}`;
  return v != null && v !== '' ? `${url}?v=${encodeURIComponent(String(v))}` : url;
}
