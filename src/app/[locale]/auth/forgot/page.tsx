'use client'

/**
 * J6 — FORGOT PASSWORD (request). A platform-wide gap that ships with the go-live
 * slice: the login page now links here. Submitting an email calls
 * `supabase.auth.resetPasswordForEmail` with a `redirectTo` back to /auth/reset
 * (the update-password surface added in the same slice). The confirmation copy is
 * GENERIC regardless of whether the email maps to an account (no enumeration
 * oracle) — GoTrue itself only sends when the account exists. The absolute
 * redirect origin prefers NEXT_PUBLIC_APP_URL (the configured public URL behind a
 * proxy) and falls back to the live request origin.
 */
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Mail, ArrowLeft, CheckCircle2, Loader2, KeyRound } from 'lucide-react'

type Props = { params: { locale: string } }

export default function ForgotPasswordPage({ params: { locale } }: Props) {
  const t = useTranslations('auth')
  const supabase = createClient()
  const isRTL = locale === 'ar'

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || loading) return
    setLoading(true)
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      (typeof window !== 'undefined' ? window.location.origin : '')
    try {
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${origin}/${locale}/auth/reset`,
      })
    } catch {
      /* swallow — the confirmation is generic either way (no enumeration) */
    }
    setSent(true)
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <Link
          href={`/${locale}/auth/login`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700"
        >
          <ArrowLeft className={cn('h-4 w-4', isRTL && 'rotate-180')} />
          {t('backToLogin')}
        </Link>

        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 ring-2 ring-primary-200/50">
            <KeyRound className="h-7 w-7 text-primary-600" />
          </div>
          <h1 className={cn('text-2xl font-bold text-gray-900', isRTL && 'font-arabic')}>{t('forgotTitle')}</h1>
          <p className={cn('mt-1 text-sm text-gray-500', isRTL && 'font-arabic')}>{t('forgotSubtitle')}</p>
        </div>

        {sent ? (
          <div
            data-testid="forgot-success"
            className="rounded-2xl border border-green-200 bg-green-50 p-4 text-center"
          >
            <CheckCircle2 className="mx-auto h-8 w-8 text-green-600" />
            <p className={cn('mt-2 text-sm font-medium text-green-800', isRTL && 'font-arabic')}>{t('forgotSent')}</p>
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
                  placeholder="owner@prolinegym.lb"
                  disabled={loading}
                  className={cn(
                    'w-full rounded-xl border border-gray-200 bg-white py-3 text-base placeholder:text-gray-400',
                    'focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    isRTL ? 'pr-12 pl-4 text-right' : 'pl-12 pr-4',
                  )}
                  dir="ltr"
                  autoFocus
                />
              </div>
            </div>

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
    </div>
  )
}
