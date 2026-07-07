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
  | 'profile' | 'branding' | 'discipline' | 'coach' | 'class'
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

  // The `class` item = an ACTIVE, non-deleted class in THIS gym that has ≥1
  // class_schedules row (a class with no schedule never appears on the timetable /
  // portal, so it doesn't count). class_schedules has NO gym_id and its `_read`
  // policy is blanket-authenticated, so the scope MUST go through classes!inner +
  // `.eq('classes.gym_id', …)` (the class_schedules-leak pattern) or it counts every
  // gym's schedules. head:true — no rows over the wire.
  const classHasSchedule = async (): Promise<boolean> => {
    const { count } = await supabase
      .from('class_schedules')
      .select('id, classes!inner(gym_id)', { count: 'exact', head: true })
      .eq('classes.gym_id', gymId)
      .eq('classes.is_active', true)
      .is('classes.deleted_at', null)
    return (count ?? 0) > 0
  }

  // Batch 1 (3 concurrent): the always-applicable gym-scoped catalogs + the class check.
  const [discipline, coach, klass] = await Promise.all([
    scopedExists('disciplines'),
    scopedExists('coaches'),
    classHasSchedule(),
  ])

  // Batch 2 (≤3 concurrent): the two product-gated catalogs (skipped when the
  // product is off) + the per-gym exchange_rates check (FX-PER-GYM: gym-scoped, no deleted_at).
  const [plan, ptpackage, exchange] = await Promise.all([
    products.membership ? scopedExists('membership_plans') : Promise.resolve(false),
    products.pt ? scopedExists('pt_packages') : Promise.resolve(false),
    supabase.from('exchange_rates').select('id', { count: 'exact', head: true }).eq('gym_id', gymId)
      .then(({ count }) => (count ?? 0) > 0),
  ])

  // Batch 3 (1): members (kept last so batches stay ≤3 after adding `class`).
  const member = await scopedExists('students')

  const all: Array<SetupItem | null> = [
    { key: 'profile', done: profileDone },
    { key: 'branding', done: brandingDone },
    { key: 'discipline', done: discipline },
    { key: 'coach', done: coach },
    { key: 'class', done: klass },
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
