/**
 * MJ-1 FAMILY-DOOR — ONE guardian lookup for every surface that resolves a person
 * by phone (the add-member wizard's family/guardian step AND the Member-360 guardian
 * panel). It replaces the wizard's old `.ilike('%phone%')` fuzzy match: a substring
 * match found the wrong household (e.g. "70000003" matched "700000030"). Both sides
 * now go through `find_profile_by_phone` (000094), which compares `normalize_lb_phone`
 * (the SQL mirror of `toE164Digits`) on both the stored and the searched number, so
 * "+961 70 000 003", "03000003" and "70000003" all resolve to the same profile — and
 * ONLY that profile — inside the caller's gym.
 */
import { toE164Digits } from '@/lib/whatsapp/link'
import { localizedName } from '@/lib/names'
import type { SupabaseClient } from '@supabase/supabase-js'

export type GuardianMatch = { profileId: string; name: string; phone: string | null }

/** Exact, gym-scoped, phone-normalized profile lookup. Returns null for a blank or
 *  unmatched number. `supabase` is any caller-session client (browser or server). */
export async function findProfileByPhone(
  supabase: SupabaseClient,
  phone: string,
  locale: string,
): Promise<GuardianMatch | null> {
  if (!toE164Digits(phone)) return null // nothing normalizable → no lookup
  const { data } = await supabase.rpc('find_profile_by_phone', { p_phone: phone })
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return { profileId: row.id as string, name: localizedName(row, locale), phone: (row.phone as string) ?? null }
}
