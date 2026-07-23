import { cn } from '@/lib/utils'
import { VARIANT_TINT, type StatusVariant } from '@/lib/status-vocabulary'

/**
 * MEMBER-360-ACTIONABLE §3.2/§4.3 — the needs-attention queue. Derived at
 * render (lib/member360/attention), ABSENT when empty — a quiet member is a
 * short page. §2.1: the action IS on the row, one tap.
 */
export type QueueRow = {
  key: string
  kind: string
  chip: { label: React.ReactNode; variant: StatusVariant }
  why: React.ReactNode
  action: React.ReactNode
}

export function AttentionQueue({ rows, testid }: { rows: QueueRow[]; testid: string }) {
  if (rows.length === 0) return null
  return (
    <div data-testid={testid} className="space-y-2">
      {rows.map((r) => (
        <div
          key={r.key}
          data-testid={`${testid}-row`}
          data-kind={r.kind}
          className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white px-3 py-2.5 shadow-elevation-1 sm:flex-nowrap"
        >
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', VARIANT_TINT[r.chip.variant])}>
            {r.chip.label}
          </span>
          <span className="min-w-0 flex-1 text-xs text-gray-600">{r.why}</span>
          <span className="shrink-0">{r.action}</span>
        </div>
      ))}
    </div>
  )
}
