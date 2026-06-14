'use client'

/**
 * G2 — attendance offline/pending banner. Shows when offline (marks queue
 * locally) or while a pending queue drains. Hidden when online with nothing
 * pending. Localized, RTL-aware, design-system.
 */
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { CloudOff, RefreshCw } from 'lucide-react'

export function OfflineBanner({ online, pending, locale }: { online: boolean; pending: number; locale: string }) {
  const t = useTranslations('offline')
  if (online && pending === 0) return null
  const isRTL = locale === 'ar'
  const offline = !online
  return (
    <div
      data-testid="attendance-offline-banner"
      data-online={online}
      data-pending={pending}
      className={cn(
        'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium',
        offline ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-700',
        isRTL && 'flex-row-reverse text-right',
      )}
    >
      {offline ? <CloudOff className="h-4 w-4 shrink-0" /> : <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />}
      <span>{offline ? t('offlineNPending', { n: pending }) : t('syncingNPending', { n: pending })}</span>
    </div>
  )
}
