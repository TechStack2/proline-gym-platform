'use server'

/**
 * GRW-1 campaigns — staff CRUD over the gym-scoped campaigns table (RLS is the
 * guardrail; no DEFINER). Create auto-generates a short URL-safe `code` from the
 * name + a random suffix (unique-per-gym constraint catches the rare clash).
 * The anon landing resolves the code inside submit_trial_inquiry.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const SOURCES = ['instagram', 'facebook', 'whatsapp', 'walk_in', 'phone', 'referral', 'website', 'other']

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 24) || 'campaign'
}

export async function createCampaign(input: {
  name: string
  source: string
}): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  if (!input.name?.trim()) return { ok: false, error: 'name_required' }
  const source = SOURCES.includes(input.source) ? input.source : 'instagram'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
  const gymId = profile?.gym_id
  if (!gymId) return { ok: false, error: 'no_gym' }

  const code = `${slugify(input.name)}-${Math.random().toString(36).slice(2, 6)}`
  const { error } = await supabase.from('campaigns').insert({
    gym_id: gymId, name: input.name.trim(), source, code, is_active: true,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/[locale]/(dashboard)/campaigns', 'page')
  return { ok: true, code }
}

export async function setCampaignActive(
  id: string, active: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('campaigns').update({ is_active: active, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/[locale]/(dashboard)/campaigns', 'page')
  return { ok: true }
}
