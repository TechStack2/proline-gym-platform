'use client'

/**
 * G2 scope guard — a "needs connection" notice for ONLINE-ONLY surfaces
 * (payments / registrations / PT / billing). Only attendance works offline in
 * V1; everything else must surface a clear needs-connection state rather than
 * fail silently. Renders nothing while online.
 */
import { useTranslations } from 'next-intl'
import { WifiOff } from 'lucide-react'
import { useOnline } from '@/lib/offline/use-online'

/* W4 dead-RTL sweep: `locale` stays in the props contract (existing call sites
   pass it) even though the dir=rtl document now handles the layout flip. */
export function OnlineOnlyNotice({ messageKey = 'needsConnection', testid = 'needs-connection' }: {
  locale: string; messageKey?: string; testid?: string
}) {
  const t = useTranslations('offline')
  const online = useOnline()
  if (online) return null
  return (
    <div
      data-testid={testid}
      className="flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>{t(messageKey as 'needsConnection')}</span>
    </div>
  )
}
