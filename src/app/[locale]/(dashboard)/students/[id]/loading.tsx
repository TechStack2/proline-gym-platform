import { PageSkeleton } from '@/components/ui/page-skeleton'

// PERF-1: instant navigation feedback (Suspense fallback) for this route segment.
export default function Loading() {
  return <PageSkeleton variant="detail" />
}
