'use client'

/**
 * OFF-2 / OFF-3 — Front Desk offline surface. A CLIENT surface that reads the
 * primed Dexie mirror, so the core desk lookups work with zero network (the
 * server-component pages can't render offline). OFF-2: member find → basics,
 * today's schedule, a class roster. OFF-3: the desk now also RECORDS — a payment
 * against an open invoice is written straight through online, or queued offline
 * (provisional, dual-currency) and reconciled idempotently on reconnect. A
 * "cached as of <time>" stamp on reads; a pending-sync bar over the write queue.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { getOfflineDB } from '@/lib/db/schema'
import type { PendingPaymentIntent } from '@/lib/db/schema'
import { getSyncEngine } from '@/lib/db/sync-engine'
import { useOnline } from '@/lib/offline/use-online'
import { outboxStats, flushOutbox, type OutboxStats } from '@/lib/offline/outbox'
import { listPendingPayments, resubmitPayment, discardPayment, type RecordPayment } from '@/lib/offline/payments'
import { saveAttendance } from '@/app/[locale]/coach/attendance/actions'
import { recordPayment, getInvoiceState, discardOfflinePayment } from '../invoices/actions'
import { dateLocale } from '@/lib/utils/locale-format'
import { RecordPaymentForm, PendingSyncBar, type DeskInvoice } from './desk-payments'
import { Search, RefreshCw, Loader2, Phone, Award, Dumbbell, CalendarDays, Users, Clock, ExternalLink, WifiOff, Receipt } from 'lucide-react'

type Row = Record<string, any>
type DeskData = {
  students: Row[]; profiles: Map<string, Row>
  membershipsByStudent: Map<string, Row[]>
  ptByStudent: Map<string, Row[]>
  schedules: Row[]; classesById: Map<string, Row>
  enrollmentsByClass: Map<string, Row[]>
  invoicesByStudent: Map<string, Row[]>
  paymentsByInvoice: Map<string, Row[]>
  cachedAt: string | null
}

// OFF-3: the unified flush handlers — each Tier-1 path drains through its existing
// idempotent server writer. `i as any` bridges the lib's string `method` to the
// action's payment_method_enum (the offline queue stores it as a plain string).
const flushHandlers = { save: saveAttendance, record: ((i) => recordPayment(i as any)) as RecordPayment }

const lname = (r: Row | undefined, base: string, locale: string): string =>
  (r?.[`${base}_${locale}`] || r?.[`${base}_en`] || '') as string

const beltLabel = (r?: string | null) => (r ? r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—')

/**
 * OFF-2 — prime the Dexie mirror from the front desk itself (the only offline
 * read surface). Deliberately scoped HERE rather than the dashboard layout: a
 * layout-level pull contends with timing-sensitive specs that never open the
 * desk (it destabilised the realtime-race specs). Core front-desk tables only,
 * once per session + on each `online` window (throttled). Read-only (OFF-3).
 */
const CORE_TABLES = [
  'profiles', 'students', 'classes', 'class_schedules',
  'class_enrollments', 'student_memberships', 'pt_assignments',
  // OFF-3: the money path needs the member's open invoices + their payments
  // (to show the balance) cached for the offline record-payment flow.
  'invoices', 'payments',
] as const

let deskPrimedThisSession = false
let lastDeskPrimeAt = 0
function primeDeskMirror() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return // offline → no-op
  if (Date.now() - lastDeskPrimeAt < 30_000) return // throttle (double-shell mounts twice)
  lastDeskPrimeAt = Date.now()
  getSyncEngine().pullAll({ full: true, tables: CORE_TABLES }).catch(() => {
    lastDeskPrimeAt = 0 // allow a retry on the next online window
  })
}

export function OfflineDesk({ locale }: { locale: string }) {
  const t = useTranslations('desk')
  const isRTL = locale === 'ar'
  const online = useOnline()
  const [data, setData] = useState<DeskData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [q, setQ] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null)
  const [selectedClass, setSelectedClass] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const db = getOfflineDB()
      const [students, profilesArr, memberships, pts, schedules, classesArr, enrollments, invoicesArr, paymentsArr, meta] = await Promise.all([
        db.students.toArray(), db.profiles.toArray(), db.student_memberships.toArray(),
        db.pt_assignments.toArray(), db.class_schedules.toArray(), db.classes.toArray(),
        db.class_enrollments.toArray(), db.invoices.toArray(), db.payments.toArray(), db.sync_metadata.toArray(),
      ])
      const profiles = new Map(profilesArr.map((p: Row) => [p.id, p]))
      const classesById = new Map(classesArr.map((c: Row) => [c.id, c]))
      const membershipsByStudent = new Map<string, Row[]>()
      for (const m of memberships as Row[]) (membershipsByStudent.get(m.student_id) ?? membershipsByStudent.set(m.student_id, []).get(m.student_id)!).push(m)
      const ptByStudent = new Map<string, Row[]>()
      for (const p of pts as Row[]) (ptByStudent.get(p.student_id) ?? ptByStudent.set(p.student_id, []).get(p.student_id)!).push(p)
      const enrollmentsByClass = new Map<string, Row[]>()
      for (const e of enrollments as Row[]) (enrollmentsByClass.get(e.class_id) ?? enrollmentsByClass.set(e.class_id, []).get(e.class_id)!).push(e)
      const invoicesByStudent = new Map<string, Row[]>()
      for (const inv of invoicesArr as Row[]) (invoicesByStudent.get(inv.student_id) ?? invoicesByStudent.set(inv.student_id, []).get(inv.student_id)!).push(inv)
      const paymentsByInvoice = new Map<string, Row[]>()
      for (const p of paymentsArr as Row[]) (paymentsByInvoice.get(p.invoice_id) ?? paymentsByInvoice.set(p.invoice_id, []).get(p.invoice_id)!).push(p)
      const cachedAt = (meta as Row[]).map((m) => m.last_synced_at).filter(Boolean).sort().pop() ?? null
      setData({ students: students as Row[], profiles, membershipsByStudent, ptByStudent, schedules: schedules as Row[], classesById, enrollmentsByClass, invoicesByStudent, paymentsByInvoice, cachedAt })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // Prime the mirror when the desk opens online + on each online window. The
  // onSync subscription below re-reads once the pull lands. Offline → no-op,
  // the desk just reads the last prime.
  useEffect(() => {
    if (!deskPrimedThisSession) { deskPrimedThisSession = true; primeDeskMirror() }
    const onOnline = () => primeDeskMirror()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  // Re-read the mirror when a prime (desk open / Sync now) completes.
  useEffect(() => {
    const unsub = getSyncEngine().onSync((status) => {
      if (status === 'online' || status === 'error') void load()
    })
    return unsub
  }, [load])

  const syncNow = async () => {
    if (!online) return
    setSyncing(true)
    try { await getSyncEngine().pullAll({ full: true }); await load() }
    finally { setSyncing(false) }
  }

  // ── OFF-3: pending write queue (payments + attendance) ──
  const [pendingStats, setPendingStats] = useState<OutboxStats>({ total: 0, attendance: 0, payments: 0, conflicts: 0 })
  const [pendingList, setPendingList] = useState<PendingPaymentIntent[]>([])
  const [syncingPending, setSyncingPending] = useState(false)

  const refreshPending = useCallback(async () => {
    const [s, list] = await Promise.all([outboxStats(), listPendingPayments()])
    setPendingStats(s); setPendingList(list)
  }, [])

  useEffect(() => { void refreshPending() }, [refreshPending])

  // Flush the queue through the existing idempotent writers, then re-prime so the
  // confirmed balances reflect. Safe to double-fire — record_payment no-ops on a
  // re-pushed op_id.
  const flushPendingNow = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    setSyncingPending(true)
    try {
      await flushOutbox(flushHandlers)
      await getSyncEngine().pullAll({ full: true, tables: CORE_TABLES })
      await Promise.all([refreshPending(), load()])
    } finally {
      setSyncingPending(false)
    }
  }, [refreshPending, load])

  // Reconnect → auto-flush the queue (pending money + attendance flip to confirmed).
  useEffect(() => {
    const onOnline = () => void flushPendingNow()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [flushPendingNow])

  // ── OFF-4: conflict resolution ──
  // Server-truth for the resolution UI (reconcile a stale offline intent).
  const handleGetState = useCallback((invoiceId: string) => getInvoiceState(invoiceId), [])
  // Re-submit corrected (same op_id) → re-queue + immediately re-attempt the flush.
  const handleResubmit = useCallback(async (opId: string, amountUsd?: number) => {
    await resubmitPayment(opId, amountUsd)
    await refreshPending()
    await flushPendingNow()
  }, [refreshPending, flushPendingNow])
  // Discard with an audited reason (the server writes the trail; then drop the row).
  const handleDiscard = useCallback(async (opId: string, reason: string) => {
    const res = await discardPayment(opId, reason, discardOfflinePayment)
    await refreshPending()
    return res
  }, [refreshPending])

  const memberName = useCallback((s: Row) => {
    const p = data?.profiles.get(s.profile_id)
    return [lname(p, 'first_name', locale), lname(p, 'last_name', locale)].filter(Boolean).join(' ').trim()
  }, [data, locale])

  // ── Member search ──
  const results = useMemo(() => {
    if (!data || !q.trim()) return [] as Row[]
    const needle = q.trim().toLowerCase()
    return data.students
      .filter((s) => s.is_active !== false)
      .map((s) => ({ s, name: memberName(s), phone: (data.profiles.get(s.profile_id)?.phone ?? '') as string }))
      .filter((r) => r.name.toLowerCase().includes(needle) || r.phone.includes(needle))
      .slice(0, 12)
  }, [data, q, memberName])

  // ── Selected member basics ──
  const basics = useMemo(() => {
    if (!data || !selectedStudent) return null
    const s = data.students.find((x) => x.id === selectedStudent)
    if (!s) return null
    const p = data.profiles.get(s.profile_id)
    const ms = data.membershipsByStudent.get(s.id) ?? []
    const activeMs = ms.find((m) => m.status === 'active') ?? ms[0]
    const pt = (data.ptByStudent.get(s.id) ?? []).filter((a) => a.is_active !== false)
    const ptRemaining = pt.reduce((n, a) => n + (Number(a.sessions_remaining) || 0), 0)
    return {
      name: memberName(s),
      phone: (p?.phone ?? '') as string,
      membership: activeMs?.status ?? 'none',
      membershipEnd: activeMs?.end_date ?? null,
      ptRemaining,
      belt: s.current_belt_rank as string | null,
      id: s.id,
    }
  }, [data, selectedStudent, memberName])

  // ── OFF-3: the selected member's open invoices (balance from cached payments) ──
  const openInvoices = useMemo(() => {
    if (!data || !selectedStudent) return [] as DeskInvoice[]
    return (data.invoicesByStudent.get(selectedStudent) ?? [])
      .filter((inv) => !['paid', 'cancelled', 'refunded'].includes(inv.status))
      .map((inv) => {
        const paid = (data.paymentsByInvoice.get(inv.id) ?? []).reduce((s, p) => s + Number(p.amount_usd || 0), 0)
        const balance = Number((Number(inv.total_usd || 0) - paid).toFixed(2))
        return {
          id: inv.id, invoice_number: inv.invoice_number, total_usd: Number(inv.total_usd || 0),
          balance_usd: Math.max(0, balance), exchange_rate: inv.exchange_rate != null ? Number(inv.exchange_rate) : null,
          student_id: selectedStudent, status: inv.status,
        } as DeskInvoice
      })
      .filter((i) => i.balance_usd > 0.001)
  }, [data, selectedStudent])

  // ── Today's schedule ──
  const todaySchedule = useMemo(() => {
    if (!data) return [] as { id: string; classId: string; name: string; room: string; start: string; end: string }[]
    const dow = new Date().getDay()
    return data.schedules
      .filter((sc) => Number(sc.day_of_week) === dow && sc.is_active !== false)
      .map((sc) => {
        const c = data.classesById.get(sc.class_id)
        return { id: sc.id, classId: sc.class_id, name: c ? lname(c, 'name', locale) : '—', room: (c?.room ?? '') as string, start: (sc.start_time ?? '').slice(0, 5), end: (sc.end_time ?? '').slice(0, 5) }
      })
      .sort((a, b) => a.start.localeCompare(b.start))
  }, [data, locale])

  // ── Roster of the selected class ──
  const roster = useMemo(() => {
    if (!data || !selectedClass) return [] as { id: string; name: string; belt: string | null }[]
    const enr = (data.enrollmentsByClass.get(selectedClass) ?? []).filter((e) => e.is_active !== false)
    return enr.map((e) => {
      const s = data.students.find((x) => x.id === e.student_id)
      return { id: e.student_id, name: s ? memberName(s) : '—', belt: (s?.current_belt_rank ?? null) as string | null }
    })
  }, [data, selectedClass, memberName])

  const cachedLabel = data?.cachedAt
    ? t('cachedAt', { time: new Date(data.cachedAt).toLocaleString(dateLocale(locale)) })
    : t('noCache')

  const card = 'rounded-2xl border border-gray-100 bg-white p-4 shadow-sm'

  return (
    <div className={cn('space-y-4', isRTL && 'rtl text-right')} data-testid="offline-desk" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className={cn('text-2xl font-bold text-gray-900', isRTL && 'font-arabic')}>{t('title')}</h1>
          <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-gray-500" data-testid="desk-cached-at">
            {!online && <WifiOff className="h-3.5 w-3.5 text-amber-600" />} {cachedLabel}
          </p>
        </div>
        <button type="button" data-testid="desk-sync-now" onClick={() => void syncNow()} disabled={!online || syncing}
          title={!online ? t('syncOfflineHint') : undefined}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {t('syncNow')}
        </button>
      </div>

      {/* OFF-3: the unified pending-sync bar (queued payments + attendance + conflicts). */}
      <PendingSyncBar locale={locale} stats={pendingStats} pending={pendingList}
        online={online} syncing={syncingPending} onSyncNow={() => void flushPendingNow()}
        getState={handleGetState} onResubmit={handleResubmit} onDiscard={handleDiscard} />

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* ── Member find → basics ── */}
          <section className={card}>
            <h2 className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-800"><Search className="h-4 w-4" /> {t('findMember')}</h2>
            <div className="relative">
              <Search className={cn('absolute top-2.5 h-4 w-4 text-gray-400', isRTL ? 'right-3' : 'left-3')} />
              <input data-testid="desk-search" value={q} onChange={(e) => { setQ(e.target.value); setSelectedStudent(null) }}
                placeholder={t('searchPlaceholder')} dir={isRTL ? 'rtl' : 'ltr'}
                className={cn('w-full rounded-lg border border-gray-200 py-2 text-sm focus:border-[#cd1419] focus:outline-none focus:ring-1 focus:ring-[#cd1419]', isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3')} />
            </div>

            {q.trim() && !selectedStudent && (
              <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                {results.length === 0 ? <li className="px-2 py-2 text-sm text-gray-400">{t('noResults')}</li> :
                  results.map((r) => (
                    <li key={r.s.id}>
                      <button type="button" data-testid="desk-member-result" onClick={() => setSelectedStudent(r.s.id)}
                        className="flex w-full items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm hover:border-gray-300">
                        <span className="font-medium text-gray-900">{r.name || '—'}</span>
                        {r.phone && <span className="text-xs text-gray-400" dir="ltr">{r.phone}</span>}
                      </button>
                    </li>
                  ))}
              </ul>
            )}

            {basics && (
              <div className="mt-3 rounded-xl bg-gray-50 p-3" data-testid="desk-member-basics">
                <p className="text-base font-bold text-gray-900" data-testid="desk-basic-name">{basics.name || '—'}</p>
                <div className="mt-2 space-y-1.5 text-sm text-gray-700">
                  {basics.phone && <p className="inline-flex items-center gap-1.5" data-testid="desk-basic-phone"><Phone className="h-3.5 w-3.5 text-gray-400" /><span dir="ltr">{basics.phone}</span></p>}
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span data-testid="desk-basic-membership" data-status={basics.membership}
                      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                        basics.membership === 'active' ? 'bg-green-100 text-green-800' : basics.membership === 'none' ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-800')}>
                      {t(`membership.${basics.membership === 'active' ? 'active' : basics.membership === 'none' ? 'none' : 'inactive'}`)}
                    </span>
                    <span data-testid="desk-basic-pt" className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      <Dumbbell className="h-3 w-3" /> {t('ptRemaining', { n: basics.ptRemaining })}
                    </span>
                    <span data-testid="desk-basic-belt" className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      <Award className="h-3 w-3" /> {beltLabel(basics.belt)}
                    </span>
                  </p>
                </div>
                {/* Full file / edits need a connection (OFF-3). */}
                {online ? (
                  <Link href={`/${locale}/students/${basics.id}`} data-testid="desk-open-file"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#cd1419] hover:underline">
                    <ExternalLink className="h-3.5 w-3.5" /> {t('openFile')}
                  </Link>
                ) : (
                  <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-600" data-testid="needs-connection">
                    <WifiOff className="h-3.5 w-3.5" /> {t('fileNeedsConnection')}
                  </p>
                )}

                {/* OFF-3: open invoices → record a payment (online write-through / offline queued). */}
                <div className="mt-3 border-t border-gray-200 pt-3">
                  <h3 className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <Receipt className="h-3.5 w-3.5" /> {t('openInvoices')}
                  </h3>
                  {openInvoices.length === 0 ? (
                    <p className="text-xs text-gray-400" data-testid="desk-no-invoices">{t('noOpenInvoices')}</p>
                  ) : (
                    <ul className="space-y-2" data-testid="desk-invoices">
                      {openInvoices.map((inv) => (
                        <li key={inv.id} data-testid="desk-invoice-row" data-invoice-id={inv.id}
                          className="rounded-xl border border-gray-100 bg-white p-2.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-mono font-medium text-gray-700">{inv.invoice_number}</span>
                            <span className="font-semibold text-red-600" data-testid="desk-invoice-balance">${inv.balance_usd.toFixed(2)}</span>
                          </div>
                          <RecordPaymentForm locale={locale} invoice={inv} memberName={basics.name}
                            online={online} onChange={() => { void refreshPending(); if (online) void load() }} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* ── Today's schedule + roster ── */}
          <section className={card}>
            <h2 className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-800"><CalendarDays className="h-4 w-4" /> {t('todaySchedule')}</h2>
            {todaySchedule.length === 0 ? <p className="text-sm text-gray-400" data-testid="desk-no-classes">{t('noClassesToday')}</p> : (
              <ul className="space-y-1.5" data-testid="desk-schedule">
                {todaySchedule.map((c) => (
                  <li key={c.id}>
                    <button type="button" data-testid="desk-schedule-row" data-class-id={c.classId} onClick={() => setSelectedClass(c.classId)}
                      className={cn('flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm',
                        selectedClass === c.classId ? 'border-[#cd1419] bg-red-50' : 'border-gray-100 hover:border-gray-300')}>
                      <span className="font-medium text-gray-900">{c.name}</span>
                      <span className="inline-flex items-center gap-2 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{c.start}{c.end ? `–${c.end}` : ''}</span>
                        {c.room && <span>{c.room}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {selectedClass && (
              <div className="mt-4 border-t pt-3">
                <h3 className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500"><Users className="h-3.5 w-3.5" /> {t('roster')}</h3>
                {roster.length === 0 ? <p className="text-sm text-gray-400">{t('emptyRoster')}</p> : (
                  <ul className="space-y-1" data-testid="desk-roster">
                    {roster.map((m) => (
                      <li key={m.id} data-testid="desk-roster-row" className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5 text-sm">
                        <span className="font-medium text-gray-800">{m.name}</span>
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500"><Award className="h-3 w-3" />{beltLabel(m.belt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
