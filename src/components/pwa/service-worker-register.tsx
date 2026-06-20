'use client'

/**
 * OFF-1 — explicit service-worker registration.
 *
 * next-pwa injects a workbox-window `register()` that fires on the window `load`
 * event, but App-Router timing + the strict-CSP made SW control land late/never
 * in practice (the offline machine never engaged). Registering /sw.js directly on
 * mount makes control deterministic + early. Idempotent with next-pwa's own
 * register (same URL/scope). PROD only — in dev next-pwa is disabled and there is
 * no /sw.js to register; [[stale-sw-localhost]] is handled by DevSwCleanup.
 *
 * Requires `worker-src 'self'` in the prod CSP (script-src 'strict-dynamic'
 * otherwise refuses the worker URL).
 */
import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* registration is best-effort; the app works online regardless */
    })
  }, [])
  return null
}
