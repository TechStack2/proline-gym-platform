'use server'

/**
 * FIN-1 win-back — the ONE new writer this slice adds: logging a followup
 * outcome. Reactivation reuses the existing ML-1 reinstate / renewal / B2
 * registration flows (no new writer); this action only records the call result
 * into member_followups (gym-scoped staff RLS is the guardrail — no DEFINER
 * bypass). G1 will later add a wa.me share row-action beside this.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Outcome = 'no_answer' | 'not_interested' | 'thinking' | 'promised_visit' | 'reactivated'
const OUTCOMES: Outcome[] = ['no_answer', 'not_interested', 'thinking', 'promised_visit', 'reactivated']

export async function logWinbackFollowup(input: {
  studentId: string
  outcome: Outcome
  note?: string
  nextActionDate?: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!OUTCOMES.includes(input.outcome)) return { ok: false, error: 'bad_outcome' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
  const gymId = profile?.gym_id
  if (!gymId) return { ok: false, error: 'no_gym' }

  const { error } = await supabase.from('member_followups').insert({
    gym_id: gymId,
    student_id: input.studentId,
    kind: 'winback',
    outcome: input.outcome,
    note: input.note?.trim() || null,
    next_action_date: input.nextActionDate || null,
    created_by: user.id,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/[locale]/(dashboard)/money', 'page')
  revalidatePath('/[locale]/(dashboard)/today', 'page')
  return { ok: true }
}
