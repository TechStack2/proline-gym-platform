import Link from 'next/link'
import { segmentedItemCls, segmentedTrayCls } from '@/components/ui/segmented'

/**
 * Segmented workspace links (IA-1 interim): a workspace that still spans two
 * legacy routes (Schedule|Classes, Payments|Invoices) shows both halves as a
 * segmented control until IA-2/IA-3 merge them into one surface.
 */
export function WorkspaceSegments({
  locale,
  segments,
  active,
}: {
  locale: string
  segments: { key: string; label: string; path: string }[]
  active: string
}) {
  return (
    <div className={segmentedTrayCls} data-testid="workspace-segments">
      {segments.map((s) => (
        <Link
          key={s.key}
          href={`/${locale}${s.path}`}
          data-testid={`segment-${s.key}`}
          className={segmentedItemCls(s.key === active)}
        >
          {s.label}
        </Link>
      ))}
    </div>
  )
}
