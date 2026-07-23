/**
 * MONEY-MOBILE R3 — invoice numbers never wrap.
 *
 * Invoice numbers are `INV-<GYM_SLUG>-<year>-<5-digit seq>` (000005), so a gym with a
 * long slug produces a long id that wrapped to two lines in the narrow money card at
 * 390px. Middle-truncate for DISPLAY only — the caller keeps the full id in
 * `title`/`aria-label`, and every data attribute (e.g. `data-invoice-number`) and the
 * invoice detail page stay the untouched full value.
 *
 * Segment-aware because the meaningful ends are the "INV" prefix and the trailing
 * sequence: `INV-PROLINEGYM-2026-00009` → `INV-…-00009`. Short ids that already fit are
 * returned verbatim (so normal-length numbers are never altered).
 */
export function middleTruncateId(id: string | null | undefined, opts?: { max?: number }): string {
  const max = opts?.max ?? 16
  if (!id || id.length <= max) return id ?? ''
  const parts = id.split('-')
  // The canonical shape has ≥3 hyphen segments — elide the middle, keep first + last.
  if (parts.length >= 3) return `${parts[0]}-…-${parts[parts.length - 1]}`
  // Fallback for any non-canonical id: symmetric char-based middle truncation.
  const keep = Math.max(3, Math.floor((max - 1) / 2))
  return `${id.slice(0, keep)}…${id.slice(-keep)}`
}
