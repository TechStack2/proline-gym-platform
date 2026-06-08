import { z } from 'zod';

// ─── Belt Rank Enum Values (matching belt_rank_enum in PostgreSQL) ───
export const BELT_RANK_VALUES = [
  'white', 'white_yellow', 'yellow', 'yellow_orange',
  'orange', 'orange_green', 'green', 'green_blue',
  'blue', 'blue_purple', 'purple', 'purple_brown',
  'brown', 'brown_black', 'red',
  'black_1', 'black_2', 'black_3', 'black_4', 'black_5',
] as const;

export const beltRankEnum = z.enum(BELT_RANK_VALUES);
export type BeltRank = z.infer<typeof beltRankEnum>;

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

// ─── Belt Promotion Validation Schema ───
export const beltPromotionSchema = z.object({
  student_id: z.string().uuid({ message: 'Invalid student ID' }),
  discipline_id: z.string().uuid({ message: 'Invalid discipline ID' }),
  target_belt_rank: beltRankEnum,
  coach_id: z.string().uuid({ message: 'Invalid coach ID' }),
  promotion_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Invalid date format (YYYY-MM-DD)' }),
  notes: z.string().optional(),
});

export type BeltPromotionInput = z.infer<typeof beltPromotionSchema>;

// ─── Rank Ordering Validation ───
// Returns true if target rank is strictly higher than current rank
export function isValidBeltPromotion(currentRank: string | null | undefined, targetRank: string): boolean {
  if (!currentRank) return true; // No current rank means any promotion is valid
  const currentOrder = BELT_SORT_ORDER[currentRank];
  const targetOrder = BELT_SORT_ORDER[targetRank];
  if (currentOrder === undefined || targetOrder === undefined) return false;
  return targetOrder > currentOrder;
}
