'use client'

/**
 * OFF-1 — explicit service-worker registration.
 * PWA-UPDATE — detect a WAITING worker (a new deploy) and surface a non-blocking
 * "New version — Refresh" prompt, so installed front-desk PWAs stop silently running
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
 * MONDAY-HARDEN A: the prompt is a small CUSTOM BANNER (a fixed <div>, positioned +
 * themed by Tailwind CLASSES only — CSP-safe, dark-aware), NOT a sonner toast. The
 * old prompt was a `duration: Infinity` sonner toast: perpetually MOUNTED, so sonner
 * re-laid it out on every viewport-resize tick — a resize-recursion aggravator (and
 * it rendered orphaned/unstyled while the old CSP stripped its inline styles). A plain
 * fixed div is CSS-positioned and does NOT re-compute on resize. The update-DETECTION
 * (updatefound → statechange → controllerchange guards) is byte-for-byte unchanged —
 * only how the prompt is rendered/dismissed changed.
 *
 * Requires `worker-src 'self'` in the prod CSP (script-src 'strict-dynamic'
 * otherwise refuses the worker URL).
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

export function ServiceWorkerRegister() {
  const t = useTranslations('pwa')
  // Keep the latest translations without re-running the register effect on locale
  // change (the effect registers once + attaches lifecycle listeners).
  const tRef = useRef(t)
  tRef.current = t

  // The banner's visibility + its "Refresh" action. The action is captured in a ref
  // by showUpdatePrompt so the button can fire the SAME opt-in + SKIP_WAITING flow
  // without moving any detection guard (userAskedToUpdate/reloading/promptShown) out
  // of the effect — those stay exactly as before.
  const [showBanner, setShowBanner] = useState(false)
  const refreshRef = useRef<() => void>(() => {})

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
      refreshRef.current = () => {
        userAskedToUpdate = true
        waiting.postMessage({ type: 'SKIP_WAITING' })
      }
      setShowBanner(true)
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

  if (!showBanner) return null

  // Neutral colors flip in dark via the DS-2 channel vars (bg-white → dark card,
  // text-gray-900 → near-white, border-gray-200 → dark line) — NO dark: overrides
  // (DS-2 inverts the gray scale, so dark:border-gray-700 would render LIGHT). The
  // button keeps brand red + NON-flipping text-primary-foreground (white in both modes).
  return (
    <div
      data-testid="sw-update-toast"
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm shadow-lg lg:bottom-6"
    >
      <span className="font-medium text-gray-900">{t('updateAvailable')}</span>
      <button
        type="button"
        onClick={() => {
          refreshRef.current()
          setShowBanner(false)
        }}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        {t('updateAction')}
      </button>
    </div>
  )
}
