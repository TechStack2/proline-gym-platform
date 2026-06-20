'use client'

/**
 * OFF-2 — prime the Dexie offline mirror so the front desk can read offline.
 *
 * Activates the dormant SyncEngine PULL: a full, gym-scoped (RLS-enforced) pull
 * of the mirrored tables on login (first dashboard mount) and on each online
 * window (the `online` event). Throttled so rapid online/offline flapping or
 * dashboard navigation doesn't re-pull constantly. Read-only — no writes here
 * (that's OFF-3). Runs only when online; offline it's a no-op.
 */
import { useEffect } from 'react'
import { getSyncEngine } from '@/lib/db/sync-engine'

let lastPrimeAt = 0

export function SyncPrimer() {
  useEffect(() => {
    const prime = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      if (Date.now() - lastPrimeAt < 20_000) return // throttle re-primes
      lastPrimeAt = Date.now()
      // full pull: refreshes tables without an `updated_at` cursor (enrollments…)
      getSyncEngine().pullAll({ full: true }).catch(() => {
        // best-effort priming; the offline desk degrades to "no cached data"
        lastPrimeAt = 0 // allow a retry on the next online window
      })
    }
    prime() // login / first dashboard mount
    window.addEventListener('online', prime)
    return () => window.removeEventListener('online', prime)
  }, [])
  return null
}
