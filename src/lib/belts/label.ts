import { BELT_SORT_ORDER } from '@/lib/validators/belts.schema'

/**
 * DA-9 — a next-intl translator bound to the `beltRanks` namespace (works for both
 * the server `getTranslations('beltRanks')` and the client `useTranslations('beltRanks')`).
 */
export type BeltRankT = (key: string) => string

/**
 * DA-9 — the localized label for a belt-rank enum value. This is the ONE place belt
 * ranks become user-facing text, so the raw enum ('black_1') and English belt names
 * never leak into a non-English UI. Looks the value up in the `beltRanks` i18n map;
 * only title-cases as a last resort if a future enum value has no key yet.
 *
 * `empty` is what to render for a null/absent rank (default '—').
 */
export function beltRankLabel(
  rank: string | null | undefined,
  t: BeltRankT,
  empty = '—',
): string {
  if (!rank) return empty
  if (rank in BELT_SORT_ORDER) return t(rank)
  // Unknown value (schema drift) — degrade to a readable form rather than throw.
  return rank.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
