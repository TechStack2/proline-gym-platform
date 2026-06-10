/**
 * Localized person-name helpers (Cycle 5 / V1 / AR — admin presentation repair).
 *
 * Names live on `profiles` (first_name_{ar,en,fr} / last_name_{ar,en,fr}); the
 * `students`/`coaches` rows have NO name columns — they join `profile_id → profiles`.
 * These render a profiles row (or a `{ profiles }` embed, which PostgREST returns
 * as an object for a to-one relation but sometimes as a single-element array).
 */
type ProfileNames = {
  first_name_ar?: string | null; first_name_en?: string | null; first_name_fr?: string | null
  last_name_ar?: string | null; last_name_en?: string | null; last_name_fr?: string | null
} | null | undefined

/** Normalize a possibly-array embedded relation to its single row. */
export function one<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

/** "First Last" in the active locale, falling back to English then the other parts. */
export function localizedName(profile: ProfileNames, locale: string): string {
  const p = one(profile)
  if (!p) return ''
  const first =
    (locale === 'ar' ? p.first_name_ar : locale === 'fr' ? p.first_name_fr : p.first_name_en) ||
    p.first_name_en || p.first_name_ar || ''
  const last =
    (locale === 'ar' ? p.last_name_ar : locale === 'fr' ? p.last_name_fr : p.last_name_en) ||
    p.last_name_en || p.last_name_ar || ''
  return [first, last].filter(Boolean).join(' ').trim()
}
