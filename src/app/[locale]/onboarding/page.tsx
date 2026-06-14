import { redirect } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { OnboardingClient } from './onboarding-client'
import { roleHomePath } from './role-home'
import { getWaiverContext } from '@/lib/waivers/server'
import { waiverTitle, waiverBody } from '@/lib/waivers/status'

export const dynamic = 'force-dynamic'

/**
 * ON-1 first-login onboarding (spike §6). Reached only by the middleware
 * forced-change gate (must_change_password) — or directly by an authed user.
 * Guards: unauthenticated → login; an already-onboarded user (flag cleared) →
 * their role home (no reason to be here).
 */
export default async function OnboardingPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/auth/login`)

  const { data: roleRow } = await supabase
    .from('user_roles').select('role').eq('user_id', user.id).limit(1).maybeSingle()
  const role = roleRow?.role ?? 'student'

  // Already onboarded (flag cleared) → no reason to sit here.
  if (!(user.app_metadata as { must_change_password?: boolean } | null)?.must_change_password) {
    redirect(`/${locale}${roleHomePath(role)}`)
  }

  const { data: profile } = await supabase
    .from('profiles').select('gym_id, avatar_url, first_name_ar, first_name_en, first_name_fr').eq('id', user.id).maybeSingle()
  const firstName = (locale === 'ar' ? profile?.first_name_ar : locale === 'fr' ? profile?.first_name_fr : profile?.first_name_en)
    || profile?.first_name_en || ''

  // F3: a waiver step for a member who has their OWN student record and an
  // active, not-yet-signed waiver (additive — never blocks finishing onboarding).
  let waiverStep: { studentId: string; title: string; body: string } | null = null
  if (profile?.gym_id) {
    const { data: ownStudent } = await supabase
      .from('students').select('id').eq('profile_id', user.id).maybeSingle()
    if (ownStudent) {
      const wv = await getWaiverContext(supabase, ownStudent.id, profile.gym_id)
      if (wv.template && (wv.state === 'unsigned' || wv.state === 'outdated')) {
        waiverStep = { studentId: ownStudent.id, title: waiverTitle(wv.template, locale), body: waiverBody(wv.template, locale) }
      }
    }
  }

  return (
    <OnboardingClient
      locale={locale}
      role={role}
      userId={user.id}
      gymId={profile?.gym_id ?? ''}
      firstName={firstName}
      avatarUrl={profile?.avatar_url ?? null}
      waiver={waiverStep}
    />
  )
}
