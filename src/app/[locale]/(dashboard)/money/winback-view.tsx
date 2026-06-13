'use client'

/**
 * FIN-1 Win-back queue (Money → Win-back tab). Churned members (persisted churn
 * timestamp), most-recent first, with last-followup state + read-time
 * reactivation. Row actions: call (tel:) · log outcome (chips + note + next
 * date) · reactivate (deep-link to the member file's ML-1/B2 flows). Follows
 * docs/design-system.md (card anatomy, chip rows, empty-state, button tiers).
 * G1 docks a wa.me share action into the row-action slot later.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { dateLocale } from '@/lib/utils/locale-format'
import { Phone, RotateCcw, PhoneOff, MessageSquarePlus, Check, UserX } from 'lucide-react'
import { logWinbackFollowup } from './winback-actions'
import type { WinbackRow } from '@/lib/finances/winback'
import { WhatsAppShare } from '@/components/shared/whatsapp-share'

const OUTCOMES = ['no_answer', 'not_interested', 'thinking', 'promised_visit', 'reactivated'] as const
type Outcome = typeof OUTCOMES[number]

export function WinbackView({ rows, locale }: { rows: WinbackRow[]; locale: string }) {
  const t = useTranslations('winback')
  const isRTL = locale === 'ar'
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString(dateLocale(locale)) : '—')

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="winback-empty">
        <UserX className="mb-2 h-10 w-10 text-gray-300" />
        <p className="text-sm text-gray-400">{t('empty')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="winback-list">
      <p className="text-xs text-gray-500">{t('intro')}</p>
      {rows.map((r) => (
        <WinbackCard key={r.studentId} row={r} locale={locale} isRTL={isRTL} t={t} fmt={fmt} />
      ))}
    </div>
  )
}

function WinbackCard({
  row, locale, isRTL, t, fmt,
}: {
  row: WinbackRow
  locale: string
  isRTL: boolean
  t: ReturnType<typeof useTranslations>
  fmt: (d: string | null) => string
}) {
  const tw = useTranslations('whatsapp')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>('no_answer')
  const [note, setNote] = useState('')
  const [nextDate, setNextDate] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    const res = await logWinbackFollowup({ studentId: row.studentId, outcome, note, nextActionDate: nextDate || null })
    setBusy(false)
    if (res.ok) { setOpen(false); setNote(''); setNextDate(''); router.refresh() }
  }

  return (
    <div
      className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
      data-testid="winback-row"
      data-student-id={row.studentId}
      data-reactivated={row.reactivated}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-gray-900">{row.name || t('unnamed')}</p>
            {row.reactivated ? (
              <span data-testid="winback-reactivated" className="rounded-full bg-green-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-green-700">
                {t('reactivated')}
              </span>
            ) : (
              <span data-testid="winback-churn" data-kind={row.churnKind} className="rounded-full bg-red-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-red-700">
                {t(`kind.${row.churnKind}` as Parameters<typeof t>[0])}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {t('churnedOn', { date: fmt(row.churnedAt) })}
            {row.lastOutcome ? (
              <span data-testid="winback-last-outcome">
                {' · '}{t(`outcome.${row.lastOutcome}` as Parameters<typeof t>[0])}
                {row.nextActionDate ? ` · ${t('nextOn', { date: fmt(row.nextActionDate) })}` : ''}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {row.phone && (
            <a href={`tel:${row.phone}`} data-testid="winback-call" dir="ltr"
              className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100">
              <Phone className="h-3.5 w-3.5" /> {t('call')}
            </a>
          )}
          <WhatsAppShare phone={row.phone} testid="winback-wa"
            message={tw('tmpl.winback', { name: row.name })} label={tw('share.reachOut')} />
          <Link href={`/${locale}/students/${row.studentId}`} data-testid="winback-reactivate"
            className="inline-flex items-center gap-1 rounded-full bg-[#cd1419] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#a81014]">
            <RotateCcw className="h-3.5 w-3.5" /> {t('reactivate')}
          </Link>
        </div>
      </div>

      <div className="mt-2">
        <button type="button" data-testid="winback-log-toggle" onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800">
          <MessageSquarePlus className="h-3.5 w-3.5" /> {t('logOutcome')}
        </button>
      </div>

      {open && (
        <div className="mt-2 rounded-xl bg-gray-50 p-3 space-y-2.5" data-testid="winback-log-form">
          <div className="flex flex-wrap gap-1.5">
            {OUTCOMES.map((o) => (
              <button key={o} type="button" data-testid="winback-outcome-chip" data-value={o}
                onClick={() => setOutcome(o)}
                className={cn('rounded-full border px-3 py-1.5 text-xs font-medium',
                  outcome === o ? 'border-[#cd1419] bg-[#cd1419] text-white' : 'border-gray-200 bg-white text-gray-700')}>
                {t(`outcome.${o}` as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>
          <input data-testid="winback-note" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={t('notePlaceholder')} className={cn('h-9 w-full rounded-lg border px-3 text-sm', isRTL && 'text-right')} />
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">{t('nextActionDate')}</label>
            <input type="date" data-testid="winback-next-date" value={nextDate} onChange={(e) => setNextDate(e.target.value)}
              dir="ltr" className="h-9 rounded-lg border px-3 text-sm" />
          </div>
          <button type="button" data-testid="winback-log-submit" disabled={busy} onClick={submit}
            className="inline-flex items-center gap-1 rounded-xl bg-[#cd1419] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a81014] disabled:opacity-50">
            {busy ? <PhoneOff className="h-4 w-4 animate-pulse" /> : <Check className="h-4 w-4" />} {t('save')}
          </button>
        </div>
      )}
    </div>
  )
}
