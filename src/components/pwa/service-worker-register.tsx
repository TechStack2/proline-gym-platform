'use client'

/**
 * OFF-1 — explicit service-worker registration.
 * PWA-UPDATE — detect a WAITING worker (a new deploy) and surface a non-blocking
 * "New version — Refresh" toast, so installed front-desk PWAs stop silently running
 * stale code after a deploy.
 *
 * next-pwa injects a workbox-window `register()` on the window `load` event, but
 * App-Router timing + the strict CSP made SW control land late/never in practice
 * (the offline machine never engaged). Registering /sw.js directly on mount makes
 * control deterministic + early. Idempotent with next-pwa's own register (same
 * URL/scope). PROD only — in dev next-pwa is disabled and there is no /sw.js;
 * [[stale-sw-localhost]] is handled by DevSwCleanup.
 *
 * Update flow (skipWaiting:false — next.config.mjs + worker/index.js): a new build
 * installs a WAITING worker while the loaded page keeps its old assets (no buildId
 * skew, no surprise reload). We prompt; on tap we postMessage SKIP_WAITING to promote
 * the waiting worker, then reload ONCE it takes control (controllerchange). A first
 * install (no prior controller) activates immediately and is NOT prompted.
 *
 * Requires `worker-src 'self'` in the prod CSP (script-src 'strict-dynamic'
 * otherwise refuses the worker URL).
 */
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

export function ServiceWorkerRegister() {
  const t = useTranslations('pwa')
  // Keep the latest translations without re-running the register effect on locale
  // change (the effect registers once + attaches lifecycle listeners).
  const tRef = useRef(t)
  tRef.current = t

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    let promptShown = false
    let userAskedToUpdate = false
    let reloading = false

    // Reload ONLY after the user opted in (tapped Refresh → SKIP_WAITING → the new
    // worker takes control). This guard is essential: the first-install clientsClaim
    // ALSO fires controllerchange, and that must NOT reload the page.
    const onControllerChange = () => {
      if (!userAskedToUpdate || reloading) return
      reloading = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    const showUpdatePrompt = (waiting: ServiceWorker) => {
      if (promptShown) return
      promptShown = true
      toast(<span data-testid="sw-update-toast">{tRef.current('updateAvailable')}</span>, {
        duration: Infinity,
        action: {
          label: tRef.current('updateAction'),
          onClick: () => {
            userAskedToUpdate = true
            waiting.postMessage({ type: 'SKIP_WAITING' })
          },
        },
      })
    }

    const watch = (reg: ServiceWorkerRegistration) => {
      // A worker already waiting (installed between sessions) + an active controller
      // == a pending update, not a first install.
      if (reg.waiting && navigator.serviceWorker.controller) showUpdatePrompt(reg.waiting)
      // …or a new build installs while the app is open. Track the NEW worker directly
      // (not reg.waiting, which can lag the statechange): once it is 'installed' AND a
      // controller already exists, it is the waiting worker to promote.
      reg.addEventListener('updatefound', () => {
        const nextWorker = reg.installing
        if (!nextWorker) return
        nextWorker.addEventListener('statechange', () => {
          if (nextWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdatePrompt(nextWorker)
          }
        })
      })
    }

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(watch)
      .catch(() => {
        /* registration is best-effort; the app works online regardless */
      })

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  return null
}
