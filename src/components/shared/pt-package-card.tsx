import Link from 'next/link'
import { cn } from '@/lib/utils'
import { fmtDate, fmtTime } from '@/lib/fmt'
import { StatusChip } from '@/components/ui/status-chip'
import { Avatar } from './avatar'
import { Dumbbell, Clock, FileText } from 'lucide-react'

/**
 * PT package card (PT-1, operator amendment §3.1) — THE unit of PT display on
 * portal "My PT" and the Member-360 PT panel: type · coach (avatar) ·
 * discipline · X of Y remaining · validity countdown · computed status ·
 * invoice + payment state (deep-link) · sessions NESTED under the card.
 * Expiry is COMPUTED (expires_at in the past ⇒ frozen) — no cron, no enum.
 */
export type PtCardSession = { id: string; scheduledAt: string; status: string; action?: React.ReactNode }
export type PtCardData = {
  id: string
  status: string // pt_assignment_status
  sessionsTotal: number
  sessionsRemaining: number
  expiresAt: string | null
  packageName: string
  disciplineName?: string | null
  coachName?: string | null
  coachAvatarUrl?: string | null
  invoiceHref?: string | null
  invoiceNumber?: string | null
  invoiceStatusLabel?: string | null
  /** Raw invoice status — colour is the vocabulary's call (W3b, DA-32). */
  invoiceStatus?: string | null
  sessions: PtCardSession[]
}

export function computePtStatus(d: { status: string; expiresAt: string | null }): string {
  if (d.status === 'active' && d.expiresAt && new Date(d.expiresAt).getTime() < Date.now()) return 'expired'
  return d.status
}

// W3b (DA-25/32): the local STATUS_TONE/SESSION_TONE forks are dead — colour
// comes from the status vocabulary (`pt` + `trial` domains) via StatusChip.

export function PtPackageCard({
  data, locale, labels, testid = 'pt-pkg-card', sessionTestid = 'pt-pkg-session', actions,
}: {
  data: PtCardData
  locale: string
  /** i18n resolved by the caller (server or client). */
  labels: {
    /** Fully rendered remaining text — callers keep their spec contracts
        (portal: "0 of 1 sessions remaining" · Member-360: "10/10 left"). */
    remainingText: string
    status: string // localized status label
    validity: string | null // localized countdown ("12 days left" / "expired …") or null
    sessionsTitle: string
    sessionStatus: (s: string) => string
  }
  testid?: string
  sessionTestid?: string
  /** Action nodes (sell/extend/book) — staff or portal specific. */
  actions?: React.ReactNode
}) {
  const isRTL = locale === 'ar'
  const status = computePtStatus(data)
  return (
    <div
      data-testid={testid}
      data-status={status}
      data-assignment-id={data.id}
      className={cn('rounded-2xl border bg-white p-3.5 shadow-sm', status === 'expired' && 'border-danger-500/30 bg-danger-500/[0.06]')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-700/10">
            <Dumbbell className="h-4 w-4 text-primary-700" />
          </div>
          <div className="min-w-0">
            <p className={cn('truncate text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
              {data.packageName}
              {data.disciplineName ? <span className="ms-1.5 text-xs font-normal text-gray-400">· {data.disciplineName}</span> : null}
            </p>
            {data.coachName && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                <Avatar url={data.coachAvatarUrl} name={data.coachName} size="xs" /> {data.coachName}
              </p>
            )}
          </div>
        </div>
        <StatusChip domain="pt" status={status} label={labels.status} size="sm" className="shrink-0" />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
        <span data-testid="pt-remaining" className="font-bold text-gray-900">
          {labels.remainingText}
        </span>
        {labels.validity && (
          <span className={cn('inline-flex items-center gap-1', status === 'expired' && 'font-medium text-danger-600')}>
            <Clock className="h-3 w-3" /> {labels.validity}
          </span>
        )}
        {data.invoiceHref && (
          <Link href={data.invoiceHref} data-testid="pt-card-invoice" className="inline-flex items-center gap-1 text-primary-700 hover:underline">
            <FileText className="h-3 w-3" />
            <span className="font-mono">{data.invoiceNumber}</span>
            {data.invoiceStatusLabel && (
              <StatusChip domain="invoice" status={data.invoiceStatus ?? undefined} label={data.invoiceStatusLabel} size="sm" />
            )}
          </Link>
        )}
      </div>

      {actions}

      {data.sessions.length > 0 && (
        <div className="mt-2.5 border-t pt-2">
          <p className="mb-1 text-[11px] font-medium text-gray-400">{labels.sessionsTitle}</p>
          <ul className="space-y-1">
            {data.sessions.map((s) => (
              <li key={s.id} data-testid={sessionTestid} data-status={s.status}
                className="flex items-center justify-between gap-2 text-xs text-gray-600">
                <span dir="ltr">{fmtDate(s.scheduledAt, locale, 'dayMonth')} · {fmtTime(s.scheduledAt, locale)}</span>
                <span className="flex items-center gap-1.5">
                  {s.action}
                  <StatusChip domain="trial" status={s.status} label={labels.sessionStatus(s.status)} size="sm" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
