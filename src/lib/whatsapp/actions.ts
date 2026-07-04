'use server'

/**
 * G1 renewal-reminder producer — the app-layer "renewal nudge" that pairs the
 * ALWAYS-fires in-app notification (F2) with the ADDITIVE WhatsApp auto-dispatch
 * (only when the gym is active). Best-effort: a WhatsApp failure never affects
 * the notification or this action's success. Staff-gated, gym-scoped.
 */
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications/create'
import { dispatchWhatsApp } from '@/lib/whatsapp/dispatch'
import { gymDisplayName } from '@/lib/whatsapp/identity'

const STAFF = ['owner', 'head_coach', 'receptionist']

export async function sendRenewalReminder(
  membershipId: string,
): Promise<{ ok: true; notified: boolean; dispatched: boolean; status?: 'sent' | 'failed' } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const { data: role } = await supabase
    .from('user_roles').select('role, gym_id').eq('user_id', user.id).limit(1).maybeSingle()
  if (!role || !STAFF.includes(role.role)) return { ok: false, error: 'forbidden' }

  // Resolve membership → student → profile under the caller's RLS (gym-scoped).
  const { data: m } = await supabase
    .from('student_memberships')
    .select('id, students!inner(gym_id, profile_id, profiles:profile_id(first_name_ar, first_name_en, first_name_fr, phone, locale))')
    .eq('id', membershipId).maybeSingle()
  if (!m) return { ok: false, error: 'not_found' }
  const st: any = Array.isArray((m as any).students) ? (m as any).students[0] : (m as any).students
  const prof: any = st?.profiles ? (Array.isArray(st.profiles) ? st.profiles[0] : st.profiles) : null
  const gymId = st?.gym_id as string | undefined
  const profileId = st?.profile_id as string | undefined
  if (!gymId || !profileId) return { ok: false, error: 'not_found' }
  if (gymId !== role.gym_id) return { ok: false, error: 'cross_gym' }

  const memberLocale = (prof?.locale ?? 'ar') as 'ar' | 'en' | 'fr'
  const name = (memberLocale === 'ar' ? prof?.first_name_ar : memberLocale === 'fr' ? prof?.first_name_fr : prof?.first_name_en)
    || prof?.first_name_en || ''

  // ALWAYS: the in-app notification (WhatsApp is additive, never a replacement).
  let notified = false
  try {
    await createNotification({
      recipientProfileId: profileId, gymId, type: 'renewal_due',
      titleKey: 'messages.renewal_due.title', bodyKey: 'messages.renewal_due.body',
      params: { amount: '', date: '' }, entityType: 'membership', entityId: membershipId,
      actionUrl: '/portal/billing',
    }, supabase)
    notified = true
  } catch { /* a login-less member may not receive — never abort */ }

  // ADDITIVE: WhatsApp auto-dispatch when the gym is active (best-effort).
  // WL-TEMPLATES: greet with THIS gym's localized name, not a hardcoded "PRO LINE".
  const { data: gymRow } = await supabase.from('gyms').select('name_ar, name_en, name_fr').eq('id', gymId).maybeSingle()
  const tw = await getTranslations({ locale: memberLocale, namespace: 'whatsapp' })
  const body = tw('tmpl.renewal', { name, gym: gymDisplayName(gymRow, memberLocale) })
  const d = await dispatchWhatsApp(gymId, prof?.phone, 'renewal_due', body)

  return { ok: true, notified, dispatched: d.dispatched, status: d.status }
}
