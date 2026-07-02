'use client'

/**
 * ON-1 "Invite to portal/app" (external credential share, spike §3). Staff-only
 * surface on Member-360 + the coach record. On success it shows the temp
 * password ONCE (copy) + a wa.me deep-link prefilled with the localized login
 * message (login + temp + change-on-first-login) — the G1-bridge pattern (no
 * API; G1 automates it later). The temp password is never persisted.
 */
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Send, Copy, Check, MessageCircle, KeyRound } from 'lucide-react'
import { inviteToPortal } from '@/lib/provisioning/invite'

type Props =
  | { kind: 'student'; id: string; name: string; locale: string }
  | { kind: 'coach'; id: string; name: string; locale: string }

export function InviteButton({ kind, id, name, locale }: Props) {
  const t = useTranslations('invite')
  const isRTL = locale === 'ar'
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ tempPassword: string; login: string; waPhone: string } | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const invite = async () => {
    setBusy(true); setError('')
    const res = await inviteToPortal(kind === 'student' ? { studentId: id } : { coachId: id })
    setBusy(false)
    if (res.ok) setResult({ tempPassword: res.tempPassword, login: res.login, waPhone: res.waPhone })
    else setError(t(`err.${res.error}` as Parameters<typeof t>[0]) || res.error)
  }

  const copy = async () => {
    if (!result) return
    try { await navigator.clipboard.writeText(result.tempPassword); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* noop */ }
  }

  // Localized wa.me message: login URL + login + temp + "change it on first login".
  const waLink = (() => {
    if (!result) return ''
    // INVITE-MSG-URL: include a tappable LOGIN URL. Prefer the configured app origin
    // (NEXT_PUBLIC_SITE_URL); else the actual runtime origin — never a hardcode.
    const appOrigin = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')
    const loginUrl = `${appOrigin}/${locale}/auth/login`
    // INVITE-PHONE-UX: the member logs in with their PHONE — share that, not the
    // hidden synthetic email (result.login stays internal-only).
    const msg = t('waMessage', { url: loginUrl, login: result.waPhone, temp: result.tempPassword })
    const digits = result.waPhone.replace(/\D/g, '') // the member's real phone
    return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
  })()

  return (
    <div className={cn('inline-block', isRTL && 'text-right')}>
      {!result ? (
        <button type="button" data-testid="invite-btn" onClick={invite} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <Send className="h-4 w-4 text-primary-600" /> {busy ? t('inviting') : t('invite')}
        </button>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm" data-testid="invite-result">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <KeyRound className="h-4 w-4 text-green-600" /> {t('created')}
          </p>
          <p className="mt-1 text-xs text-gray-500">{t('shareOnce')}</p>
          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-gray-50 p-3">
            <div className="min-w-0">
              <p className="text-2xs uppercase tracking-wider text-gray-400">{t('login')}</p>
              {/* INVITE-PHONE-UX: show the PHONE as the login (the synthetic email stays hidden). */}
              <p className="text-sm font-medium text-gray-800" data-testid="invite-login" dir="ltr">{result.waPhone}</p>
              <p className="mt-1 text-2xs uppercase tracking-wider text-gray-400">{t('tempPassword')}</p>
              <p className="font-mono text-sm font-bold text-gray-900" data-testid="invite-temp-pw" dir="ltr">{result.tempPassword}</p>
            </div>
            <button type="button" data-testid="invite-copy" onClick={copy}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100">
              {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? t('copied') : t('copy')}
            </button>
          </div>
          <a href={waLink} target="_blank" rel="noopener noreferrer" data-testid="invite-wa-link"
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1ebe5b]">
            <MessageCircle className="h-4 w-4" /> {t('shareWhatsapp')}
          </a>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600" data-testid="invite-error">{error}</p>}
    </div>
  )
}
