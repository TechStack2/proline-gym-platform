'use server'

/**
 * Member self-serve profile actions (MJ-3, Req1 + Req4).
 *  · updateContactFields — DIRECT save of the low-risk, member-owned fields
 *    (contact_email, preferred locale). The narrowed profiles self-update
 *    (000095) permits exactly these; the safety/identity fields do not.
 *  · requestProfileChange — a guided CHANGE REQUEST for the safety/billing fields
 *    (emergency contact, medical notes, date of birth, phone) that staff must see
 *    change. Routes through request_profile_change → the /inbox queue. Phone is
 *    normalized to canonical +E164 here (Req4); the SQL apply re-normalizes, and
 *    for a credentialed member an approved phone change updates the profile phone
 *    only — synthetic-email auth is untouched.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { actionError } from '@/lib/errors/action-error'
import { normalizePhone } from '@/lib/utils/phone'

type Result = { ok: true } | { ok: false; error: string }

const LOCALES = ['ar', 'en', 'fr'] as const

export async function updateContactFields(input: {
  contactEmail?: string | null
  locale?: string
}): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const patch: Record<string, unknown> = {}
  if (input.contactEmail !== undefined) patch.contact_email = input.contactEmail?.trim() || null
  if (input.locale && (LOCALES as readonly string[]).includes(input.locale)) patch.locale = input.locale
  if (Object.keys(patch).length === 0) return { ok: true }

  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id)
  if (error) return { ok: false, error: actionError(error) }
  revalidatePath('/portal/profile')
  return { ok: true }
}

export type ProfileChangePayload = {
  profiles?: {
    date_of_birth?: string
    gender?: string
    phone?: string
    contact_email?: string
    locale?: string
  }
  students?: {
    emergency_contact_name?: string
    emergency_contact_phone?: string
    medical_notes?: string
  }
}

export async function requestProfileChange(input: {
  studentId: string
  payload: ProfileChangePayload
  note?: string
}): Promise<Result> {
  const supabase = await createClient()

  // Normalize phones to the canonical stored form before they reach staff (Req4).
  const payload: ProfileChangePayload = {
    ...input.payload,
    profiles: input.payload.profiles ? { ...input.payload.profiles } : undefined,
    students: input.payload.students ? { ...input.payload.students } : undefined,
  }
  if (payload.profiles?.phone) payload.profiles.phone = normalizePhone(payload.profiles.phone)
  if (payload.students?.emergency_contact_phone) {
    payload.students.emergency_contact_phone = normalizePhone(payload.students.emergency_contact_phone)
  }

  const { error } = await supabase.rpc('request_profile_change', {
    p_student_id: input.studentId,
    p_payload: payload,
    p_note: input.note ?? null,
  })
  if (error) return { ok: false, error: actionError(error) }
  revalidatePath('/portal/profile')
  return { ok: true }
}
