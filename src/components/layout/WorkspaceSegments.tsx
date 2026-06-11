import Link from 'next/link'
import { cn } from '@/lib/utils'

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
    <div className="inline-flex rounded-xl border bg-gray-50 p-1" data-testid="workspace-segments">
      {segments.map((s) => (
        <Link
          key={s.key}
          href={`/${locale}${s.path}`}
          data-testid={`segment-${s.key}`}
          className={cn(
            'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
            s.key === active
              ? 'bg-white text-primary-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-800'
          )}
        >
          {s.label}
        </Link>
      ))}
    </div>
  )
}
