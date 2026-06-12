import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Avatar } from './avatar'
import { Dumbbell, Clock, FileText } from 'lucide-react'

/**
 * PT package card (PT-1, operator amendment §3.1) — THE unit of PT display on
 * portal "My PT" and the Member-360 PT panel: type · coach (avatar) ·
 * discipline · X of Y remaining · validity countdown · computed status ·
 * invoice + payment state (deep-link) · sessions NESTED under the card.
 * Expiry is COMPUTED (expires_at in the past ⇒ frozen) — no cron, no enum.
 */
export type PtCardSession = { id: string; scheduledAt: string; status: string }
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
  invoiceStatusClass?: string | null
  sessions: PtCardSession[]
}

export function computePtStatus(d: { status: string; expiresAt: string | null }): string {
  if (d.status === 'active' && d.expiresAt && new Date(d.expiresAt).getTime() < Date.now()) return 'expired'
  return d.status
}

const STATUS_TONE: Record<string, string> = {
  requested: 'bg-amber-100 text-amber-700',
  active: 'bg-green-100 text-green-700',
  expired: 'bg-red-100 text-red-700',
  completed: 'bg-gray-100 text-gray-600',
  rejected: 'bg-red-50 text-red-600',
  cancelled: 'bg-gray-100 text-gray-500',
}
const SESSION_TONE: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-600',
  no_show: 'bg-red-100 text-red-700',
}

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
      className={cn('rounded-2xl border bg-white p-3.5 shadow-sm', status === 'expired' && 'border-red-200 bg-red-50/40')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#cd1419]/10">
            <Dumbbell className="h-4 w-4 text-[#cd1419]" />
          </div>
          <div className="min-w-0">
            <p className={cn('truncate text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
              {data.packageName}
              {data.disciplineName ? <span className="ml-1.5 text-xs font-normal text-gray-400">· {data.disciplineName}</span> : null}
            </p>
            {data.coachName && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                <Avatar url={data.coachAvatarUrl} name={data.coachName} size="xs" /> {data.coachName}
              </p>
            )}
          </div>
        </div>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_TONE[status] || 'bg-gray-100 text-gray-600')}>
          {labels.status}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
        <span data-testid="pt-remaining" className="font-bold text-gray-900">
          {labels.remainingText}
        </span>
        {labels.validity && (
          <span className={cn('inline-flex items-center gap-1', status === 'expired' && 'font-medium text-red-600')}>
            <Clock className="h-3 w-3" /> {labels.validity}
          </span>
        )}
        {data.invoiceHref && (
          <Link href={data.invoiceHref} data-testid="pt-card-invoice" className="inline-flex items-center gap-1 text-[#cd1419] hover:underline">
            <FileText className="h-3 w-3" />
            <span className="font-mono">{data.invoiceNumber}</span>
            {data.invoiceStatusLabel && (
              <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', data.invoiceStatusClass || 'bg-gray-100 text-gray-600')}>
                {data.invoiceStatusLabel}
              </span>
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
                className="flex items-center justify-between text-xs text-gray-600">
                <span>{new Date(s.scheduledAt).toLocaleDateString(isRTL ? 'ar-LB' : 'en-US')}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', SESSION_TONE[s.status] || 'bg-gray-100')}>
                  {labels.sessionStatus(s.status)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
