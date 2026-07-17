// MONEY-LBP — resolve a gym's display currency preference for the money dashboards.
// The tally/revenue/outstanding surfaces never fetched it (only invoice-detail +
// receipt did), so a cash-LBP gym's aggregations rendered USD-only. One tiny read,
// normalized through the existing helper. Server-only (takes the request client).
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeCurrencyPref, type CurrencyPref } from './currency'

export async function gymCurrencyPref(
  supabase: SupabaseClient,
  gymId: string | null | undefined,
): Promise<CurrencyPref> {
  if (!gymId) return 'USD'
  const { data } = await supabase.from('gyms').select('currency_preference').eq('id', gymId).maybeSingle()
  return normalizeCurrencyPref((data as { currency_preference?: string | null } | null)?.currency_preference)
}
