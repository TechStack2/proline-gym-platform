'use client'

/**
 * OFF-1 — the front-desk offline layer, mounted ONCE in the (dashboard) layout
 * so it covers BOTH shells: the mobile `DashboardLayoutClient` (NativeTabBar) AND
 * the desktop `Sidebar` + `Header`. Before OFF-1 the offline UX lived only on the
 * attendance/money pages and the desktop dashboard never engaged it at all — so
 * the front-desk LAPTOP (the whole point of the offline chapter) had no offline
 * affordance. This gives every front-desk surface a consistent offline/syncing
 * indicator on every viewport, plus the installable-PWA prompt. Reuses the
 * existing components/hooks — no new caching, no new offline reads/writes.
 */
import { useTranslations } from 'next-intl'
import { useOnline, usePendingAttendance } from '@/lib/offline/use-online'
import { OfflineBanner } from '@/components/offline/offline-banner'
import { PwaInstallPrompt } from '@/components/pwa/pwa-install-prompt'

export function FrontDeskOfflineLayer({ locale }: { locale: string }) {
  const online = useOnline()
  const { count } = usePendingAttendance()
  const t = useTranslations('pwa')

  return (
    <>
      {/* Consistent offline / syncing banner. Floats clear of the mobile bottom
          tab bar and (on md+) sits at the bottom with no bar to clear. Visible on
          every front-desk surface, both viewports. */}
      {(!online || count > 0) && (
        <div
          className="fixed inset-x-0 z-[60] flex justify-center px-3 pointer-events-none
                     bottom-[calc(4rem+env(safe-area-inset-bottom,0px)+0.5rem)] md:bottom-4"
        >
          <div className="pointer-events-auto">
            <OfflineBanner online={online} pending={count} locale={locale} testid="shell-offline-banner" />
          </div>
        </div>
      )}

      {/* Installable-PWA affordance — desktop Chrome "Install app" + mobile A2HS.
          Install-only here (the banner above owns the offline state); renders
          nothing until the browser fires `beforeinstallprompt` (i.e. installable
          + not already standalone + not dismissed). */}
      <PwaInstallPrompt
        locale={locale}
        showOfflineBar={false}
        dictionaries={{
          installTitle: t('installTitle'),
          installDescription: t('installDescription'),
          installButton: t('installButton'),
          dismissButton: t('dismissButton'),
          offlineTitle: t('offlineTitle'),
          offlineDescription: t('offlineDescription'),
          backOnline: t('backOnline'),
        }}
      />
    </>
  )
}
