import { OfflineDesk } from './offline-desk'
import { createClient } from '@/lib/supabase/server'
import { getEnabledProducts } from '@/lib/gym/products'

// Dynamic so the per-request CSP nonce reaches the page → it hydrates in prod
// (OFF-1 lesson) and the client reads the Dexie mirror. The (dashboard) layout
// auth-gates it; the SW serves THIS page's cached HTML offline (OFF-1), where the
// client OfflineDesk then renders entirely from the cache.
export const dynamic = 'force-dynamic'

export default async function DeskPage({ params: { locale } }: { params: { locale: string } }) {
  // NO-MEMBERSHIP-GAPS: the scanned-member membership badge is gated per gym.
  // Resolved server-side; offline the SW serves the last-cached render (same value).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: me } = user
    ? await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
    : { data: null }
  const products = await getEnabledProducts(supabase, me?.gym_id)
  return <OfflineDesk locale={locale} showMembership={products.membership} />
}
