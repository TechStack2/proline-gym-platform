'use client'

/**
 * J6 — FORGOT PASSWORD (request). A platform-wide gap that ships with the go-live
 * slice: the login page now links here. Submitting an email calls
 * `supabase.auth.resetPasswordForEmail` with a `redirectTo` back to /auth/reset
 * (the update-password surface added in the same slice). The confirmation copy is
 * GENERIC regardless of whether the email maps to an account (no enumeration
 * oracle) — GoTrue itself only sends when the account exists. INVITE-HOST: the
 * reset link must land back on the SAME host the user is on (a tenant's custom
 * domain resolves to itself), so the redirect origin prefers the live request
 * origin; NEXT_PUBLIC_APP_URL is only a build-time fallback (a single env URL would
 * misroute every custom-domain tenant to one host).
 */
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { withAuthTimeout, isTransportError } from '@/lib/auth/transport'
import { useAuthGymBrand } from '@/hooks/use-auth-gym-brand'
import { AuthLocaleSwitcher } from '@/components/shared/auth-locale-switcher'
import { cn } from '@/lib/utils'
import { Mail, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react'

type Props = { params: { locale: string } }

export default function ForgotPasswordPage({ params: { locale } }: Props) {
  const t = useTranslations('auth')
  const supabase = createClient()
  const isRTL = locale === 'ar'
  // DA-42: the same host-resolved gym identity login carries (this page dropped it).
  const brand = useAuthGymBrand(locale)
  const brandName = brand.name || 'PRO LINE Gym'

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || loading) return
    setLoading(true)
    setError('')
    const origin =
      (typeof window !== 'undefined' ? window.location.origin : '') ||
      process.env.NEXT_PUBLIC_APP_URL || ''
    try {
      const { error: rErr } = await withAuthTimeout(
        supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${origin}/${locale}/auth/reset`,
        }),
      )
      // AUTH-STUCK: a TRANSPORT failure means the request never reached the
      // server — claiming "sent" would be false. It carries no account signal
      // (fails identically for any input), so surfacing it keeps the
      // no-enumeration posture. Every SERVER answer stays the generic "sent".
      //
      // AUTH-ERRORS — this door is DELIBERATELY excluded from the four-state
      // treatment, and the reason is worth writing down: on this endpoint a
      // server-side failure IS existence-correlated. GoTrue answers 200 without
      // sending anything for an address it does not know, so an SMTP outage or an
      // `over_email_send_rate_limit` can only be provoked by an address that DOES
      // exist. Surfacing "something went wrong on our side" here would therefore
      // build exactly the enumeration oracle J6 forbids — the distinction that is
      // free at the sign-in door is not free at this one. Transport stays
      // surfaced because it fails before any server answer, identically for every
      // input. Diagnosability is bought server-side instead (the GoTrue logs), not
      // by telling the visitor.
      if (rErr && isTransportError(rErr)) { setError(t('errConnection')); return }
      setSent(true)
    } catch (err) {
      if (isTransportError(err)) { setError(t('errConnection')); return }
      /* server answered oddly — the confirmation stays generic (no enumeration) */
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <Link
          href={`/${locale}/auth/login`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700"
        >
          <ArrowLeft className={cn('h-4 w-4', isRTL && 'rotate-180')} />
          {t('backToLogin')}
        </Link>

        {/* DA-42: sm+ card frame + the gym brand region this page dropped (login
            carries both) — the key icon gave way to the gym identity. */}
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
          <p data-testid="forgot-brand-name" className={cn('text-sm font-semibold text-gray-700', isRTL && 'font-arabic')}>{brandName}</p>
          <h1 className={cn('mt-2 text-2xl font-bold text-gray-900', isRTL && 'font-arabic')}>{t('forgotTitle')}</h1>
          <p className={cn('mt-1 text-sm text-gray-500', isRTL && 'font-arabic')}>{t('forgotSubtitle')}</p>
        </div>

        {sent ? (
          <div
            data-testid="forgot-success"
            className="rounded-2xl tint-success p-4 text-center"
          >
            <CheckCircle2 className="mx-auto h-8 w-8 text-success-600" />
            <p className={cn('mt-2 text-sm font-medium', isRTL && 'font-arabic')}>{t('forgotSent')}</p>
            <Link
              href={`/${locale}/auth/login`}
              data-testid="forgot-back-login"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:underline"
            >
              {t('backToLogin')}
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label
                htmlFor="forgot-email"
                className={cn('mb-1.5 block text-sm font-medium text-gray-700', isRTL && 'text-right font-arabic')}
              >
                {t('emailLabel') || 'Email'}
              </label>
              <div className="relative">
                <Mail
                  className={cn('absolute top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400', isRTL ? 'right-3' : 'left-3')}
                />
                <input
                  id="forgot-email"
                  data-testid="forgot-email"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  disabled={loading}
                  className={cn(
                    'w-full rounded-xl border border-gray-200 bg-white py-3 text-base text-gray-900 placeholder:text-gray-400',
                    'focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    isRTL ? 'pr-12 pl-4 text-right' : 'pl-12 pr-4',
                  )}
                  dir="ltr"
                />
              </div>
            </div>

            {error && (
              <div data-testid="forgot-error" className="rounded-xl tint-danger p-3 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              data-testid="forgot-submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 py-3.5 text-base font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-700 hover:scale-[1.01] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : t('forgotSubmit')}
            </button>
          </form>
        )}
        </div>

        {/* DA-42: the language switcher login has (this page dropped it). */}
        <AuthLocaleSwitcher locale={locale} />
      </div>
    </div>
  )
}
