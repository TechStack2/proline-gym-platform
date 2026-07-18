'use client'

import { useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  pushSupported, pushConfigured, isSubscribed, subscribeToPush, unsubscribeFromPush,
  permissionState, isIosSafari, isStandalone,
} from '@/lib/push/client'
import { getPushPrefs, setPushPref } from '@/lib/push/actions'

type Cat = 'operational' | 'schedule' | 'informational'

function Switch({ on, onClick, disabled, testid }: { on: boolean; onClick: () => void; disabled?: boolean; testid: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} data-testid={testid} data-on={on ? 'true' : 'false'}
      disabled={disabled} onClick={onClick}
      className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40',
        on ? 'bg-primary-600' : 'bg-gray-300')}>
      <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white transition-transform', on ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  )
}

/**
 * PUSH-1 — the settings/profile push control (every role mounts this). A master
 * enable (subscribe/unsubscribe) + three per-category toggles (default ON). Honest
 * about OS constraints we cannot bypass: unsupported browsers, a denied permission
 * (only the user can lift it in browser settings), and iOS (web-push needs an
 * INSTALLED PWA, 16.4+). Renders nothing when push isn't configured (byte-identical).
 */
export function PushToggle() {
  const t = useTranslations('push')
  const [ready, setReady] = useState(false)
  const [supported, setSupported] = useState(true)
  const [configured, setConfigured] = useState(true)
  const [subscribed, setSubscribed] = useState(false)
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default')
  const [iosHint, setIosHint] = useState(false)
  const [prefs, setPrefs] = useState<Record<Cat, boolean>>({ operational: true, schedule: true, informational: true })
  const [pending, start] = useTransition()

  useEffect(() => {
    setSupported(pushSupported())
    setConfigured(pushConfigured())
    setPerm(permissionState())
    setIosHint(isIosSafari() && !isStandalone())
    ;(async () => {
      setSubscribed(await isSubscribed())
      setPrefs(await getPushPrefs())
      setReady(true)
    })()
  }, [])

  // Byte-identical no-op: no public VAPID key configured → the feature doesn't exist.
  if (!configured) return null

  const toggleMaster = () => start(async () => {
    if (subscribed) {
      await unsubscribeFromPush()
      setSubscribed(false)
    } else {
      const res = await subscribeToPush()
      setSubscribed(res.ok)
      setPerm(permissionState())
    }
  })

  const toggleCat = (cat: Cat) => start(async () => {
    const next = !prefs[cat]
    setPrefs((p) => ({ ...p, [cat]: next }))
    await setPushPref(cat, next)
  })

  const cats: Cat[] = ['operational', 'schedule', 'informational']

  return (
    <section data-testid="push-toggle" className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600">
            {subscribed ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{t('title')}</h3>
            <p className="mt-0.5 text-xs text-gray-500">{t('subtitle')}</p>
          </div>
        </div>
        {supported && perm !== 'denied' ? (
          pending && !ready ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" /> :
          <Switch on={subscribed} onClick={toggleMaster} disabled={pending} testid="push-master" />
        ) : null}
      </div>

      {/* Honesty: OS/browser constraints we cannot bypass. */}
      {!supported && (
        <p data-testid="push-unsupported" className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">{t('unsupported')}</p>
      )}
      {supported && iosHint && (
        <p data-testid="push-ios-hint" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{t('iosInstallHint')}</p>
      )}
      {supported && perm === 'denied' && (
        <p data-testid="push-denied" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{t('denied')}</p>
      )}

      {/* Per-category toggles — only meaningful once subscribed. */}
      {supported && subscribed && perm !== 'denied' && (
        <div className="mt-4 space-y-3 border-t pt-3" data-testid="push-categories">
          {cats.map((cat) => (
            <div key={cat} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-800">{t(`cat.${cat}`)}</p>
                <p className="text-xs text-gray-500">{t(`catDesc.${cat}`)}</p>
              </div>
              <Switch on={prefs[cat]} onClick={() => toggleCat(cat)} disabled={pending} testid={`push-cat-${cat}`} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
