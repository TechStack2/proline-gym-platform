import Link from 'next/link'
import { cn } from '@/lib/utils'
import { VARIANT_TINT, type StatusVariant } from '@/lib/status-vocabulary'

/**
 * MEMBER-360-ACTIONABLE §3.1/§4.1 — the header status strip: the three numbers
 * that drive action. Every stat is a doorway (§2.1: tap 1 opens the surface
 * that explains it); calm-zero doctrine — a $0 balance renders neutral.
 */
export type StripStat = {
  key: string
  label: string
  value: React.ReactNode
  /** value ink — omit for the calm neutral */
  tone?: 'danger' | 'warning'
  chip?: { label: React.ReactNode; variant: StatusVariant } | null
  href: string
  testid: string
}

export function StatusStrip({ stats, testid }: { stats: StripStat[]; testid: string }) {
  return (
    <div data-testid={testid} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {stats.map((s) => (
        <Link
          key={s.key}
          href={s.href}
          data-testid={s.testid}
          className="block rounded-2xl border bg-white px-4 py-3 shadow-elevation-1 transition-colors hover:bg-gray-50 active:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--shell-accent)]"
        >
          <p className="text-[11px] uppercase tracking-wide text-gray-400">{s.label}</p>
          <p
            className={cn(
              'mt-0.5 text-xl font-bold tabular-nums text-gray-900',
              s.tone === 'danger' && 'text-danger-600',
              s.tone === 'warning' && 'text-warning-600',
            )}
          >
            {s.value}
          </p>
          {s.chip && (
            <p className="mt-1">
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', VARIANT_TINT[s.chip.variant])}>
                {s.chip.label}
              </span>
            </p>
          )}
        </Link>
      ))}
    </div>
  )
}
