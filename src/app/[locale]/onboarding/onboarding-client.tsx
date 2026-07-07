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
import { WaiverConsentFields } from '@/components/shared/waiver-sign'
import { signWaiver } from '@/lib/waivers/actions'
import { CalendarDays, CreditCard, Dumbbell, ClipboardList } from 'lucide-react'
import { completeOnboarding } from './actions'
import { useErrorText } from '@/lib/errors/use-error-text';

// PWD-FOCUS: these MUST be module-level (stable component types). When they lived
// inside OnboardingClient's render body, every keystroke → setPw → re-render →
// a NEW `Field`/step function reference → React saw a different component TYPE at
// the same position → it remounted the subtree (incl. the password <Input>) → the
// field lost focus after one character. Hoisting them keeps the type stable, so
// React reconciles (updates) the existing inputs and focus is preserved.
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
    {children}
  </div>
)

function PasswordStep({
  pw, pw2, setPw, setPw2,
}: {
  pw: string; pw2: string; setPw: (v: string) => void; setPw2: (v: string) => void
}) {
  const t = useTranslations('onboarding')
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">{t('passwordHint')}</p>
      <Field label={t('newPassword')}>
        <Input type="password" data-testid="ob-password" value={pw} onChange={(e) => setPw(e.target.value)} dir="ltr" autoComplete="new-password" />
      </Field>
      <Field label={t('confirmPassword')}>
        <Input type="password" data-testid="ob-password2" value={pw2} onChange={(e) => setPw2(e.target.value)} dir="ltr" autoComplete="new-password" />
      </Field>
      {pw.length > 0 && pw.length < 10 && <p className="text-xs text-amber-600">{t('passwordTooShort')}</p>}
      {pw2.length > 0 && pw !== pw2 && <p className="text-xs text-red-600">{t('passwordMismatch')}</p>}
    </div>
  )
}

export function OnboardingClient({
  locale, role, userId, gymId, firstName, avatarUrl, waiver,
}: {
  locale: string; role: string; userId: string; gymId: string; firstName: string; avatarUrl: string | null
  waiver?: { studentId: string; title: string; body: string } | null
}) {
  const t = useTranslations('onboarding')
  const errText = useErrorText()
  const router = useRouter()
  const supabase = createClient()
  const isRTL = locale === 'ar'

  const tw = useTranslations('waiver')
  const tc = useTranslations('common')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [lang, setLang] = useState(locale)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // F3: optional waiver step (only when the page passed an unsigned waiver).
  const [wvSig, setWvSig] = useState('')
  const [wvName, setWvName] = useState('')
  const [wvAgree, setWvAgree] = useState(false)

  const isCoach = role === 'coach' || role === 'head_coach' || role === 'external_coach'
  const isMember = role === 'student' || role === 'parent'

  const finish = async () => {
    setBusy(true)
    setError('')
    // 1. The user changes their OWN password (clears the temp credential).
    const { error: pErr } = await supabase.auth.updateUser({ password: pw })
    if (pErr) { console.error('[onboarding] password change failed:', pErr); setBusy(false); setError(tc('genericError')); return } // ERROR-HARDEN
    // 2. Language preference (self-update, RLS).
    if (lang !== locale || lang) {
      await supabase.from('profiles').update({ locale: lang }).eq('id', userId)
    }
    // 3. F3: if a waiver step was shown and signed, record it (best-effort —
    //    a signing hiccup must never block finishing onboarding).
    if (waiver && wvSig && wvName.trim() && wvAgree) {
      try { await signWaiver({ studentId: waiver.studentId, signature: wvSig, typedName: wvName }) } catch { /* never abort */ }
    }
    // 4. Clear the forced-change flag + accept the invite + refresh JWT.
    const res = await completeOnboarding()
    setBusy(false)
    if (!res.ok) { setError(errText(res.error)); return }
    router.push(`/${lang}${res.home}`)
    router.refresh()
  }

  const orientation = isCoach
    ? [{ icon: CalendarDays, key: 'coachToday' }, { icon: ClipboardList, key: 'coachAttendance' }, { icon: Dumbbell, key: 'coachPt' }]
    : isMember
      ? [{ icon: CalendarDays, key: 'memberSchedule' }, { icon: Dumbbell, key: 'memberPt' }, { icon: CreditCard, key: 'memberBilling' }]
      : [{ icon: CalendarDays, key: 'staffToday' }, { icon: ClipboardList, key: 'staffInbox' }, { icon: CreditCard, key: 'staffMoney' }]

  const steps = [
    {
      key: 'password',
      title: t('stepPassword'),
      // ERROR-HARDEN #4: app-side minimum 10 chars (the cloud GoTrue policy is a
      // dashboard setting the auditor aligns; this enforces it in the product).
      valid: pw.length >= 10 && pw === pw2,
      // PWD-FOCUS: render via the module-level <PasswordStep> (stable type) so the
      // password inputs are reconciled, not remounted, on each keystroke.
      content: <PasswordStep pw={pw} pw2={pw2} setPw={setPw} setPw2={setPw2} />,
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

  // F3: insert the waiver step before orientation when the member has one to
  // sign. OPTIONAL (no valid gate) — "block nothing in V1": the member may sign
  // here or later from the portal; finish() only records it if they completed it.
  if (waiver) {
    steps.splice(steps.length - 1, 0, {
      key: 'waiver',
      title: tw('signTitle'),
      content: (
        <div data-testid="ob-waiver">
          <WaiverConsentFields
            title={waiver.title} body={waiver.body} locale={locale}
            signature={wvSig} onSignature={setWvSig}
            typedName={wvName} onTypedName={setWvName}
            agreed={wvAgree} onAgreed={setWvAgree}
          />
        </div>
      ),
    })
  }

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
