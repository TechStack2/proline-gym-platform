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
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useOnline, usePendingAttendance } from '@/lib/offline/use-online'
import { OfflineBanner } from '@/components/offline/offline-banner'
import { primeDeskMirror, scheduleDeskWarm } from '@/lib/offline/prime'

export function FrontDeskOfflineLayer({ locale }: { locale: string }) {
  const online = useOnline()
  const { count } = usePendingAttendance()
  const router = useRouter()

  // OFF-4 (OFFLINE-DOOR): make the offline layer REACHABLE + PRIMED from login,
  // not only on a desk visit. This layer mounts once for every (dashboard) page,
  // so a front-desk user who lands on /today (never opens /desk) still gets:
  //   • the Dexie mirror primed (offline reads work), and
  //   • the /desk shell warmed into the SW cache (a cold offline launch hydrates).
  // Deferred to idle so it never contends with the page's initial render/hydration
  // (the reason the prime was originally kept OFF the layout); throttled in prime.ts.
  useEffect(() => {
    const prefetch = (url: string) => router.prefetch(url)
    const kick = () => { primeDeskMirror(); scheduleDeskWarm(locale, prefetch) }
    const idle = (cb: () => void) =>
      typeof (window as any).requestIdleCallback === 'function'
        ? (window as any).requestIdleCallback(cb, { timeout: 3_000 })
        : window.setTimeout(cb, 1_500)
    const handle = idle(kick)
    // Re-prime opportunistically: back online, or the tab returns to the foreground.
    const onOnline = () => kick()
    const onVisible = () => { if (document.visibilityState === 'visible') primeDeskMirror() }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (typeof (window as any).cancelIdleCallback === 'function') (window as any).cancelIdleCallback(handle)
      else window.clearTimeout(handle as number)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [locale, router])

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

      {/* PWA-INSTALL: the install affordance is now the platform-aware, dismissible
          `InstallAppCard` on the front-desk hub (Today) — it consolidates the old
          Chrome/Edge-only bottom-bar prompt (which did strictly less) so the two
          never double up. This layer keeps only the offline-state banner above. */}
    </>
  )
}
