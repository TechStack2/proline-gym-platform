'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Bell, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  pushSupported, pushConfigured, permissionState, isSubscribed, subscribeToPush,
  isIosSafari, isStandalone,
} from '@/lib/push/client'

const DISMISS_KEY = 'push_prompt_dismissed'

/**
 * PUSH-1 — the ONE-TIME, post-login "enable notifications" prompt (mounted in each
 * role's authenticated shell). The 7/10 calibration is "strong triggers, polite
 * acquisition": it appears once when a signed-in user has neither granted nor
 * denied permission and isn't subscribed; dismissing is REMEMBERED (localStorage),
 * so it never nags. Never asks on an unsupported browser, and on iOS Safari (not
 * installed) it honestly says "install first" instead of a dead Enable button.
 */
export function PushPrompt() {
  const t = useTranslations('push')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [iosNeedsInstall, setIosNeedsInstall] = useState(false)

  useEffect(() => {
    if (!pushSupported() || !pushConfigured()) return
    try { if (localStorage.getItem(DISMISS_KEY) === 'true') return } catch { /* ignore */ }
    if (permissionState() !== 'default') return // already granted/denied → don't prompt
    setIosNeedsInstall(isIosSafari() && !isStandalone())
    ;(async () => { if (!(await isSubscribed())) setShow(true) })()
  }, [])

  if (!show) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, 'true') } catch { /* ignore */ }
    setShow(false)
  }
  const enable = async () => {
    setBusy(true)
    await subscribeToPush()
    setBusy(false)
    dismiss()
  }

  return (
    <div data-testid="push-prompt"
      className="mx-4 mt-3 flex items-start gap-3 rounded-2xl border border-primary-200 bg-primary-50/70 p-3 shadow-sm">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
        <Bell className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">{t('promptTitle')}</p>
        <p className="mt-0.5 text-xs text-gray-600">{iosNeedsInstall ? t('iosInstallHint') : t('promptBody')}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {!iosNeedsInstall && (
            <button type="button" data-testid="push-prompt-enable" onClick={enable} disabled={busy}
              className={cn('rounded-lg bg-primary-700 px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-800', busy && 'opacity-60')}>
              {t('promptEnable')}
            </button>
          )}
          <button type="button" data-testid="push-prompt-dismiss" onClick={dismiss}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">
            {iosNeedsInstall ? t('promptGotIt') : t('promptLater')}
          </button>
        </div>
      </div>
      <button type="button" aria-label="close" onClick={dismiss} className="rounded p-1 text-gray-400 hover:bg-gray-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
