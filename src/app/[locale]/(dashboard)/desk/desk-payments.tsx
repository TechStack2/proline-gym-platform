'use client'

/**
 * OFF-3 — front-desk offline payment UI.
 *
 *  • RecordPaymentForm — record a cash/OMT/Whish payment against an open invoice.
 *    ONLINE it writes straight through the canonical recordPayment action (path
 *    unchanged). OFFLINE it enqueues a provisional pending intent (dual-currency)
 *    keyed by a client op_id (the idempotency key) → "saved offline · will sync".
 *  • PendingSyncBar — the desk-level pending-queue indicator: count + "Sync now"
 *    (flush) + a conflict list for any money record the server rejected (surfaced
 *    for review, never dropped).
 */
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { queuePayment } from '@/lib/offline/payments'
import type { PendingPaymentIntent } from '@/lib/db/schema'
import type { OutboxStats } from '@/lib/offline/outbox'
import { recordPayment } from '../invoices/actions'
import { CloudOff, RefreshCw, Loader2, AlertTriangle, CheckCircle2, Banknote } from 'lucide-react'

export type DeskInvoice = {
  id: string
  invoice_number: string
  total_usd: number
  balance_usd: number
  exchange_rate: number | null
  student_id: string
  status: string
}

type Method = 'cash_usd' | 'cash_lbp' | 'omt' | 'whish' | 'bank_transfer' | 'bob_finance'
const METHODS: Method[] = ['cash_usd', 'cash_lbp', 'omt', 'whish', 'bank_transfer', 'bob_finance']

const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

export function RecordPaymentForm({
  locale, invoice, memberName, online, onChange,
}: {
  locale: string
  invoice: DeskInvoice
  memberName: string
  online: boolean
  onChange: () => void // refresh pending stats + (online) reload the mirror
}) {
  const t = useTranslations('desk')
  const isRTL = locale === 'ar'
  const [open, setOpen] = useState(false)
  const [amountUsd, setAmountUsd] = useState(invoice.balance_usd.toFixed(2))
  const [amountLbp, setAmountLbp] = useState('')
  const [method, setMethod] = useState<Method>('cash_usd')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<'online' | 'offline' | null>(null)

  async function submit() {
    setError('')
    const usd = parseFloat(amountUsd)
    if (!Number.isFinite(usd) || usd <= 0) { setError(t('amountPositive')); return }
    const lbp = amountLbp ? parseFloat(amountLbp) : 0
    const op_id = uuid()
    const paymentDate = new Date().toISOString().slice(0, 10)
    setBusy(true)
    try {
      if (online) {
        const res = await recordPayment({
          invoiceId: invoice.id, amountUsd: usd, amountLbp: lbp, method,
          exchangeRate: invoice.exchange_rate, paymentDate, clientUuid: op_id,
        })
        if (!res.ok) { setError(res.error); return }
        setDone('online')
      } else {
        // Provisional — queued, reconciles on reconnect through record_payment.
        await queuePayment({
          op_id, invoice_id: invoice.id, student_id: invoice.student_id,
          amount_usd: usd, amount_lbp: lbp, method, reference: null,
          exchange_rate: invoice.exchange_rate, payment_date: paymentDate,
          invoice_number: invoice.invoice_number, member_name: memberName,
        })
        setDone('offline')
      }
      onChange()
      setTimeout(() => { setOpen(false); setDone(null) }, 1500)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <p data-testid={done === 'offline' ? 'pay-saved-offline' : 'pay-recorded'}
        className={cn('mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium',
          done === 'offline' ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800')}>
        {done === 'offline' ? <CloudOff className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        {done === 'offline' ? t('savedOffline') : t('recorded')}
      </p>
    )
  }

  if (!open) {
    return (
      <button type="button" data-testid="desk-record-payment" onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#cd1419] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#a81014]">
        <Banknote className="h-3.5 w-3.5" /> {t('recordPayment')}
      </button>
    )
  }

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-0.5 text-xs">
          <span className="text-gray-600">{t('amountUsd')}</span>
          <input data-testid="pay-amount-usd" type="number" step="0.01" min="0" value={amountUsd}
            onChange={(e) => setAmountUsd(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:border-[#cd1419] focus:outline-none" />
        </label>
        <label className="space-y-0.5 text-xs">
          <span className="text-gray-600">{t('amountLbp')}</span>
          <input data-testid="pay-amount-lbp" type="number" step="1" min="0" value={amountLbp}
            onChange={(e) => setAmountLbp(e.target.value)} placeholder={t('optional')}
            className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:border-[#cd1419] focus:outline-none" />
        </label>
      </div>
      <label className="block space-y-0.5 text-xs">
        <span className="text-gray-600">{t('method')}</span>
        <select data-testid="pay-method" value={method} onChange={(e) => setMethod(e.target.value as Method)}
          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm">
          {METHODS.map((m) => <option key={m} value={m}>{t(`methods.${m}`)}</option>)}
        </select>
      </label>
      {!online && (
        <p className="inline-flex items-center gap-1.5 text-xs text-amber-700">
          <CloudOff className="h-3.5 w-3.5" /> {t('willQueueOffline')}
        </p>
      )}
      {error && <p data-testid="pay-error" className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" data-testid="pay-submit" onClick={() => void submit()} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#cd1419] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#a81014] disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Banknote className="h-3.5 w-3.5" />}
          {online ? t('recordPayment') : t('saveOffline')}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy}
          className="rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}

export function PendingSyncBar({
  locale, stats, pending, online, syncing, onSyncNow,
}: {
  locale: string
  stats: OutboxStats
  pending: PendingPaymentIntent[]
  online: boolean
  syncing: boolean
  onSyncNow: () => void
}) {
  const t = useTranslations('desk')
  const isRTL = locale === 'ar'
  if (stats.total === 0 && stats.conflicts === 0) return null
  const conflicts = pending.filter((p) => p.status === 'conflict')

  return (
    <div data-testid="desk-pending-bar" dir={isRTL ? 'rtl' : 'ltr'}
      className={cn('rounded-2xl border p-3 shadow-sm',
        stats.conflicts > 0 ? 'border-amber-200 bg-amber-50' : 'border-blue-100 bg-blue-50')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-gray-800">
          <CloudOff className="h-4 w-4 text-blue-600" />
          <span data-testid="desk-pending-count">{t('pendingSync', { n: stats.total })}</span>
          {stats.conflicts > 0 && (
            <span data-testid="desk-conflict-count" className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              <AlertTriangle className="h-3 w-3" /> {t('needsReview', { n: stats.conflicts })}
            </span>
          )}
        </p>
        <button type="button" data-testid="desk-sync-pending" onClick={onSyncNow} disabled={!online || syncing}
          title={!online ? t('syncOfflineHint') : undefined}
          className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {t('syncNow')}
        </button>
      </div>
      {conflicts.length > 0 && (
        <ul className="mt-2 space-y-1" data-testid="desk-conflict-list">
          {conflicts.map((c) => (
            <li key={c.op_id} data-testid="desk-conflict-row"
              className="flex items-start justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs">
              <span className="font-medium text-gray-800">
                {c.member_name || '—'} · {c.invoice_number || c.invoice_id.slice(0, 8)} · ${c.amount_usd.toFixed(2)}
              </span>
              <span className="text-amber-700">{c.last_error || t('needsReviewShort')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
