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
import { queueLead } from '@/lib/offline/leads'
import type { PendingPaymentIntent, PendingLeadIntent } from '@/lib/db/schema'
import type { OutboxStats } from '@/lib/offline/outbox'
import { recordPayment } from '../invoices/actions'
import { addLead } from '../leads/actions'
import { CloudOff, RefreshCw, Loader2, AlertTriangle, CheckCircle2, Banknote, Undo2, Trash2, WifiOff, UserPlus } from 'lucide-react'

export type InvoiceState = { status: string; totalUsd: number; balanceUsd: number }

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

/**
 * OFF-3b — capture a walk-in lead. ONLINE it writes straight through addLead;
 * OFFLINE it enqueues a pending lead intent (client op_id) → "saved offline · will
 * sync". Interest is captured as a free-text note (no discipline picker offline).
 */
export function CaptureLeadForm({
  locale, online, onChange,
}: {
  locale: string
  online: boolean
  onChange: () => void
}) {
  const t = useTranslations('desk')
  const isRTL = locale === 'ar'
  const [open, setOpen] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [interest, setInterest] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<'online' | 'offline' | null>(null)

  async function submit() {
    setError('')
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) { setError(t('leadRequired')); return }
    const op_id = uuid()
    setBusy(true)
    try {
      if (online) {
        const res = await addLead({
          first_name: firstName.trim(), last_name: lastName.trim(), phone: phone.trim(),
          email: '', source: 'walk_in', discipline_id: '', notes: interest.trim() || undefined,
          clientUuid: op_id,
        })
        if (!res.ok) { setError(res.error); return }
        setDone('online')
      } else {
        await queueLead({
          op_id, first_name: firstName.trim(), last_name: lastName.trim(), phone: phone.trim(),
          email: null, source: 'walk_in', source_detail: null, discipline_id: null,
          notes: interest.trim() || null,
        })
        setDone('offline')
      }
      onChange()
      setFirstName(''); setLastName(''); setPhone(''); setInterest('')
      setTimeout(() => { setOpen(false); setDone(null) }, 1500)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm" dir={isRTL ? 'rtl' : 'ltr'} data-testid="desk-lead-capture">
      <div className="flex items-center justify-between">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-800"><UserPlus className="h-4 w-4" /> {t('captureLead')}</h2>
        {!open && !done && (
          <button type="button" data-testid="desk-capture-lead" onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#cd1419] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#a81014]">
            <UserPlus className="h-3.5 w-3.5" /> {t('newLead')}
          </button>
        )}
      </div>

      {done ? (
        <p data-testid={done === 'offline' ? 'lead-saved-offline' : 'lead-recorded'}
          className={cn('mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium',
            done === 'offline' ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800')}>
          {done === 'offline' ? <CloudOff className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {done === 'offline' ? t('leadSavedOffline') : t('leadRecorded')}
        </p>
      ) : open ? (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input data-testid="lead-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)}
              placeholder={t('leadFirstName')} className="rounded-md border border-gray-200 px-2 py-1.5 text-sm" />
            <input data-testid="lead-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)}
              placeholder={t('leadLastName')} className="rounded-md border border-gray-200 px-2 py-1.5 text-sm" />
          </div>
          <input data-testid="lead-phone" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr"
            placeholder={t('leadPhone')} className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm" />
          <input data-testid="lead-interest" value={interest} onChange={(e) => setInterest(e.target.value)}
            placeholder={t('leadInterest')} className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm" />
          {!online && (
            <p className="inline-flex items-center gap-1.5 text-xs text-amber-700">
              <CloudOff className="h-3.5 w-3.5" /> {t('leadWillQueueOffline')}
            </p>
          )}
          {error && <p data-testid="lead-error" className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button type="button" data-testid="lead-submit" onClick={() => void submit()} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#cd1419] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#a81014] disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              {online ? t('captureLead') : t('leadSaveOffline')}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={busy}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-xs text-gray-400">{t('captureLeadHint')}</p>
      )}
    </section>
  )
}

export function PendingSyncBar({
  locale, stats, pending, pendingLeads, online, syncing, onSyncNow, getState, onResubmit, onDiscard, onResubmitLead, onDiscardLead,
}: {
  locale: string
  stats: OutboxStats
  pending: PendingPaymentIntent[]
  pendingLeads: PendingLeadIntent[]
  online: boolean
  syncing: boolean
  onSyncNow: () => void
  getState: (invoiceId: string) => Promise<InvoiceState | null>
  onResubmit: (opId: string, amountUsd?: number) => Promise<void>
  onDiscard: (opId: string, reason: string) => Promise<{ ok: boolean; error?: string }>
  onResubmitLead: (opId: string) => Promise<void>
  onDiscardLead: (opId: string, reason: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const t = useTranslations('desk')
  const isRTL = locale === 'ar'
  if (stats.total === 0 && stats.conflicts === 0) return null
  const conflicts = pending.filter((p) => p.status === 'conflict')
  const leadConflicts = pendingLeads.filter((l) => l.status === 'conflict')

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
      {(conflicts.length > 0 || leadConflicts.length > 0) && (
        <ul className="mt-2 space-y-2" data-testid="desk-conflict-list">
          {conflicts.map((c) => (
            <ConflictRow key={c.op_id} locale={locale} item={c} online={online}
              getState={getState} onResubmit={onResubmit} onDiscard={onDiscard} />
          ))}
          {leadConflicts.map((c) => (
            <LeadConflictRow key={c.op_id} locale={locale} item={c} online={online}
              onResubmit={onResubmitLead} onDiscard={onDiscardLead} />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * OFF-3b — a resolvable LEAD conflict row (reuses OFF-4's loop). Re-submit (re-queue
 * under the same op_id, idempotent) or discard-with-reason (audited, never silent).
 * Simpler than the payment row — a lead has no server-truth premise to reconcile.
 */
function LeadConflictRow({
  locale, item, online, onResubmit, onDiscard,
}: {
  locale: string
  item: PendingLeadIntent
  online: boolean
  onResubmit: (opId: string) => Promise<void>
  onDiscard: (opId: string, reason: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const t = useTranslations('desk')
  const isRTL = locale === 'ar'
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const resubmit = async () => {
    setBusy(true); setErr('')
    try { await onResubmit(item.op_id) } finally { setBusy(false) }
  }
  const discard = async () => {
    if (!reason.trim()) { setErr(t('discardReasonRequired')); return }
    setBusy(true); setErr('')
    try {
      const res = await onDiscard(item.op_id, reason.trim())
      if (!res.ok) setErr(res.error || t('resolveFailed'))
    } finally { setBusy(false) }
  }

  return (
    <li data-testid="desk-lead-conflict-row" data-op-id={item.op_id} dir={isRTL ? 'rtl' : 'ltr'}
      className="rounded-lg border border-amber-200 bg-white p-2.5 text-xs">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-gray-800">
          {[item.first_name, item.last_name].filter(Boolean).join(' ') || '—'} · <span dir="ltr">{item.phone}</span>
        </span>
        {!open && (
          <button type="button" data-testid="desk-lead-conflict-resolve" onClick={() => setOpen(true)}
            className="shrink-0 rounded-md bg-amber-600 px-2 py-1 font-semibold text-white hover:bg-amber-700">
            {t('resolve')}
          </button>
        )}
      </div>
      <p className="mt-1 text-amber-700" data-testid="desk-lead-conflict-reason">{item.last_error || t('needsReviewShort')}</p>

      {open && (
        <div className="mt-2 space-y-2 border-t border-amber-100 pt-2">
          {!online && (
            <p className="inline-flex items-center gap-1 text-amber-700"><WifiOff className="h-3 w-3" /> {t('resolveNeedsConnection')}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" data-testid="desk-lead-resubmit-btn" onClick={() => void resubmit()} disabled={!online || busy}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <Undo2 className="h-3 w-3" /> {t('resubmit')}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input data-testid="desk-lead-discard-reason" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder={t('discardReasonPlaceholder')} disabled={!online || busy}
              className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1" />
            <button type="button" data-testid="desk-lead-discard-btn" onClick={() => void discard()} disabled={!online || busy}
              className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
              <Trash2 className="h-3 w-3" /> {t('discard')}
            </button>
          </div>
          {err && <p data-testid="desk-lead-resolve-error" className="text-red-700">{err}</p>}
        </div>
      )}
    </li>
  )
}

/**
 * OFF-4 — a resolvable conflict row. Expanding it fetches the server's authoritative
 * invoice state (reconcile-against-truth) and offers two bounded actions: re-submit
 * corrected (same op_id, idempotent) or discard-with-reason (audited, never silent).
 */
function ConflictRow({
  locale, item, online, getState, onResubmit, onDiscard,
}: {
  locale: string
  item: PendingPaymentIntent
  online: boolean
  getState: (invoiceId: string) => Promise<InvoiceState | null>
  onResubmit: (opId: string, amountUsd?: number) => Promise<void>
  onDiscard: (opId: string, reason: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const t = useTranslations('desk')
  const isRTL = locale === 'ar'
  const [open, setOpen] = useState(false)
  const [server, setServer] = useState<InvoiceState | null>(null)
  const [amount, setAmount] = useState(item.amount_usd.toFixed(2))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const expand = async () => {
    setOpen(true)
    if (online) {
      const s = await getState(item.invoice_id).catch(() => null)
      setServer(s)
      if (s && s.balanceUsd > 0) setAmount(s.balanceUsd.toFixed(2))
    }
  }
  const resubmit = async () => {
    setBusy(true); setErr('')
    try { await onResubmit(item.op_id, parseFloat(amount)) } finally { setBusy(false) }
  }
  const discard = async () => {
    if (!reason.trim()) { setErr(t('discardReasonRequired')); return }
    setBusy(true); setErr('')
    try {
      const res = await onDiscard(item.op_id, reason.trim())
      if (!res.ok) setErr(res.error || t('resolveFailed'))
    } finally { setBusy(false) }
  }

  const invStatus = (s: string) => {
    const key = `invStatus.${s}`
    const label = t(key)
    return label === key ? s : label
  }

  return (
    <li data-testid="desk-conflict-row" data-op-id={item.op_id} dir={isRTL ? 'rtl' : 'ltr'}
      className="rounded-lg border border-amber-200 bg-white p-2.5 text-xs">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-gray-800">
          {item.member_name || '—'} · {item.invoice_number || item.invoice_id.slice(0, 8)} · ${item.amount_usd.toFixed(2)}
        </span>
        {!open && (
          <button type="button" data-testid="desk-conflict-resolve" onClick={() => void expand()}
            className="shrink-0 rounded-md bg-amber-600 px-2 py-1 font-semibold text-white hover:bg-amber-700">
            {t('resolve')}
          </button>
        )}
      </div>
      <p className="mt-1 text-amber-700" data-testid="desk-conflict-reason">{item.last_error || t('needsReviewShort')}</p>

      {open && (
        <div className="mt-2 space-y-2 border-t border-amber-100 pt-2">
          {online && server && (
            <p data-testid="desk-conflict-server-state" className="text-gray-600">
              {t('serverState', { status: invStatus(server.status), balance: server.balanceUsd.toFixed(2) })}
            </p>
          )}
          {!online && (
            <p className="inline-flex items-center gap-1 text-amber-700" data-testid="desk-resolve-needs-connection">
              <WifiOff className="h-3 w-3" /> {t('resolveNeedsConnection')}
            </p>
          )}

          {/* Re-submit corrected (same op_id — idempotency holds). */}
          <div className="flex flex-wrap items-center gap-2">
            <input data-testid="desk-resubmit-amount" type="number" step="0.01" min="0" value={amount}
              onChange={(e) => setAmount(e.target.value)} disabled={!online || busy}
              className="w-24 rounded-md border border-gray-200 px-2 py-1" />
            <button type="button" data-testid="desk-resubmit-btn" onClick={() => void resubmit()} disabled={!online || busy}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <Undo2 className="h-3 w-3" /> {t('resubmit')}
            </button>
          </div>
          {/* Discard with a mandatory audit reason (never a silent drop). */}
          <div className="flex flex-wrap items-center gap-2">
            <input data-testid="desk-discard-reason" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder={t('discardReasonPlaceholder')} disabled={!online || busy}
              className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1" />
            <button type="button" data-testid="desk-discard-btn" onClick={() => void discard()} disabled={!online || busy}
              className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
              <Trash2 className="h-3 w-3" /> {t('discard')}
            </button>
          </div>
          {err && <p data-testid="desk-resolve-error" className="text-red-700">{err}</p>}
        </div>
      )}
    </li>
  )
}
