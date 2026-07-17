'use client'

/**
 * ON-1 "Invite to portal/app" (external credential share, spike §3). Staff-only
 * surface on Member-360 + the coach record. On success it shows the temp
 * password ONCE (copy) + a wa.me deep-link prefilled with the localized login
 * message (login + temp + change-on-first-login) — the G1-bridge pattern (no
 * API; G1 automates it later). The temp password is never persisted.
 *
 * STAFF-INVITE: the result card + wa-link builder are exported for reuse by the
 * team "Invite staff" surface (invite-staff-button.tsx) — one source for the
 * credential-share markup/testids. A `phone` prop enables the PHONE-REQUIRED UX:
 * when the target has no phone, the invite affordance becomes an inline "add a
 * phone to invite" prompt (link to edit) instead of failing no_phone post-click.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useErrorText } from '@/lib/errors/use-error-text'
import { cn } from '@/lib/utils'
import { Send, Copy, Check, MessageCircle, KeyRound, Phone } from 'lucide-react'
import { inviteToPortal } from '@/lib/provisioning/invite'

export type InviteResult = { tempPassword: string; login: string; waPhone: string; gymName: { ar: string; en: string; fr: string }; origin?: string }

/** Localized wa.me deep-link: login URL + phone login + temp password. */
export function buildWaLink(
  t: ReturnType<typeof useTranslations<'invite'>>, locale: string, result: InviteResult,
): string {
  // INVITE-HOST: the login URL is built on the GYM's canonical origin (primary
  // custom domain → <slug>.praxella.com → SITE_URL), resolved server-side by
  // inviteToPortal — so the member's link lands on their gym's own home regardless
  // of which host the staffer generated it from. Fallback keeps the old behavior
  // only if a caller ever omits origin.
  const appOrigin = result.origin || process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')
  const loginUrl = `${appOrigin}/${locale}/auth/login`
  // WL-IDENTITY: greet with the caller's gym name (localized), not "PRO LINE".
  const gym = locale === 'ar' ? result.gymName.ar : locale === 'fr' ? result.gymName.fr : result.gymName.en
  // INVITE-PHONE-UX: the member logs in with their PHONE — share that, not the
  // hidden synthetic email (result.login stays internal-only).
  const msg = t('waMessage', { gym, url: loginUrl, login: result.waPhone, temp: result.tempPassword })
  const digits = result.waPhone.replace(/\D/g, '') // the member's real phone
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
}

/** The share-once credential card (temp password + wa.me) — testids are the ON-1 contract. */
export function InviteResultCard({ result, locale }: { result: InviteResult; locale: string }) {
  const t = useTranslations('invite')
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(result.tempPassword); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* noop */ }
  }
  const waLink = buildWaLink(t, locale, result)
  return (
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
        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-[#1ebe5b]">
        <MessageCircle className="h-4 w-4" /> {t('shareWhatsapp')}
      </a>
    </div>
  )
}

type Props =
  | { kind: 'student'; id: string; name: string; locale: string; phone?: string | null; editHref?: string }
  | { kind: 'coach'; id: string; name: string; locale: string; phone?: string | null; editHref?: string }
  // MJ-1: invite a GUARDIAN — `id` is their profile id; role 'parent' (INVITABLE_ROLES).
  | { kind: 'parent'; id: string; name: string; locale: string; phone?: string | null; editHref?: string }

// ERROR-COPY: invite.err owns the invite-specific keys (authz/target); any other key
// (the stable keys from actionError) falls back to friendly, shared errors.* copy.
export const INVITE_ERR_KEYS = new Set(['forbidden', 'target_not_found', 'cross_gym', 'no_phone', 'unauthenticated'])

export function InviteButton({ kind, id, locale, phone, editHref }: Props) {
  const t = useTranslations('invite')
  const errText = useErrorText()
  const isRTL = locale === 'ar'
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<InviteResult | null>(null)
  const [error, setError] = useState('')

  const invite = async () => {
    setBusy(true); setError('')
    const res = await inviteToPortal(
      kind === 'student' ? { studentId: id }
        : kind === 'coach' ? { coachId: id }
          : { profileId: id, role: 'parent' },
    )
    setBusy(false)
    if (res.ok) setResult({ tempPassword: res.tempPassword, login: res.login, waPhone: res.waPhone, gymName: res.gymName, origin: res.origin })
    // MJ-1: the credential invariant carries WHO holds the phone → interpolate the name.
    else if (res.error === 'phone_taken') setError(t('err.phone_taken', { name: res.holder || t('someoneElse') }))
    else setError(INVITE_ERR_KEYS.has(res.error) ? t(`err.${res.error}` as Parameters<typeof t>[0]) : errText(res.error))
  }

  // STAFF-INVITE (phone-required UX): a caller that KNOWS the target has no phone
  // (phone passed as '' / null) gets the inline prompt up front — no dead-end click.
  if (phone !== undefined && !(phone ?? '').trim()) {
    return (
      <span data-testid="invite-needs-phone"
        className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
        <Phone className="h-4 w-4" /> {t('needsPhone')}
        {editHref && (
          <Link href={editHref} data-testid="invite-add-phone" className="font-semibold underline hover:text-amber-900">
            {t('addPhone')}
          </Link>
        )}
      </span>
    )
  }

  return (
    <div className={cn('inline-block', isRTL && 'text-right')}>
      {!result ? (
        <button type="button" data-testid="invite-btn" onClick={invite} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <Send className="h-4 w-4 text-primary-600" /> {busy ? t('inviting') : t('invite')}
        </button>
      ) : (
        <InviteResultCard result={result} locale={locale} />
      )}
      {error && <p className="mt-1 text-xs text-red-600" data-testid="invite-error">{error}</p>}
    </div>
  )
}
