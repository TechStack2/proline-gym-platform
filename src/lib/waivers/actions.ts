'use server'

/**
 * F3 — sign the gym's active waiver for a student. The signer is ALWAYS
 * auth.uid(); who they may sign FOR (self / linked minor / any gym member as
 * staff) is enforced by waiver_signatures_insert RLS (000057), not here. Append
 * -only: a re-sign is a new row. The artifact is a base64 PNG data-URL kept in
 * the row (the F3 storage choice). Record + surface only — nothing is blocked.
 */
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function signWaiver(input: {
  studentId: string
  signature: string
  typedName: string
}): Promise<{ ok: true; version: number } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const sig = (input.signature || '').trim()
  const typed = (input.typedName || '').trim()
  // The drawn artifact + the typed-name consent anchor are both required.
  if (!sig.startsWith('data:image/png') || sig.length < 200) return { ok: false, error: 'no_signature' }
  if (!typed) return { ok: false, error: 'no_name' }

  // Resolve the covered student's gym under the caller's RLS (own / guardian / staff).
  const { data: st } = await supabase
    .from('students').select('id, gym_id').eq('id', input.studentId).maybeSingle()
  if (!st) return { ok: false, error: 'not_found' }

  // The gym's active waiver template (read in-gym).
  const { data: tmpl } = await supabase
    .from('waiver_templates').select('id, version')
    .eq('gym_id', st.gym_id).eq('is_active', true).maybeSingle()
  if (!tmpl) return { ok: false, error: 'no_template' }

  const ua = headers().get('user-agent')
  const { error } = await supabase.from('waiver_signatures').insert({
    gym_id: st.gym_id,
    student_id: st.id,
    signed_by_profile_id: user.id,
    template_id: (tmpl as any).id,
    template_version: (tmpl as any).version,
    signature: sig,
    typed_name: typed,
    user_agent: ua,
  })
  if (error) return { ok: false, error: error.message } // RLS denial surfaces here

  return { ok: true, version: (tmpl as any).version }
}
