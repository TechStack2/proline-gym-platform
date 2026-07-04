'use client'

/**
 * Refund / Void controls (D1) — reference-only, audited status transitions via
 * the refund_invoice / void_invoice services. Void is blocked for paid invoices
 * (use refund); refund is the terminal money-back marker. The platform never
 * processes money — these only record the decision and its reason.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { refundInvoice, voidInvoice } from '../actions'

export function InvoiceActions({ invoiceId, status, locale }: { invoiceId: string; status: string; locale: string }) {
  const t = (en: string, ar: string, fr: string) => (locale === 'ar' ? ar : locale === 'fr' ? fr : en)
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const terminal = ['cancelled', 'refunded'].includes(status)
  if (terminal) return null

  function run(kind: 'refund' | 'void') {
    const reason = window.prompt(t('Reason (recorded in the audit log):', 'السبب (يُسجَّل في سجل التدقيق):', "Motif (enregistré dans le journal d'audit) :")) || undefined
    if (reason === undefined) return
    setError('')
    startTransition(async () => {
      const res = kind === 'refund' ? await refundInvoice(invoiceId, reason) : await voidInvoice(invoiceId, reason)
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-3 border-t pt-4">
      {status === 'paid' ? (
        <Button data-testid="refund-btn" variant="outline" disabled={pending} onClick={() => run('refund')}
          className="text-blue-700 hover:bg-blue-50">
          {t('Refund', 'استرجاع', 'Remboursement')}
        </Button>
      ) : (
        <Button data-testid="void-btn" variant="outline" disabled={pending} onClick={() => run('void')}
          className="text-gray-600 hover:bg-gray-50">
          {t('Void invoice', 'إلغاء الفاتورة', 'Annuler la facture')}
        </Button>
      )}
      {error && <span data-testid="invoice-action-error" className="text-sm text-red-700">{error}</span>}
    </div>
  )
}
