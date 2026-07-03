'use client'

// ERROR-HARDEN #1: localized, branded 404 for the whole [locale] tree (was Next's
// raw unbranded not-found). Client so it reuses the provider-independent surface.
import { SegmentError } from '@/components/shared/segment-error'

export default function NotFound() {
  return <SegmentError notFound />
}
