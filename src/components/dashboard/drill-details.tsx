import Link from 'next/link'
import { cn } from '@/lib/utils'
import { DisclosureChevron } from '@/components/ui/nav-chevron'

/**
 * DRILL-360 — a server-rendered inline expand (native `<details>`, zero client
 * JS) for a 360 card whose headline number reconciles to CONTRIBUTING ROWS. The
 * summary is the headline line; opening reveals the rows (each a drill link into
 * the owning surface — Member-360 / invoice / leads). The rows are the proof:
 * they sum/count to the number, which is the transparency the owner liked.
 */
export type DrillRow = {
  href: string
  left: React.ReactNode
  right?: React.ReactNode
  /** numeric contribution (e.g. payment amount) — exposed as data-v for reconciliation. */
  value?: number
}

export function DrillDetails({
  summary, rows, testid, rowTestid, isRTL, emptyText,
}: {
  summary: React.ReactNode
  rows: DrillRow[]
  testid: string
  rowTestid: string
  isRTL: boolean
  emptyText?: string
}) {
  return (
    <details className="group rounded-xl border bg-gray-50/60" data-testid={testid} data-rows={rows.length}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">{summary}</span>
        <DisclosureChevron />
      </summary>
      <div className={cn('space-y-1 border-t px-2 py-2', isRTL && 'text-right')}>
        {rows.length === 0 ? (
          <p className="px-1 py-1 text-xs text-gray-400">{emptyText ?? '—'}</p>
        ) : rows.map((r, i) => (
          <Link key={i} href={r.href} data-testid={rowTestid} data-v={r.value}
            className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-white">
            <span className="min-w-0 truncate text-gray-800">{r.left}</span>
            {r.right != null && <span className="shrink-0 font-medium text-gray-600">{r.right}</span>}
          </Link>
        ))}
      </div>
    </details>
  )
}
