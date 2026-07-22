import { BELT_SORT_ORDER } from '@/lib/belts/ranks'

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

/**
 * W3a/DA-43 — the belt's own colour swatch (§2.3: "belts: label via enumLabel +
 * the belt's OWN colour swatch — never a StatusChip"). Static full class strings
 * so the Tailwind JIT sees them; hues come from the `belt` palette in
 * tailwind.config.ts (the token file). Two-tone ranks the palette doesn't carry
 * map to their nearest anchor; white gets a hairline so it exists on white cards.
 */
const BELT_SWATCH_CLASS: Record<string, string> = {
  white: 'bg-belt-white border border-gray-300',
  white_yellow: 'bg-belt-white_yellow',
  yellow: 'bg-belt-yellow',
  yellow_orange: 'bg-belt-yellow_orange',
  orange: 'bg-belt-orange',
  orange_green: 'bg-belt-orange_green',
  green: 'bg-belt-green',
  green_blue: 'bg-belt-green_blue',
  blue: 'bg-belt-blue',
  blue_purple: 'bg-belt-purple',
  purple: 'bg-belt-purple',
  purple_brown: 'bg-belt-brown',
  brown: 'bg-belt-brown',
  brown_black: 'bg-belt-brown_black',
  red: 'bg-belt-red',
  black_1: 'bg-belt-black_1',
  black_2: 'bg-belt-black_2',
  black_3: 'bg-belt-black_3',
  black_4: 'bg-belt-black_4',
  black_5: 'bg-belt-black_5',
}

export function beltSwatchClass(rank: string | null | undefined): string {
  return (rank && BELT_SWATCH_CLASS[rank]) || 'bg-gray-300'
}
