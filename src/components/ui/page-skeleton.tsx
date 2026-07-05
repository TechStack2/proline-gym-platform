import { Skeleton } from '@/components/ui/skeleton'

/**
 * PERF-1: a lightweight, CSP-safe (classes only) page skeleton for route-segment
 * loading.tsx files. Rendered instantly on navigation (the Suspense fallback) so a
 * click shows an immediate response instead of a 2-3s blank wait. Three shapes:
 *   · cards  — a header + a responsive card grid (hubs, catalogs)
 *   · table  — a header + stacked list rows (students, invoices, payments)
 *   · detail — a header card + a stat grid (a single-record page)
 */
type PageSkeletonProps = {
  variant?: 'cards' | 'table' | 'detail'
  rows?: number
  cards?: number
}

export function PageSkeleton({ variant = 'cards', rows = 7, cards = 6 }: PageSkeletonProps) {
  return (
    <div className="space-y-6" data-testid="page-skeleton" aria-busy="true" aria-live="polite">
      {/* Header shell */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>

      {variant === 'table' && (
        <div className="space-y-3 rounded-2xl border bg-white p-4">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="hidden h-4 w-24 sm:block" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      )}

      {variant === 'cards' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-2xl border bg-white p-5">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      )}

      {variant === 'detail' && (
        <div className="space-y-4">
          <div className="space-y-4 rounded-2xl border bg-white p-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-4 w-1/4" />
              </div>
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2 rounded-xl border bg-white p-4">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-6 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
