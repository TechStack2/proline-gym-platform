/**
 * W3b — the belt rank CONSTANTS, zod-free.
 *
 * These lived inside validators/belts.schema.ts, whose top-level `z.enum(...)`
 * pulls zod v4 into any importer's bundle. That was fine while only server code
 * and the belt-engine form imported it — but `belts/label` (→ the `@/lib/fmt`
 * barrel → StatusChip) put the chain into the CLIENT graph of every chip-bearing
 * page, and zod v4's `new Function` validator compilation is an `eval` under the
 * prod CSP (`script-src` has no 'unsafe-eval' — observe.spec caught it on
 * /en/today). Display code imports THIS module; the zod schema re-exports from
 * here, so there is still exactly one source of truth.
 */

// ─── Belt Rank Enum Values (matching belt_rank_enum in PostgreSQL) ───
export const BELT_RANK_VALUES = [
  'white', 'white_yellow', 'yellow', 'yellow_orange',
  'orange', 'orange_green', 'green', 'green_blue',
  'blue', 'blue_purple', 'purple', 'purple_brown',
  'brown', 'brown_black', 'red',
  'black_1', 'black_2', 'black_3', 'black_4', 'black_5',
] as const;

// ─── Belt Sort Order (for rank comparison validation) ───
export const BELT_SORT_ORDER: Record<string, number> = {
  'white': 1,
  'white_yellow': 2,
  'yellow': 3,
  'yellow_orange': 4,
  'orange': 5,
  'orange_green': 6,
  'green': 7,
  'green_blue': 8,
  'blue': 9,
  'blue_purple': 10,
  'purple': 11,
  'purple_brown': 12,
  'brown': 13,
  'brown_black': 14,
  'red': 15,
  'black_1': 16,
  'black_2': 17,
  'black_3': 18,
  'black_4': 19,
  'black_5': 20,
};
