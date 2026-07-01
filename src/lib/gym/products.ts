import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * NO-MEMBERSHIP — per-gym OPTIONAL products (white-label).
 *
 * `gyms.enabled_products` (000068, JSONB) flags which products a gym sells. When a
 * flag is false the product is HIDDEN/GATED (not deleted) — e.g. Proline runs
 * classes + PT only, so `membership:false` hides every membership surface + skips
 * the membership lifecycle. DEFAULT-ON semantics: a null column, a missing key, or
 * any non-`false` value reads as enabled, so every existing gym is unchanged.
 */
export type ProductKey = 'membership' | 'class' | 'pt' | 'camp'
export type EnabledProducts = Record<ProductKey, boolean>

/** Parse a `gyms.enabled_products` JSONB value; anything missing/invalid → ON. */
export function parseEnabledProducts(raw: unknown): EnabledProducts {
  const r = (raw ?? {}) as Record<string, unknown>
  const on = (k: ProductKey) => r[k] !== false // only an explicit `false` disables
  return { membership: on('membership'), class: on('class'), pt: on('pt'), camp: on('camp') }
}

/** Read a gym's enabled products (server-side). Missing gym/column → all ON. */
export async function getEnabledProducts(
  supabase: SupabaseClient,
  gymId: string | null | undefined,
): Promise<EnabledProducts> {
  if (!gymId) return parseEnabledProducts(null)
  const { data } = await supabase.from('gyms').select('enabled_products').eq('id', gymId).maybeSingle()
  return parseEnabledProducts((data as { enabled_products?: unknown } | null)?.enabled_products)
}
