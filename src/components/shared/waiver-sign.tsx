'use client'

/**
 * F3 — waiver signing surface. `WaiverConsentFields` is the shared consent body
 * (scrollable text + signature pad + typed-name + "I have read and agree"
 * checkbox — the legal anchor, always required); `WaiverSign` is the standalone
 * button+modal docked on Member-360 / portal / the kid dashboard when a member
 * is unsigned or outdated. The same fields plug into the ON-1 onboarding wizard
 * as a step. RTL-aware, design-system. Record + surface only — blocks nothing.
 */
import { useState } from 'react'
import { ModalPortal } from './modal-portal'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useErrorText } from '@/lib/errors/use-error-text'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { X, Loader2, Check, FileSignature } from 'lucide-react'
import { SignaturePad } from './signature-pad'
import { signWaiver } from '@/lib/waivers/actions'

export function WaiverConsentFields({
  title, body, locale, signature, onSignature, typedName, onTypedName, agreed, onAgreed,
}: {
  title: string; body: string; locale: string
  signature: string; onSignature: (v: string) => void
  typedName: string; onTypedName: (v: string) => void
  agreed: boolean; onAgreed: (v: boolean) => void
}) {
  const t = useTranslations('waiver')
  const isRTL = locale === 'ar'
  return (
    <div className={cn('space-y-3', isRTL && 'text-right')}>
      <h4 className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{title}</h4>
      <div data-testid="waiver-body"
        className="max-h-40 overflow-y-auto whitespace-pre-line rounded-xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">
        {body}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">{t('signature')}</label>
        <SignaturePad onChange={onSignature} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">{t('typedName')}</label>
        <Input data-testid="waiver-typed-name" value={typedName} onChange={(e) => onTypedName(e.target.value)}
          placeholder={t('typedNamePlaceholder')} />
      </div>
      <label className="flex items-start gap-2 text-xs text-gray-700">
        <input type="checkbox" data-testid="waiver-agree" checked={agreed}
          onChange={(e) => onAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary-700" />
        <span>{t('agree')}</span>
      </label>
      <input type="hidden" data-testid="waiver-has-signature" value={signature ? '1' : '0'} readOnly />
    </div>
  )
}

export function WaiverSign({
  studentId, title, body, locale, label, outdated = false, testidPrefix = 'waiver',
}: {
  studentId: string; title: string; body: string; locale: string
  label: string; outdated?: boolean; testidPrefix?: string
}) {
  const t = useTranslations('waiver')
  const errText = useErrorText()
  const router = useRouter()
  const isRTL = locale === 'ar'
  const [open, setOpen] = useState(false)
  const [signature, setSignature] = useState('')
  const [typedName, setTypedName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; version?: number; error?: string } | null>(null)
  // PORTAL-MODAL: the modal is portaled to <body> via the shared <ModalPortal>
  // (escapes PageTransition's transform so a fixed modal stays viewport-centered).
  const canSubmit = !!signature && typedName.trim().length > 0 && agreed && !busy

  const submit = async () => {
    setBusy(true)
    const res = await signWaiver({ studentId, signature, typedName })
    setBusy(false)
    if (res.ok) {
      setResult({ ok: true, version: res.version })
      setOpen(false)
      router.refresh()
    } else {
      setResult({ ok: false, error: res.error })
    }
  }

  return (
    <>
      <Button size="sm" data-testid={`${testidPrefix}-sign-open`} onClick={() => setOpen(true)}
        className={cn('gap-1', outdated ? 'bg-amber-600 hover:bg-amber-700' : 'bg-primary-700 hover:bg-primary-800')}>
        <FileSignature className="h-4 w-4" /> {label}
      </Button>

      {result && (
        <span className="sr-only" data-testid={`${testidPrefix}-sign-result`}
          data-ok={result.ok} data-version={result.version ?? ''}>{result.error ?? 'ok'}</span>
      )}

      {open && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          onClick={() => !busy && setOpen(false)}>
          <div data-testid={`${testidPrefix}-sign-modal`} onClick={(e) => e.stopPropagation()}
            className={cn('flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl', isRTL && 'rtl')}>
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h3 className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t('signTitle')}</h3>
              <button type="button" onClick={() => !busy && setOpen(false)} aria-label="close"
                className="rounded p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <WaiverConsentFields
                title={title} body={body} locale={locale}
                signature={signature} onSignature={setSignature}
                typedName={typedName} onTypedName={setTypedName}
                agreed={agreed} onAgreed={setAgreed}
              />
              {result && !result.ok && (
                <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600" data-testid="waiver-sign-error">{errText(result.error)}</p>
              )}
            </div>
            <div className="flex items-center justify-end border-t px-5 py-3">
              <Button size="sm" data-testid="waiver-submit" disabled={!canSubmit} onClick={() => void submit()}
                className="bg-primary-700 hover:bg-primary-800">
                {busy ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <Check className="me-1 h-4 w-4" />}
                {t('submitSign')}
              </Button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  )
}

/** Small status chip — Signed vN / Unsigned / Outdated. */
export function WaiverChip({ state, version, testid = 'waiver-chip' }: {
  state: 'none' | 'unsigned' | 'signed' | 'outdated'; version?: number | null; testid?: string
}) {
  const t = useTranslations('waiver')
  if (state === 'none') return null
  const cls = state === 'signed' ? 'bg-green-100 text-green-700'
    : state === 'outdated' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
  const label = state === 'signed' ? t('chipSigned', { v: version ?? 0 })
    : state === 'outdated' ? t('chipOutdated') : t('chipUnsigned')
  return (
    <span data-testid={testid} data-state={state} data-version={version ?? ''}
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', cls)}>
      <FileSignature className="h-3 w-3" /> {label}
    </span>
  )
}
