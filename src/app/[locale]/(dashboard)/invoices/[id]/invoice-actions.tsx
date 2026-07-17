'use client'

/**
 * Refund / Void controls (D1 + CANCEL-FLOW) — reference-only, audited status
 * transitions via refund_invoice / void_invoice. An invoice with standing payments
 * (paid OR partial) routes to REFUND; an unpaid invoice (pending/overdue) routes to
 * VOID. The reason is collected via the shared ReasonDialog (chips + free text) and
 * recorded (void → invoices.void_reason + audit log). The platform never processes
 * money — these only record the decision + its reason.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ReasonDialog } from '@/components/billing/reason-dialog'
import { refundInvoice, voidInvoice } from '../actions'
import { useErrorText } from '@/lib/errors/use-error-text';

export function InvoiceActions({ invoiceId, status, locale }: { invoiceId: string; status: string; locale: string }) {
  const t = (en: string, ar: string, fr: string) => (locale === 'ar' ? ar : locale === 'fr' ? fr : en)
  const router = useRouter()
  const errText = useErrorText();
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)

  const terminal = ['cancelled', 'refunded'].includes(status)
  if (terminal) return null
  // Standing payments (paid OR partial) → money-back is a REFUND; an unpaid invoice
  // is VOIDed. (void_invoice rejects an invoice with payments — refund first.)
  const hasPayments = ['paid', 'partial'].includes(status)

  function confirm(reason: string) {
    setOpen(false); setError('')
    startTransition(async () => {
      const res = hasPayments ? await refundInvoice(invoiceId, reason) : await voidInvoice(invoiceId, reason)
      if (!res.ok) { setError(errText(res.error)); return }
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-3 border-t pt-4">
      {hasPayments ? (
        <Button data-testid="refund-btn" variant="outline" disabled={pending} onClick={() => setOpen(true)}
          className="text-blue-700 hover:bg-blue-50">
          {t('Refund', 'استرجاع', 'Remboursement')}
        </Button>
      ) : (
        <Button data-testid="void-btn" variant="outline" disabled={pending} onClick={() => setOpen(true)}
          className="text-gray-600 hover:bg-gray-50">
          {t('Void invoice', 'إلغاء الفاتورة', 'Annuler la facture')}
        </Button>
      )}
      {error && <span data-testid="invoice-action-error" className="text-sm text-red-700">{error}</span>}
      <ReasonDialog
        open={open}
        locale={locale}
        busy={pending}
        title={hasPayments ? t('Refund this invoice', 'استرجاع هذه الفاتورة', 'Rembourser cette facture') : t('Void this invoice', 'إلغاء هذه الفاتورة', 'Annuler cette facture')}
        description={hasPayments
          ? t('Records a money-back reference. The invoice keeps its number.', 'يسجّل مرجع إعادة المال. تحتفظ الفاتورة برقمها.', "Enregistre une référence de remboursement. La facture conserve son numéro.")
          : t('The invoice is nullified but never deleted — its number stays in the sequence.', 'تُلغى الفاتورة دون حذفها — يبقى رقمها في التسلسل.', "La facture est annulée sans être supprimée — son numéro reste dans la séquence.")}
        chips={hasPayments
          ? [t('Overcharge', 'مبالغة', 'Surfacturation'), t('Duplicate', 'مكرّرة', 'Doublon'), t('Member request', 'طلب العضو', 'Demande du membre')]
          : [t('Wrong invoice', 'فاتورة خاطئة', 'Mauvaise facture'), t('Duplicate', 'مكرّرة', 'Doublon'), t('Data entry error', 'خطأ إدخال', 'Erreur de saisie')]}
        confirmLabel={hasPayments ? t('Refund', 'استرجاع', 'Rembourser') : t('Void invoice', 'إلغاء الفاتورة', 'Annuler')}
        onConfirm={(reason) => confirm(reason)}
        onClose={() => setOpen(false)}
      />
    </div>
  )
}
