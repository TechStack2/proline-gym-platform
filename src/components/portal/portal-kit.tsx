import * as React from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * PORTAL-FND — the self-service portal design-system kit (coach + member).
 *
 * The staff dashboard adopted the brand design system + the ActionCard/DrillDetails
 * kit; the portals never did (owner verdict: "themeless / thin / overlapping").
 * This is the FOUNDATION — a consistent themed shell + the documented card
 * anatomy — so the portal-360 feature builds style against THIS, not vibes.
 *
 * Everything here follows `docs/design-system.md`:
 *  - card anatomy = `rounded-2xl bg-white border border-gray-100 shadow-sm`
 *    (composed over the ui/* <Card> so portals literally render via the kit);
 *  - section title = `text-sm font-semibold text-gray-900` + brand-red icon;
 *  - the per-shell accent (coach gold / member teal) is NOT touched here — it
 *    stays the shell's identity; brand red is for content accents + primary CTAs.
 */

/**
 * The shell content wrapper used by BOTH portal layouts (coach + member) — the
 * single place that makes every self-service page consistent:
 *  - a centred, max-width reading column (fixes the desktop full-bleed sprawl —
 *    a member/coach has a focused column, not the 7-workspace admin grid);
 *  - the FD-2 PWA footer fix the staff shell got but the portals never did: the
 *    mobile NativeTabBar is `fixed bottom-0`, so the last rows of every portal
 *    page hid behind it ("overlapping"). Clear it with tab-bar height + safe-area
 *    bottom padding on mobile only (md+ uses the side-rail → md:pb-0).
 */
export function PortalContent({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-3xl md:px-4',
        'pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * The portal card — the documented `rounded-2xl` anatomy, composed over the
 * ui/* <Card>. Spreads `...props` (incl. data-testid) to the underlying div so
 * existing test hooks (self-view, portal-waiver, …) keep working unchanged.
 */
export function PortalCard({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Card className={cn('rounded-2xl border-gray-100 p-4 shadow-sm', className)} {...props}>
      {children}
    </Card>
  )
}

/** Section/card header: brand-red icon + `text-sm font-semibold` title + optional right slot. */
export function PortalCardTitle({
  icon: Icon,
  children,
  right,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  right?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-2', className)}>
      <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-900">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-primary-600" />}
        <span className="truncate">{children}</span>
      </h3>
      {right}
    </div>
  )
}

/** The documented empty-state: icon → one-liner → optional single action. Centred. */
export function PortalEmpty({
  icon: Icon,
  children,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="py-8 text-center">
      {Icon && <Icon className="mx-auto mb-3 h-10 w-10 text-gray-300" aria-hidden />}
      <p className="text-sm text-gray-400">{children}</p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  )
}
