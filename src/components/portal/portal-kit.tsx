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
      data-testid="portal-shell"
      className={cn(
        // DS 2.0 §4.1 (W2a): the desktop content grid — max 1200px, centred in
        // the space beside the rail, 24px gutters. Below md it is the mobile
        // column it always was.
        'mx-auto w-full max-w-[1200px] md:px-6 md:py-2',
        'pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-6',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * DS 2.0 §4.2 Rule 1 — the mobile card stack becomes main (~2/3, the primary
 * flow in its mobile order) + aside (~1/3, glanceables) at ≥1024px. At 768–1023
 * the grid stays single-column (wider cards) — only the rail is gained.
 */
export function DeskGrid({
  main,
  aside,
  className,
  gap = 'space-y-4',
  asideFirst = false,
}: {
  main: React.ReactNode
  aside: React.ReactNode
  className?: string
  /** The stack rhythm inside each column (match the page's mobile spacing). */
  gap?: string
  /**
   * When the aside's content precedes the main flow on MOBILE (filters/controls
   * above a list), render it first in the DOM (mobile order unchanged) and pin
   * it to the aside column with explicit grid placement at lg.
   */
  asideFirst?: boolean
}) {
  const mainEl = (
    <div className={cn('min-w-0 lg:col-span-2 lg:col-start-1 lg:row-start-1', !asideFirst ? '' : 'mt-4 lg:mt-0', gap)}>
      {main}
    </div>
  )
  const asideEl = (
    <div className={cn('min-w-0 lg:col-start-3 lg:row-start-1', asideFirst ? '' : 'mt-4 lg:mt-0', gap)}>
      {aside}
    </div>
  )
  return (
    <div className={cn('lg:grid lg:grid-cols-3 lg:items-start lg:gap-6', className)}>
      {asideFirst ? (
        <>
          {asideEl}
          {mainEl}
        </>
      ) : (
        <>
          {mainEl}
          {asideEl}
        </>
      )}
    </div>
  )
}

/**
 * The portal card — the documented `rounded-2xl` anatomy, composed over the
 * ui/* <Card>. A caller's own `data-testid` (self-view, portal-waiver, …) wins;
 * absent one, it falls back to `portal-card` so the kit's ui/*-component render
 * is assertable. Remaining `...props` still spread to the underlying div.
 */
export function PortalCard({
  className,
  children,
  'data-testid': testid,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { 'data-testid'?: string }) {
  return (
    <Card
      data-testid={testid ?? 'portal-card'}
      className={cn('rounded-2xl border-gray-100 p-5 shadow-elevation-1', className)}
      {...props}
    >
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
        {Icon && <Icon data-testid="portal-brand" className="h-4 w-4 shrink-0 text-primary-700" />}
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
