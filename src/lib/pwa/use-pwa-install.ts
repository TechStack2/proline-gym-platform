'use client'

/**
 * PWA-INSTALL — shared install state + platform detection.
 *
 * `beforeinstallprompt` only fires in Chromium (Chrome/Edge/Android); macOS Safari
 * never fires it (install is the manual "Add to Dock"). This hook unifies: the
 * captured native prompt (when available), already-installed detection (no nag),
 * a remembered dismiss, and a per-platform instruction key for the manual fallback.
 */
import { useCallback, useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export type InstallInstructions = 'macSafari' | 'chromiumDesktop' | 'iosSafari' | 'generic'

// Shared with the legacy bottom-bar prompt so a dismiss is remembered across both.
const DISMISS_KEY = 'pwa_install_dismissed'

function detectInstructions(): InstallInstructions {
  if (typeof navigator === 'undefined') return 'generic'
  const ua = navigator.userAgent
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (/Mac/.test(ua) && (navigator as { maxTouchPoints?: number }).maxTouchPoints! > 1)
  const isChromium = /chrome|crios|edg/i.test(ua)
  const isSafari = /safari/i.test(ua) && !isChromium && !/fxios|firefox/i.test(ua)
  const isMac = /macintosh|mac os x/i.test(ua) && !isIOS
  if (isIOS && isSafari) return 'iosSafari'
  if (isMac && isSafari) return 'macSafari'
  if (isChromium) return 'chromiumDesktop'
  return 'generic'
}

export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [installed, setInstalled] = useState(false)
  // Start true → never flash the card before localStorage is read on mount.
  const [dismissed, setDismissed] = useState(true)
  const [instructions, setInstructions] = useState<InstallInstructions>('generic')

  useEffect(() => {
    setIsStandalone(
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true,
    )
    setInstructions(detectInstructions())
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === 'true') } catch { setDismissed(false) }

    const onBeforeInstall = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent) }
    const onInstalled = () => { setInstalled(true); setDeferred(null) }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const dismiss = useCallback(() => {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY, 'true') } catch { /* private mode */ }
  }, [])

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferred) return 'unavailable'
    try {
      await deferred.prompt()
      const choice = await deferred.userChoice
      setDeferred(null)
      return choice.outcome
    } catch {
      setDeferred(null)
      return 'dismissed'
    }
  }, [deferred])

  return {
    canPrompt: deferred != null, // a native prompt is captured (Chromium)
    isStandalone,
    installed,
    dismissed,
    instructions,
    dismiss,
    promptInstall,
    // The affordance offers itself only when not already installed and not dismissed.
    shouldOffer: !isStandalone && !installed && !dismissed,
  }
}
