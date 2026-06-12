'use client'

/**
 * DEV-ONLY service-worker cleanup (UX-2, operator-reported crash).
 *
 * next-pwa `disable: true` skips REGISTERING in dev, but a SW previously
 * registered by a PROD build (`next start`) on the same origin keeps
 * controlling localhost — serving stale workbox-precached chunks under dev.
 * Symptoms seen live: React `NotFoundError: Node.removeChild` on account
 * switches (hydration against stale chunks) and old shell UI (e.g. Settings
 * "missing" from nav). This unregisters every SW + clears caches once, then
 * reloads. Dead code in production builds (NODE_ENV is inlined).
 */
import { useEffect } from 'react'

export function DevSwCleanup() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return
    if (!('serviceWorker' in navigator)) return
    if (sessionStorage.getItem('sw-cleaned') === '1') return
    void (async () => {
      const regs = await navigator.serviceWorker.getRegistrations()
      let removed = 0
      for (const r of regs) {
        if (await r.unregister()) removed++
      }
      if ('caches' in window) {
        for (const k of await caches.keys()) await caches.delete(k)
      }
      sessionStorage.setItem('sw-cleaned', '1')
      if (removed > 0) {
        console.warn(`[dev] unregistered ${removed} stale service worker(s) — reloading`)
        location.reload()
      }
    })()
  }, [])
  return null
}
