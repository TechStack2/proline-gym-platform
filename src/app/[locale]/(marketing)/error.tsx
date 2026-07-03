'use client'

// ERROR-HARDEN #1: segment error boundary — a server throw in this group renders
// the branded, localized surface (with retry) instead of Next's raw 500.
import { SegmentError } from '@/components/shared/segment-error'

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError error={error} reset={reset} />
}
