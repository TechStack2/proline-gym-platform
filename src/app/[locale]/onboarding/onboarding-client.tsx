'use client'

/**
 * ON-1 onboarding wizard — reuses the UX-2 FormWizard (spike §6): set password
 * → language → avatar (optional, ADM-2 upload) → role orientation. On finish:
 * change the OWN password, save language, then completeOnboarding() clears the
 * forced-change flag + refreshes the session → role home. Arabic-first, RTL,
 * design-system. Forced flow — there is no escape (onClose is a no-op).
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { FormWizard, ChipRow } from '@/components/shared/form-wizard'
import { AvatarUpload } from '@/components/shared/avatar-upload'
import { CalendarDays, CreditCard, Dumbbell, ClipboardList } from 'lucide-react'
import { completeOnboarding } from './actions'

export function OnboardingClient({
  locale, role, userId, gymId, firstName, avatarUrl,
}: {
  locale: string; role: string; userId: string; gymId: string; firstName: string; avatarUrl: string | null
}) {
  const t = useTranslations('onboarding')
  const router = useRouter()
  const supabase = createClient()
  const isRTL = locale === 'ar'

  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [lang, setLang] = useState(locale)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const isCoach = role === 'coach' || role === 'head_coach' || role === 'external_coach'
  const isMember = role === 'student' || role === 'parent'

  const finish = async () => {
    setBusy(true)
    setError('')
    // 1. The user changes their OWN password (clears the temp credential).
    const { error: pErr } = await supabase.auth.updateUser({ password: pw })
    if (pErr) { setBusy(false); setError(pErr.message); return }
    // 2. Language preference (self-update, RLS).
    if (lang !== locale || lang) {
      await supabase.from('profiles').update({ locale: lang }).eq('id', userId)
    }
    // 3. Clear the forced-change flag + accept the invite + refresh JWT.
    const res = await completeOnboarding()
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    router.push(`/${lang}${res.home}`)
    router.refresh()
  }

  const orientation = isCoach
    ? [{ icon: CalendarDays, key: 'coachToday' }, { icon: ClipboardList, key: 'coachAttendance' }, { icon: Dumbbell, key: 'coachPt' }]
    : isMember
      ? [{ icon: CalendarDays, key: 'memberSchedule' }, { icon: Dumbbell, key: 'memberPt' }, { icon: CreditCard, key: 'memberBilling' }]
      : [{ icon: CalendarDays, key: 'staffToday' }, { icon: ClipboardList, key: 'staffInbox' }, { icon: CreditCard, key: 'staffMoney' }]

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  )

  const steps = [
    {
      key: 'password',
      title: t('stepPassword'),
      valid: pw.length >= 8 && pw === pw2,
      content: (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">{t('passwordHint')}</p>
          <F label={t('newPassword')}>
            <Input type="password" data-testid="ob-password" value={pw} onChange={(e) => setPw(e.target.value)} dir="ltr" autoComplete="new-password" />
          </F>
          <F label={t('confirmPassword')}>
            <Input type="password" data-testid="ob-password2" value={pw2} onChange={(e) => setPw2(e.target.value)} dir="ltr" autoComplete="new-password" />
          </F>
          {pw.length > 0 && pw.length < 8 && <p className="text-xs text-amber-600">{t('passwordTooShort')}</p>}
          {pw2.length > 0 && pw !== pw2 && <p className="text-xs text-red-600">{t('passwordMismatch')}</p>}
        </div>
      ),
    },
    {
      key: 'language',
      title: t('stepLanguage'),
      content: (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">{t('languageHint')}</p>
          <ChipRow testid="ob-lang"
            options={[{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }]}
            value={lang} onChange={(v) => setLang(v)} />
        </div>
      ),
    },
    {
      key: 'avatar',
      title: t('stepAvatar'),
      content: (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">{t('avatarHint')}</p>
          <div className="flex justify-center py-2">
            <AvatarUpload gymId={gymId} profileId={userId} name={firstName || '?'} currentUrl={avatarUrl} size="lg" locale={locale} />
          </div>
        </div>
      ),
    },
    {
      key: 'orientation',
      title: t('stepOrientation'),
      content: (
        <div className="space-y-2" data-testid="ob-orientation">
          <p className="text-sm text-gray-500">{t('orientationHint')}</p>
          {orientation.map(({ icon: Icon, key }) => (
            <div key={key} className="flex items-start gap-3 rounded-xl bg-gray-50 p-3">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
              <p className="text-sm text-gray-700">{t(`orient.${key}` as Parameters<typeof t>[0])}</p>
            </div>
          ))}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" data-testid="ob-error">{error}</p>}
        </div>
      ),
    },
  ]

  return (
    <div className={cn('flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-secondary-900 to-primary-950 p-4', isRTL && 'rtl')}>
      <div className="mb-4 text-center">
        <h1 className={cn('text-2xl font-bold text-white', isRTL && 'font-arabic')} data-testid="onboarding-welcome">
          {t('welcome', { name: firstName })}
        </h1>
        <p className="mt-1 text-sm text-white/70">{t('welcomeSub')}</p>
      </div>
      <div className="w-full max-w-lg" data-testid="onboarding">
        <FormWizard
          open
          onClose={() => { /* forced flow — no escape */ }}
          title={t('title')}
          steps={steps}
          onSubmit={finish}
          submitLabel={t('finish')}
          busy={busy}
          locale={locale}
          testid="onboarding-wizard"
        />
      </div>
    </div>
  )
}
