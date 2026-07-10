import type { SupabaseClient } from '@supabase/supabase-js'
import { parseEnabledProducts } from './products'

/**
 * ONBOARDING-CHECKLIST — a DERIVED first-run setup checklist. There is NO stored
 * checkbox state: every item auto-ticks from a light gym-scoped signal, so it
 * reflects reality and updates the instant staff do the work. Membership & PT items
 * are gated on `gyms.enabled_products` (a class-only gym never sees a plan item), so
 * the denominator is dynamic (6–8 items).
 *
 * TODAY-DERISK: the ~15 count/exists probes this used to fan out (the biggest slice
 * of the /today burst) now collapse into ONE aggregate read — `get_setup_status`
 * (000093), a self-scoped SECURITY DEFINER row of raw signals. The product gating +
 * branding derivation stay HERE (the RPC returns raw signals only), so every item /
 * milestone / dot is byte-identical to the per-query version; only the round-trips
 * change (15 → 1).
 *
 * Two honest caveats, surfaced in the UI copy:
 *  · `branding` has no gym-level "landing published" flag — it derives from whether
 *    staff customized brand_color / hero_image_url / tagline (000072).
 *  · exchange rates are PER-GYM (FX-PER-GYM, 000090); the exchange item ticks when
 *    THIS gym has a rate.
 */
export type SetupItemKey =
  | 'profile' | 'branding' | 'discipline' | 'coach' | 'class'
  | 'plan' | 'ptpackage' | 'camp' | 'exchange' | 'member'

export type SetupItem = { key: SetupItemKey; done: boolean }

export type SetupChecklist = {
  items: SetupItem[] // applicable items only (membership/PT gated), in display order
  doneCount: number
  total: number
  allDone: boolean
}

/**
 * The raw one-row signal set returned by get_setup_status(gym_id). Every field is a
 * gym-scoped presentation column or an EXISTS signal; the shaping into items /
 * milestones happens in TS (below), unchanged from the per-query engine.
 */
type SetupStatusRow = {
  name_ar: string | null; name_en: string | null; name_fr: string | null
  slug: string | null; phone: string | null; email: string | null
  logo_url: string | null; brand_color: string | null; hero_image_url: string | null
  tagline_ar: string | null; tagline_en: string | null; tagline_fr: string | null
  enabled_products: unknown
  has_discipline: boolean; has_coach: boolean; has_class_schedule: boolean
  has_membership_plan: boolean; has_pt_package: boolean; has_exchange_rate: boolean
  has_student: boolean; has_upcoming_camp: boolean; has_bookable_coach: boolean
  has_landing_class: boolean; has_landing_coach: boolean; first_coach_id: string | null
}

/** All-false / empty defaults for a missing row (unreachable in the real /today path,
 *  which always passes the caller's own gym — the page guards a null gym earlier). */
const EMPTY_STATUS: SetupStatusRow = {
  name_ar: null, name_en: null, name_fr: null, slug: null, phone: null, email: null,
  logo_url: null, brand_color: null, hero_image_url: null,
  tagline_ar: null, tagline_en: null, tagline_fr: null, enabled_products: null,
  has_discipline: false, has_coach: false, has_class_schedule: false,
  has_membership_plan: false, has_pt_package: false, has_exchange_rate: false,
  has_student: false, has_upcoming_camp: false, has_bookable_coach: false,
  has_landing_class: false, has_landing_coach: false, first_coach_id: null,
}

/** ONE round-trip: the aggregate setup signals for the caller's own gym. */
async function getSetupStatusRow(supabase: SupabaseClient, gymId: string): Promise<SetupStatusRow> {
  const { data } = await supabase.rpc('get_setup_status', { p_gym_id: gymId })
  const row = Array.isArray(data) ? data[0] : data
  return (row as SetupStatusRow) ?? EMPTY_STATUS
}

/** Shape the raw signals into the gated item list — identical order + gating to the
 *  former per-query engine (membership/PT/camp items appear only when enabled). */
function deriveChecklist(s: SetupStatusRow): SetupChecklist {
  const products = parseEnabledProducts(s.enabled_products)

  // name_* are NOT NULL at gym creation → contact-filled is the real "profile set"
  // signal. branding has no publish flag → any customized brand field counts.
  const profileDone = !!(s.phone || s.email)
  const brandingDone = !!(s.brand_color || s.hero_image_url || s.tagline_en)

  const all: Array<SetupItem | null> = [
    { key: 'profile', done: profileDone },
    { key: 'branding', done: brandingDone },
    { key: 'discipline', done: s.has_discipline },
    { key: 'coach', done: s.has_coach },
    { key: 'class', done: s.has_class_schedule },
    products.membership ? { key: 'plan', done: s.has_membership_plan } : null,
    products.pt ? { key: 'ptpackage', done: s.has_pt_package } : null,
    products.camp ? { key: 'camp', done: s.has_upcoming_camp } : null,
    { key: 'exchange', done: s.has_exchange_rate },
    { key: 'member', done: s.has_student },
  ]
  const items = all.filter((x): x is SetupItem => x !== null)
  const doneCount = items.filter((i) => i.done).length
  const total = items.length
  return { items, doneCount, total, allDone: doneCount === total }
}

/** Compute the derived checklist for one gym (kept for API stability; the milestone
 *  layer derives from the same single row without a second call). */
export async function getSetupChecklist(
  supabase: SupabaseClient,
  gymId: string,
): Promise<SetupChecklist> {
  return deriveChecklist(await getSetupStatusRow(supabase, gymId))
}

// ============================================================================
// J1 SETUP-HUB — the milestone layer on TOP of the item engine above.
//
// The /setup guided hub groups the same DERIVED reality into SIX owner-facing
// milestones (M1..M6), REUSING the SAME signals as the item list — a "bookable"
// coach, an active class with a schedule row, a landing-visible entity — all of
// which now arrive in the single get_setup_status row (no second fan-out).
// ============================================================================

export type MilestoneKey = 'gym' | 'team' | 'classes' | 'offers' | 'camps' | 'members' | 'golive'

export type SetupMilestone = {
  key: MilestoneKey
  done: boolean
  // Per-card sub-state (only the fields a given card reads are populated):
  detail: {
    // M2 Your team
    hasCoaches?: boolean
    bookable?: boolean
    firstCoachId?: string | null
    // M4 Your offers
    membershipEnabled?: boolean
    planDone?: boolean
    ptEnabled?: boolean
    ptDone?: boolean
    // M2-B Your camps (product-gated card; present only when products.camp)
    campEnabled?: boolean
    campDone?: boolean
    // M6 Go live
    branded?: boolean
    landingVisible?: boolean
  }
}

export type SetupMilestones = {
  milestones: SetupMilestone[] // 6, or 7 when camps are enabled (product-gated), in display order
  doneCount: number
  total: number // 6 (or 7 with camps)
  allDone: boolean
  slug: string | null // for the Go-live landing URL (?gym=<slug>)
  gymName: string | null
}

/**
 * Compute the 6-milestone view for one gym. TODAY-DERISK: a SINGLE get_setup_status
 * read feeds both the item list and every milestone-only signal (bookable coach,
 * class-with-schedule, landing visibility, first coach id, gym presentation columns) —
 * was ~15 count/exists probes across two helpers; now one round-trip, byte-identical.
 */
export async function getSetupMilestones(
  supabase: SupabaseClient,
  gymId: string,
): Promise<SetupMilestones> {
  const s = await getSetupStatusRow(supabase, gymId)
  const checklist = deriveChecklist(s)
  const has = (k: SetupItemKey) => checklist.items.some((i) => i.key === k)
  const done = (k: SetupItemKey) => checklist.items.find((i) => i.key === k)?.done ?? false

  // M1 signals — mirror the item engine's "contact filled" plus a brand signal that
  // (per spec) counts logo_url OR brand_color OR any localized tagline.
  const nameSet = !!(s.name_en || s.name_ar || s.name_fr)
  const contactSet = !!(s.phone || s.email)
  const branded = !!(s.logo_url || s.brand_color || s.tagline_en || s.tagline_ar || s.tagline_fr)

  const hasCoaches = done('coach')
  const bookable = s.has_bookable_coach
  const firstCoachId = s.first_coach_id ?? null
  const classWithSchedule = s.has_class_schedule
  const membershipEnabled = has('plan')
  const ptEnabled = has('ptpackage')
  const planDone = done('plan')
  const ptDone = done('ptpackage')
  const campEnabled = has('camp')
  const campDone = done('camp')
  const landingVisible = s.has_landing_class || s.has_landing_coach

  const milestones: SetupMilestone[] = [
    { key: 'gym', done: nameSet && contactSet && branded, detail: {} },
    { key: 'team', done: hasCoaches, detail: { hasCoaches, bookable, firstCoachId } },
    { key: 'classes', done: classWithSchedule, detail: {} },
    {
      key: 'offers',
      // product-gated: only the enabled products' catalogs are required.
      done: (membershipEnabled ? planDone : true) && (ptEnabled ? ptDone : true),
      detail: { membershipEnabled, planDone, ptEnabled, ptDone },
    },
    // M2-B: "Your camps" — a product-gated milestone. Present ONLY when products.camp
    // (spread → the array is 6 or 7; every consumer derives the total from length).
    ...(campEnabled ? [{ key: 'camps' as const, done: campDone, detail: { campEnabled, campDone } }] : []),
    { key: 'members', done: done('member'), detail: {} },
    { key: 'golive', done: branded && landingVisible, detail: { branded, landingVisible } },
  ]

  const doneCount = milestones.filter((m) => m.done).length
  return {
    milestones,
    doneCount,
    total: milestones.length,
    allDone: doneCount === milestones.length,
    slug: s.slug ?? null,
    gymName: s.name_en || s.name_ar || s.name_fr || null,
  }
}
