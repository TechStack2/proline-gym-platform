'use client'

/**
 * CANCEL-FLOW — a shared reason-collection dialog for destructive billing exits
 * (cancel a registration, void an invoice). A required reason via quick CHIPS +
 * FREE TEXT, and — when `showRefund` is set (a cancel whose invoice may carry
 * payments) — a "refund collected payments" fork (record a reversing payment then
 * void vs keep-paid-and-cancel). Confirm is disabled until a reason is present.
 * Rendered through ModalPortal so it stays viewport-fixed in every shell.
 */
import { useState } from 'react'
import { ModalPortal } from '@/components/shared/modal-portal'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

export function ReasonDialog({
  open, title, description, chips, confirmLabel, showRefund = false, refundLabel, busy = false, locale,
  testid = 'reason-dialog', onConfirm, onClose,
}: {
  open: boolean
  title: string
  description?: string
  chips: string[]
  confirmLabel: string
  showRefund?: boolean
  refundLabel?: string
  busy?: boolean
  locale: string
  testid?: string
  onConfirm: (reason: string, refund: boolean) => void
  onClose: () => void
}) {
  const isRTL = locale === 'ar'
  const t = (en: string, ar: string, fr: string) => (isRTL ? ar : locale === 'fr' ? fr : en)
  const [reason, setReason] = useState('')
  const [refund, setRefund] = useState(false)
  if (!open) return null

  const trimmed = reason.trim()
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" dir={isRTL ? 'rtl' : 'ltr'}>
        <div data-testid={testid} className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
          <div className="mb-2 flex items-start justify-between gap-2">
            <h3 className={cn('text-base font-semibold text-gray-900', isRTL && 'font-arabic')}>{title}</h3>
            <button type="button" data-testid="reason-close" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
              <X className="h-4 w-4" />
            </button>
          </div>
          {description && <p className="mb-3 text-xs text-muted-foreground">{description}</p>}

          {/* Quick reason chips — clicking one fills the free-text field (still editable). */}
          <div className="mb-2 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button key={c} type="button" data-testid="reason-chip" onClick={() => setReason(c)}
                className={cn('rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  reason === c ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
                {c}
              </button>
            ))}
          </div>
          <textarea data-testid="reason-text" value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            placeholder={t('Reason (required)', 'السبب (مطلوب)', 'Motif (requis)')}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />

          {showRefund && (
            <label className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
              <input type="checkbox" data-testid="reason-refund" checked={refund} onChange={(e) => setRefund(e.target.checked)} className="mt-0.5" />
              <span>{refundLabel || t('Refund any collected payments (record a reversal, then void the invoice). Leave unchecked to keep the payment and just end the registration.',
                'استرداد أي مدفوعات محصّلة (تسجيل عكسي ثم إلغاء الفاتورة). اتركه دون تحديد للاحتفاظ بالدفعة وإنهاء التسجيل فقط.',
                'Rembourser les paiements encaissés (enregistrer une contre-passation puis annuler la facture). Laisser décoché pour conserver le paiement et simplement terminer l’inscription.')}</span>
            </label>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" data-testid="reason-cancel" onClick={onClose} disabled={busy}>
              {t('Back', 'رجوع', 'Retour')}
            </Button>
            <Button size="sm" data-testid="reason-confirm" disabled={busy || !trimmed}
              onClick={() => onConfirm(trimmed, refund)} className="bg-red-600 hover:bg-red-700">
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
