import { z } from 'zod';
// W3b: the rank CONSTANTS live in the zod-free @/lib/belts/ranks (display code
// imports them without dragging zod into client bundles — the prod CSP has no
// 'unsafe-eval' and zod v4 compiles validators via `new Function`). Re-exported
// here so existing schema importers keep their surface.
import { BELT_RANK_VALUES, BELT_SORT_ORDER } from '@/lib/belts/ranks';

export { BELT_RANK_VALUES, BELT_SORT_ORDER };

export const beltRankEnum = z.enum(BELT_RANK_VALUES);
export type BeltRank = z.infer<typeof beltRankEnum>;

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
