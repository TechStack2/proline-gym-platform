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
 *  · `exchange_rates` is a GLOBAL table (no gym_id), so that one item is
 *    tenant-agnostic — it ticks as soon as any staff enters a rate.
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
  // product is off) + the GLOBAL exchange_rates check (no gym_id, no deleted_at).
  const [plan, ptpackage, exchange] = await Promise.all([
    products.membership ? scopedExists('membership_plans') : Promise.resolve(false),
    products.pt ? scopedExists('pt_packages') : Promise.resolve(false),
    supabase.from('exchange_rates').select('id', { count: 'exact', head: true })
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
