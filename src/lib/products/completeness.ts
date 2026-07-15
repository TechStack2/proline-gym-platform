/**
 * Product completeness model (COMPLETENESS slice) — the SHARED source of truth for
 * "is this product fully configured, and if not, what's missing?". Consumed by the
 * Manage index cards, the class list rows, and the class wizard's save-time
 * warn-and-allow. Warn-level ONLY — completeness never hard-blocks a save (J3).
 *
 * Per-product criteria (verified against each wizard):
 *  • class — needs ≥1 schedule slot (else it's invisible on the timetable) AND an
 *    ACTIVE coach. Fee is already hard-required (wizard step 3 + BILL-GUARDS). Both
 *    are WARN-level: a class can still be saved/live without them, so they surface
 *    as an Incomplete badge + a save-time warning, never a block.
 *  • PT package / membership plan / camp — their FormWizards HARD-REQUIRE every
 *    essential (name; price; sessions + validity; dates + capacity), so they are
 *    complete-by-construction. No warn-level gap exists → intentionally not modelled.
 */

export type ClassCompletenessGap = 'schedule' | 'coach'

/** The minimal shape needed to judge a class — a schedules array + the coach's active flag. */
export type ClassCompletenessInput = {
  schedules?: { id?: string }[] | null
  coach?: { is_active?: boolean | null } | null
}

/** The warn-level gaps a class has, in display order (schedule first). Empty ⇒ complete. */
export function classCompletenessGaps(cls: ClassCompletenessInput): ClassCompletenessGap[] {
  const gaps: ClassCompletenessGap[] = []
  if (!cls.schedules || cls.schedules.length === 0) gaps.push('schedule')
  // coach_id is NOT NULL, so a class always references a coach — the real gap is a
  // DEACTIVATED (or removed) coach, which leaves the class effectively unstaffed.
  if (!cls.coach || cls.coach.is_active === false) gaps.push('coach')
  return gaps
}

export function isClassComplete(cls: ClassCompletenessInput): boolean {
  return classCompletenessGaps(cls).length === 0
}
