'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * DA-22 (W3b): with no explicit `?view` param, phones land on the Day · Coach
 * diary — the week timetable fits ~1.2 columns at 390 and truncates mid-word.
 * Runs ONCE on mount and only below md; an explicit view param (either value)
 * always wins, so the Week toggle still works on mobile and desktop defaults
 * are untouched (the server keeps rendering Week for a param-less URL ≥768).
 */
export function MobileDayDefault({ dayUrl }: { dayUrl: string }) {
  const router = useRouter()
  useEffect(() => {
    if (window.matchMedia('(max-width: 767px)').matches) router.replace(dayUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
