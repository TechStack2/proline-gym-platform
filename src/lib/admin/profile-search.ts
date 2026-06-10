/**
 * Admin name/phone search over the normalized `profiles` (Cycle 5 / V1 / AR).
 *
 * The legacy admin pages searched students/coaches by passing a TOP-LEVEL
 * PostgREST `.or()` over EMBEDDED `profiles.*` columns — which PostgREST cannot
 * filter that way (the columns aren't on the base table), so search silently
 * matched nothing. The correct pattern: run the `.or()` against profiles' OWN
 * top-level columns (gym-scoped), then filter students/coaches by
 * `profile_id IN (matched ids)`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const NO_MATCH = '00000000-0000-0000-0000-000000000000'

/**
 * Return the profile ids in `gymId` whose name (any locale) or phone matches
 * `search`. Returns a single sentinel id when nothing matches so a downstream
 * `.in('profile_id', ids)` yields an empty set rather than "no filter".
 */
export async function matchingProfileIds(
  supabase: SupabaseClient<Database>,
  gymId: string,
  search: string,
): Promise<string[]> {
  const term = `%${search.trim()}%`
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('gym_id', gymId)
    .or(
      [
        `first_name_ar.ilike.${term}`,
        `first_name_en.ilike.${term}`,
        `first_name_fr.ilike.${term}`,
        `last_name_ar.ilike.${term}`,
        `last_name_en.ilike.${term}`,
        `last_name_fr.ilike.${term}`,
        `phone.ilike.${term}`,
      ].join(','),
    )
  const ids = (data ?? []).map((p) => p.id as string)
  return ids.length ? ids : [NO_MATCH]
}
