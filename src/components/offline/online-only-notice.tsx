'use client'

/**
 * G2 scope guard — a "needs connection" notice for ONLINE-ONLY surfaces
 * (payments / registrations / PT / billing). Only attendance works offline in
 * V1; everything else must surface a clear needs-connection state rather than
 * fail silently. Renders nothing while online.
 */
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { WifiOff } from 'lucide-react'
import { useOnline } from '@/lib/offline/use-online'

export function OnlineOnlyNotice({ locale, messageKey = 'needsConnection', testid = 'needs-connection' }: {
  locale: string; messageKey?: string; testid?: string
}) {
  const t = useTranslations('offline')
  const online = useOnline()
  if (online) return null
  const isRTL = locale === 'ar'
  return (
    <div
      data-testid={testid}
      className={cn('flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600',
        isRTL && 'flex-row-reverse text-right')}
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>{t(messageKey as 'needsConnection')}</span>
    </div>
  )
}
