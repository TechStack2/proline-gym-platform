/**
 * GRW-1 funnel — reads over leads (+ the FIN-1/23R lifecycle states) and
 * campaigns. The funnel is leads → trial-done → converted, scoped to a period
 * (this month by default). Attribution: lead.source for by-source, lead
 * .campaign_id for by-campaign. "trial-done" = a lead that reached at least
 * trial_scheduled (booked a trial); "converted" = status converted.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const TRIAL_REACHED = ['trial_scheduled', 'trial_completed', 'converted']

export type FunnelRow = { key: string; label: string; leads: number; trials: number; converted: number }
export type Funnel = {
  totalLeads: number
  trials: number
  converted: number
  conversionRate: number // 0..1
  bySource: FunnelRow[]
  byCampaign: FunnelRow[]
  since: string
}

type LeadRow = { source: string | null; status: string; campaign_id: string | null }

function tally(rows: LeadRow[], keyOf: (r: LeadRow) => string | null, labelOf: Map<string, string>): FunnelRow[] {
  const m = new Map<string, FunnelRow>()
  for (const r of rows) {
    const k = keyOf(r)
    if (!k) continue
    if (!m.has(k)) m.set(k, { key: k, label: labelOf.get(k) ?? k, leads: 0, trials: 0, converted: 0 })
    const row = m.get(k)!
    row.leads++
    if (TRIAL_REACHED.includes(r.status)) row.trials++
    if (r.status === 'converted') row.converted++
  }
  return [...m.values()].sort((a, b) => b.leads - a.leads)
}

/** Funnel for the gym since `sinceISO` (lead.created_at >= since). */
export async function getFunnel(
  supabase: SupabaseClient, gymId: string, sinceISO: string,
): Promise<Funnel> {
  const [{ data: leadsRaw }, { data: camps }] = await Promise.all([
    supabase.from('leads')
      .select('source, status, campaign_id, created_at')
      .eq('gym_id', gymId)
      .gte('created_at', sinceISO)
      .limit(5000),
    supabase.from('campaigns').select('id, name').eq('gym_id', gymId),
  ])
  const rows = (leadsRaw ?? []) as LeadRow[]
  const campName = new Map<string, string>()
  for (const c of (camps ?? []) as any[]) campName.set(c.id, c.name)

  const totalLeads = rows.length
  const trials = rows.filter((r) => TRIAL_REACHED.includes(r.status)).length
  const converted = rows.filter((r) => r.status === 'converted').length

  return {
    totalLeads,
    trials,
    converted,
    conversionRate: totalLeads > 0 ? converted / totalLeads : 0,
    bySource: tally(rows, (r) => r.source, new Map()),
    byCampaign: tally(rows, (r) => r.campaign_id, campName),
    since: sinceISO,
  }
}

/** First day of the current month, ISO — the default funnel scope. */
export function monthStartISO(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

export type CampaignStat = { leads: number; trials: number; converted: number }

/**
 * Per-campaign lifetime stats (leads → trials → conversions) for the Campaigns
 * surface — NOT period-scoped (a campaign's whole history). Keyed by campaign_id.
 */
export async function getCampaignStats(
  supabase: SupabaseClient, gymId: string,
): Promise<Map<string, CampaignStat>> {
  const { data: rows } = await supabase
    .from('leads')
    .select('campaign_id, status')
    .eq('gym_id', gymId)
    .not('campaign_id', 'is', null)
    .limit(5000)
  const m = new Map<string, CampaignStat>()
  for (const r of (rows ?? []) as any[]) {
    if (!r.campaign_id) continue
    if (!m.has(r.campaign_id)) m.set(r.campaign_id, { leads: 0, trials: 0, converted: 0 })
    const s = m.get(r.campaign_id)!
    s.leads++
    if (TRIAL_REACHED.includes(r.status)) s.trials++
    if (r.status === 'converted') s.converted++
  }
  return m
}
