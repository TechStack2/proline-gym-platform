'use client'

/**
 * J6 — RESET PASSWORD (update). The surface the /auth/forgot email links back to.
 * The recovery link carries a one-time token that `@supabase/ssr`'s browser client
 * consumes on load (detectSessionInUrl), establishing a short-lived recovery
 * session; we then set the new password with `supabase.auth.updateUser`. Same
 * 10-character minimum + confirm-match rule as the onboarding change-password step.
 * Minimal by design — the only update-password surface the platform needs.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { withAuthTimeout, isTransportError } from '@/lib/auth/transport'
import { classifyPasswordUpdateFailure } from '@/lib/auth/auth-error'
import { useAuthGymBrand } from '@/hooks/use-auth-gym-brand'
import { AuthLocaleSwitcher } from '@/components/shared/auth-locale-switcher'
import { cn } from '@/lib/utils'
import { PasswordStrengthHint } from '@/components/shared/password-strength'
import { isPasswordValid, PASSWORD_MIN_LENGTH } from '@/lib/utils/password'
import { Lock, Eye, EyeOff, CheckCircle2, Loader2 } from 'lucide-react'

type Props = { params: { locale: string } }

export default function ResetPasswordPage({ params: { locale } }: Props) {
  const t = useTranslations('auth')
  const supabase = createClient()
  const isRTL = locale === 'ar'
  // DA-42: the same host-resolved gym identity login carries.
  const brand = useAuthGymBrand(locale)
  const brandName = brand.name || 'PRO LINE Gym'

  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  // The recovery link's token is parsed by the browser client on mount; surface a
  // clear state if the visitor arrived without a valid recovery session.
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setHasSession(true)
    })
    supabase.auth.getSession().then(({ data }) => {
      setHasSession((prev) => (prev === null ? !!data.session : prev))
    })
    return () => sub.subscription.unsubscribe()
  }, [supabase])

  // AUTH-DEPTH: the same shared policy as the onboarding change-password step.
  const valid = isPasswordValid(pw) && pw === pw2

  // AUTH-ERRORS: the same four-state treatment as the login door. This surface used
  // to answer EVERY non-transport failure with "the link may have expired" — so a
  // user who reused their current password (GoTrue `same_password`) was sent to
  // request reset links forever for a problem no link could fix, and a real outage
  // read as an expired link. Each state now says only what is true.
  const failureText = (e: unknown): string => {
    if (isTransportError(e)) return t('errConnection')
    switch (classifyPasswordUpdateFailure(e)) {
      case 'password_policy': return t('errPasswordPolicy')
      case 'session': return t('resetError') // the link really has expired — unchanged copy
      case 'rate_limited': return t('tooManyAttempts')
      default: return t('errServer')
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid || loading) return
    setError('')
    setLoading(true)
    // AUTH-STUCK: supabase-js returns network failures in `error` rather than
    // throwing, so this surface never hung — but a transport failure showed the
    // misleading "reset failed". Guard + timeout + the distinct connection state
    // (same treatment as the login mint site; finally always clears the spinner).
    try {
      const { error: uErr } = await withAuthTimeout(supabase.auth.updateUser({ password: pw }))
      if (uErr) {
        setError(failureText(uErr))
        return
      }
      setDone(true)
    } catch (err) {
      setError(failureText(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-sm">
        {/* DA-42: sm+ card frame + the gym brand region (parity with login/forgot). */}
        <div className="sm:rounded-2xl sm:border sm:bg-white sm:p-8 sm:shadow-elevation-1">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl shadow-lg ring-2 ring-primary-200/50">
            <Image
              src={brand.logoUrl || '/logo.jpg'}
              alt={brandName}
              width={64}
              height={64}
              className="h-full w-full object-cover"
              priority
            />
          </div>
          <p data-testid="reset-brand-name" className={cn('text-sm font-semibold text-gray-700', isRTL && 'font-arabic')}>{brandName}</p>
          <h1 className={cn('mt-2 text-2xl font-bold text-gray-900', isRTL && 'font-arabic')}>{t('resetTitle')}</h1>
          <p className={cn('mt-1 text-sm text-gray-500', isRTL && 'font-arabic')}>{t('resetSubtitle')}</p>
        </div>

        {done ? (
          <div
            data-testid="reset-success"
            className="rounded-2xl tint-success p-4 text-center"
          >
            <CheckCircle2 className="mx-auto h-8 w-8 text-success-600" />
            <p className={cn('mt-2 text-sm font-medium', isRTL && 'font-arabic')}>{t('resetDone')}</p>
            <Link
              href={`/${locale}/auth/login`}
              data-testid="reset-to-login"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:underline"
            >
              {t('backToLogin')}
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {hasSession === false && (
              <div data-testid="reset-invalid" className="rounded-xl tint-warning p-3 text-sm">
                {t('resetInvalid')}
              </div>
            )}

            <PasswordField
              id="reset-password"
              testid="reset-password"
              label={t('resetNewLabel')}
              value={pw}
              onChange={setPw}
              show={show}
              onToggleShow={() => setShow((v) => !v)}
              disabled={loading}
              isRTL={isRTL}
            />
            {pw.length > 0 && pw.length < PASSWORD_MIN_LENGTH && (
              <p className="-mt-2 text-xs text-warning-600">{t('resetTooShort')}</p>
            )}
            {/* AUTH-DEPTH: shared strength hint (non-blocking; `valid` is the gate). */}
            <PasswordStrengthHint pw={pw} className="-mt-2" />

            <PasswordField
              id="reset-password2"
              testid="reset-password2"
              label={t('resetConfirmLabel')}
              value={pw2}
              onChange={setPw2}
              show={show}
              onToggleShow={() => setShow((v) => !v)}
              disabled={loading}
              isRTL={isRTL}
            />
            {pw2.length > 0 && pw !== pw2 && (
              <p className="-mt-2 text-xs text-danger-600">{t('resetMismatch')}</p>
            )}

            {error && <div data-testid="reset-error" className="rounded-xl tint-danger p-3 text-sm">{error}</div>}

            <button
              type="submit"
              data-testid="reset-submit"
              disabled={loading || !valid}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 py-3.5 text-base font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-700 hover:scale-[1.01] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : t('resetSubmit')}
            </button>
          </form>
        )}
        </div>

        {/* DA-42: the language switcher, parity with login/forgot. */}
        <AuthLocaleSwitcher locale={locale} />
      </div>
    </div>
  )
}

/** A password input with a show/hide eye. Module-scope (no in-render component). */
function PasswordField({
  id,
  testid,
  label,
  value,
  onChange,
  show,
  onToggleShow,
  disabled,
  isRTL,
}: {
  id: string
  testid: string
  label: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggleShow: () => void
  disabled: boolean
  isRTL: boolean
}) {
  return (
    <div>
      <label htmlFor={id} className={cn('mb-1.5 block text-sm font-medium text-gray-700', isRTL && 'text-right font-arabic')}>
        {label}
      </label>
      <div className="relative">
        <Lock className={cn('absolute top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400', isRTL ? 'right-3' : 'left-3')} />
        <input
          id={id}
          data-testid={testid}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••••"
          disabled={disabled}
          className={cn(
            'w-full rounded-xl border border-gray-200 bg-white py-3 text-base text-gray-900 placeholder:text-gray-400',
            'focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100',
            'disabled:cursor-not-allowed disabled:opacity-50',
            isRTL ? 'pr-12 pl-12 text-right' : 'pl-12 pr-12',
          )}
          dir="ltr"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className={cn('absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600', isRTL ? 'left-3' : 'right-3')}
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    </div>
  )
}
