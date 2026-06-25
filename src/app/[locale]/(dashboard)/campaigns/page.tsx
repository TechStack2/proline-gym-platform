import { createClient } from '@/lib/supabase/server'
import { getCampaignStats } from '@/lib/growth/funnel'
import { CampaignsClient, type CampaignRow } from './campaigns-client'

export const dynamic = 'force-dynamic'

/**
 * /campaigns (GRW-1) — staff growth surface: tracked links + QR + per-campaign
 * funnel. Reached from the Prospects header; campaigns are gym-scoped (RLS).
 */
export default async function CampaignsPage({ params: { locale } }: { params: { locale: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
  if (!profile?.gym_id) return null

  const [{ data: camps }, stats] = await Promise.all([
    supabase.from('campaigns')
      .select('id, name, code, source, is_active')
      .eq('gym_id', profile.gym_id)
      .order('created_at', { ascending: false }),
    getCampaignStats(supabase, profile.gym_id),
  ])

  const rows: CampaignRow[] = ((camps ?? []) as any[]).map((c) => {
    const s = stats.get(c.id) ?? { leads: 0, trials: 0, converted: 0 }
    return { ...c, leads: s.leads, trials: s.trials, converted: s.converted }
  })

  return (
    <div>
      <CampaignsClient rows={rows} locale={locale} />
    </div>
  )
}
