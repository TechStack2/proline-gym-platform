'use client'

/**
 * G2 — attendance offline/pending banner. Shows when offline (marks queue
 * locally) or while a pending queue drains. Hidden when online with nothing
 * pending. Localized, RTL-aware, design-system.
 */
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { CloudOff, RefreshCw } from 'lucide-react'

export function OfflineBanner({ online, pending, locale, testid = 'attendance-offline-banner' }: {
  online: boolean; pending: number; locale: string; testid?: string
}) {
  const t = useTranslations('offline')
  if (online && pending === 0) return null
  const isRTL = locale === 'ar'
  const offline = !online
  return (
    <div
      data-testid={testid}
      data-online={online}
      data-pending={pending}
      className={cn(
        'rounded-xl px-3 py-2 text-sm font-medium',
        offline ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-700',
        isRTL && 'text-right',
      )}
    >
      <div className="flex items-center gap-2">
        {offline ? <CloudOff className="h-4 w-4 shrink-0" /> : <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />}
        <span>{offline ? t('offlineNPending', { n: pending }) : t('syncingNPending', { n: pending })}</span>
      </div>
      {/* OFF-4: state the offline scope honestly — the front desk works offline
          (attendance, cash, leads); everything else needs a connection. */}
      {offline && (
        <p data-testid="offline-scope" className="mt-1 text-xs font-normal text-amber-700/90">
          {t('scope')}
        </p>
      )}
    </div>
  )
}
