'use client'

/**
 * OFF-2 — prime the Dexie offline mirror so the front desk can read offline.
 *
 * Activates the dormant SyncEngine PULL, but DELIBERATELY light so it never
 * contends with the rest of the app (an eager full pull of 21 tables on every
 * dashboard load destabilised the timing-sensitive specs):
 *   • only the front-desk CORE tables (the offline desk's needs),
 *   • ONCE per session on login + on each `online` window (throttled),
 *   • IDLE-deferred off the load/hydration window via requestIdleCallback, so it
 *     runs in a gap rather than competing with active work.
 * Read-only — no writes here (OFF-3). Online-only; offline it's a no-op.
 */
import { useEffect } from 'react'
import { getSyncEngine } from '@/lib/db/sync-engine'

// The offline desk reads exactly these (search→basics, today's schedule, roster).
const CORE_TABLES = [
  'profiles', 'students', 'classes', 'class_schedules',
  'class_enrollments', 'student_memberships', 'pt_assignments',
] as const

let primedThisSession = false
let lastPrimeAt = 0

function primeSoon() {
  const run = () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    if (Date.now() - lastPrimeAt < 30_000) return // throttle
    lastPrimeAt = Date.now()
    getSyncEngine().pullAll({ full: true, tables: CORE_TABLES }).catch(() => {
      lastPrimeAt = 0 // allow a retry on the next online window
    })
  }
  if (typeof window === 'undefined') return
  if ('requestIdleCallback' in window) (window as any).requestIdleCallback(run, { timeout: 6_000 })
  else setTimeout(run, 4_000)
}

export function SyncPrimer() {
  useEffect(() => {
    if (!primedThisSession) { primedThisSession = true; primeSoon() } // login (once/session)
    const onOnline = () => primeSoon()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])
  return null
}
