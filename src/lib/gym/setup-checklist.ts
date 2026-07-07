import type { SupabaseClient } from '@supabase/supabase-js'
import { parseEnabledProducts } from './products'

/**
 * ONBOARDING-CHECKLIST — a DERIVED first-run setup checklist. There is NO stored
 * checkbox state and NO migration: every item auto-ticks from a light gym-scoped
 * count/exists query, so it reflects reality and updates the instant staff do the
 * work. Membership & PT items are gated on `gyms.enabled_products` (a class-only
 * gym never sees a plan item), so the denominator is dynamic (6–8 items).
 *
 * Two honest caveats, surfaced in the UI copy:
 *  · `branding` has no gym-level "landing published" flag in the schema — it derives
 *    from whether staff customized brand_color / hero_image_url / tagline (000072).
 *  · exchange rates are now PER-GYM (FX-PER-GYM, 000090) — the exchange item ticks
 *    when THIS gym has a rate (RLS gym-scopes the read; the `.eq` is defense-in-depth).
 */
export type SetupItemKey =
  | 'profile' | 'branding' | 'discipline' | 'coach'
  | 'plan' | 'ptpackage' | 'exchange' | 'member'

export type SetupItem = { key: SetupItemKey; done: boolean }

export type SetupChecklist = {
  items: SetupItem[] // applicable items only (membership/PT gated), in display order
  doneCount: number
  total: number
  allDone: boolean
}

/**
 * Compute the derived checklist for one gym. Queries are count/exists with
 * `head: true` (no rows over the wire) and run in Promise.all batches of ≤3 to
 * stay pool-friendly (the leads-page lesson: never a heavy concurrent fan-out).
 */
export async function getSetupChecklist(
  supabase: SupabaseClient,
  gymId: string,
): Promise<SetupChecklist> {
  // One row → items 1 (profile) + 2 (branding) + the product gating, no extra query.
  const { data: gym } = await supabase
    .from('gyms')
    .select('phone, email, brand_color, hero_image_url, tagline_en, enabled_products')
    .eq('id', gymId)
    .maybeSingle()
  const g = (gym ?? {}) as {
    phone?: string | null; email?: string | null
    brand_color?: string | null; hero_image_url?: string | null; tagline_en?: string | null
    enabled_products?: unknown
  }
  const products = parseEnabledProducts(g.enabled_products)

  // name_* are NOT NULL at gym creation → contact-filled is the real "profile set"
  // signal. branding has no publish flag → any customized brand field counts.
  const profileDone = !!(g.phone || g.email)
  const brandingDone = !!(g.brand_color || g.hero_image_url || g.tagline_en)

  // Gym-scoped exists. The catalog *_read policies are blanket `authenticated`
  // (NOT auto gym-scoped), so `.eq('gym_id', gymId)` is REQUIRED or it counts
  // across tenants. All these tables carry a soft-delete `deleted_at`.
  const scopedExists = async (table: string): Promise<boolean> => {
    const { count } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('gym_id', gymId)
      .is('deleted_at', null)
    return (count ?? 0) > 0
  }

  // Batch 1 (3 concurrent): the always-applicable gym-scoped catalogs.
  const [discipline, coach, member] = await Promise.all([
    scopedExists('disciplines'),
    scopedExists('coaches'),
    scopedExists('students'),
  ])

  // Batch 2 (≤3 concurrent): the two product-gated catalogs (skipped when the
  // product is off) + the per-gym exchange_rates check (FX-PER-GYM: gym-scoped, no deleted_at).
  const [plan, ptpackage, exchange] = await Promise.all([
    products.membership ? scopedExists('membership_plans') : Promise.resolve(false),
    products.pt ? scopedExists('pt_packages') : Promise.resolve(false),
    supabase.from('exchange_rates').select('id', { count: 'exact', head: true }).eq('gym_id', gymId)
      .then(({ count }) => (count ?? 0) > 0),
  ])

  const all: Array<SetupItem | null> = [
    { key: 'profile', done: profileDone },
    { key: 'branding', done: brandingDone },
    { key: 'discipline', done: discipline },
    { key: 'coach', done: coach },
    products.membership ? { key: 'plan', done: plan } : null,
    products.pt ? { key: 'ptpackage', done: ptpackage } : null,
    { key: 'exchange', done: exchange },
    { key: 'member', done: member },
  ]
  const items = all.filter((x): x is SetupItem => x !== null)
  const doneCount = items.filter((i) => i.done).length
  const total = items.length
  return { items, doneCount, total, allDone: doneCount === total }
}

// ============================================================================
// J1 SETUP-HUB — the milestone layer on TOP of the item engine above.
//
// The /setup guided hub groups the same DERIVED reality into SIX owner-facing
// milestones (M1..M6). It REUSES getSetupChecklist for every catalog existence
// check + the product gating (no second copy of those queries), and adds only
// the genuinely-new signals a milestone needs: a "bookable" coach (coach has an
// availability window), an active class that actually has a schedule row, and a
// landing-visible entity. Everything stays derived — no stored setup state, no
// migration. New reads are head:true counts run in Promise.all batches of ≤3.
// ============================================================================

export type MilestoneKey = 'gym' | 'team' | 'classes' | 'offers' | 'members' | 'golive'

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
    // M6 Go live
    branded?: boolean
    landingVisible?: boolean
  }
}

export type SetupMilestones = {
  milestones: SetupMilestone[] // exactly 6, in M1..M6 display order
  doneCount: number
  total: number // always 6
  allDone: boolean
  slug: string | null // for the Go-live landing URL (?gym=<slug>)
  gymName: string | null
}

/**
 * Compute the 6-milestone view for one gym. Reuses getSetupChecklist (its catalog
 * existence + product gating), then adds a single gyms read for the presentation
 * columns the item engine doesn't expose (name / slug / logo / localized taglines)
 * and two ≤3 batches of the milestone-only existence checks.
 */
export async function getSetupMilestones(
  supabase: SupabaseClient,
  gymId: string,
): Promise<SetupMilestones> {
  // Reuse: every catalog existence check + the membership/PT product gating.
  const checklist = await getSetupChecklist(supabase, gymId)
  const has = (k: SetupItemKey) => checklist.items.some((i) => i.key === k)
  const done = (k: SetupItemKey) => checklist.items.find((i) => i.key === k)?.done ?? false

  // Batch A (≤3): the rich gym row (M1 + M6 + slug) + two new existence signals.
  // coach_availability carries its own gym_id (000044) → scope directly.
  // class_schedules has NO gym_id (000003) → scope via classes!inner + classes.gym_id.
  const [gymRow, bookable, classWithSchedule] = await Promise.all([
    supabase
      .from('gyms')
      .select('name_ar, name_en, name_fr, slug, phone, email, logo_url, brand_color, tagline_ar, tagline_en, tagline_fr')
      .eq('id', gymId)
      .maybeSingle()
      .then(({ data }) => data),
    supabase
      .from('coach_availability')
      .select('id', { count: 'exact', head: true })
      .eq('gym_id', gymId)
      .eq('is_active', true)
      .then(({ count }) => (count ?? 0) > 0),
    supabase
      .from('class_schedules')
      .select('id, classes!inner(gym_id, is_active, deleted_at)', { count: 'exact', head: true })
      .eq('classes.gym_id', gymId)
      .eq('classes.is_active', true)
      .is('classes.deleted_at', null)
      .then(({ count }) => (count ?? 0) > 0),
  ])

  // Batch B (≤3): the two landing-visibility signals (M6) + a representative coach
  // id so M2 can deep-link the availability panel when coaches exist but aren't bookable.
  const [landingClass, landingCoach, firstCoachId] = await Promise.all([
    supabase
      .from('classes')
      .select('id', { count: 'exact', head: true })
      .eq('gym_id', gymId)
      .eq('show_on_landing', true)
      .eq('is_active', true)
      .is('deleted_at', null)
      .then(({ count }) => (count ?? 0) > 0),
    supabase
      .from('coaches')
      .select('id', { count: 'exact', head: true })
      .eq('gym_id', gymId)
      .eq('landing_visible', true)
      .eq('is_active', true)
      .is('deleted_at', null)
      .then(({ count }) => (count ?? 0) > 0),
    supabase
      .from('coaches')
      .select('id')
      .eq('gym_id', gymId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => (data?.id as string | undefined) ?? null),
  ])

  const g = (gymRow ?? {}) as {
    name_ar?: string | null; name_en?: string | null; name_fr?: string | null
    slug?: string | null; phone?: string | null; email?: string | null
    logo_url?: string | null; brand_color?: string | null
    tagline_ar?: string | null; tagline_en?: string | null; tagline_fr?: string | null
  }

  // M1 signals — mirror the item engine's "contact filled" plus a brand signal that
  // (per spec) counts logo_url OR brand_color OR any localized tagline.
  const nameSet = !!(g.name_en || g.name_ar || g.name_fr)
  const contactSet = !!(g.phone || g.email)
  const branded = !!(g.logo_url || g.brand_color || g.tagline_en || g.tagline_ar || g.tagline_fr)

  const hasCoaches = done('coach')
  const membershipEnabled = has('plan')
  const ptEnabled = has('ptpackage')
  const planDone = done('plan')
  const ptDone = done('ptpackage')
  const landingVisible = landingClass || landingCoach

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
    { key: 'members', done: done('member'), detail: {} },
    { key: 'golive', done: branded && landingVisible, detail: { branded, landingVisible } },
  ]

  const doneCount = milestones.filter((m) => m.done).length
  return {
    milestones,
    doneCount,
    total: milestones.length,
    allDone: doneCount === milestones.length,
    slug: g.slug ?? null,
    gymName: g.name_en || g.name_ar || g.name_fr || null,
  }
}
