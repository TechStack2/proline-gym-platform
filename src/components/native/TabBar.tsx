'use client';

/**
 * DS 2.0 §2.2 — the SHARED bottom-tab primitive.
 *
 * Replaces the per-shell copies of NativeTabBar behaviour. W1 adopts it on the
 * staff shell only; portal/coach keep NativeTabBar until their IA lands in W2
 * (§3), so both components coexist on purpose during the transition.
 *
 * What this fixes versus NativeTabBar:
 *  · **ARIA (DA-60)** — this is NAVIGATION, not a tab panel set. `<nav>` + links
 *    with `aria-current="page"`; the `role="tablist"/"tab"` + `aria-controls`
 *    pointing at tabpanels that do not exist is gone.
 *  · **Capacity (DA-3)** — ≤5 including More, asserted (see lib/nav/tab-capacity).
 *  · **Density (Decision №1, Option B)** — 24px icons, 56pt bar, bolder active
 *    label. The ≥420px Pro-Max scale-up (PWA-MOBILE-UX #2) is retained on top:
 *    24 → 28px, so the ruling is a floor, not a regression for large phones.
 *  · **Active state (DA-45)** — colour AND weight AND a 4px top indicator bar, so
 *    the active tab is not signalled by hue alone.
 *  · **Labels (DA-3/45)** — 11px (was 10px) and `truncate` is FORBIDDEN: a label
 *    that does not fit is the wrong label, and the fix is a `nav.short.*` key,
 *    not a clipped word. Short variants are used when they exist.
 *  · **Surface (DA-23)** — opaque enough (0.95 + blur) that page content cannot
 *    bleed through and read as a false active state.
 *  · **Hide-on-scroll (Decision №1)** — see useHideOnScroll below.
 *
 * The md+ rail stays part of this primitive (§2.2); its layering/logical-side fix
 * is §4/W2 work, so it is carried over unchanged here.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { assertTabCapacity } from '@/lib/nav/tab-capacity';

export type TabBarItem = {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Route path WITHOUT the locale prefix, or `#<action>` for a sheet trigger. */
  path: string;
  badge?: number;
};

export type TabBarProps = {
  tabs: TabBarItem[];
  locale: string;
  /** Which shell this bar belongs to — used by the capacity error message. */
  shell: 'staff' | 'coach' | 'portal';
  /** The shell's landing route, so it does not match as a prefix of every child. */
  basePath?: string;
  onTabClick?: (key: string) => void;
  /**
   * CSS selector for the scroll container that drives hide-on-scroll. The staff
   * shell scrolls an inner `<main>`, not the window. Omit to use the window.
   */
  scrollSelector?: string;
  /** Keep the bar down while a sheet/dialog owns the screen (§2.2). */
  forceVisible?: boolean;
  /** Opt out of hide-on-scroll entirely (the bar stays put). */
  hideOnScroll?: boolean;
  /** Render the md+ side rail (staff uses it only in the md–lg band). */
  showRail?: boolean;
};

/**
 * §2.2 hide-on-scroll: hide on scroll DOWN, reveal on any scroll UP, at the top
 * of the container, while a sheet is open, and whenever focus lands in a field
 * (the software keyboard would otherwise shove the bar into the middle of the
 * screen). Motion is a transform only — the content's bottom padding never
 * changes, so nothing reflows. Under `prefers-reduced-motion` the behaviour is
 * disabled outright rather than merely un-animated.
 */
function useHideOnScroll(
  enabled: boolean,
  scrollSelector: string | undefined,
  forceVisible: boolean,
) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduce.matches) return;

    const target: HTMLElement | Window =
      (scrollSelector && document.querySelector<HTMLElement>(scrollSelector)) || window;
    const readY = () =>
      target === window ? window.scrollY : (target as HTMLElement).scrollTop;

    lastY.current = readY();

    const onScroll = () => {
      const y = readY();
      const delta = y - lastY.current;
      // A small dead zone keeps momentum jitter and rubber-banding from flapping
      // the bar; near the top it is always shown.
      if (Math.abs(delta) < 8) return;
      lastY.current = y;
      const next = delta > 0 && y > 48;
      setHidden((prev) => (prev === next ? prev : next));
    };
    const show = () => setHidden((prev) => (prev ? false : prev));

    target.addEventListener('scroll', onScroll, { passive: true });
    // Focus entering a field raises the keyboard on mobile → reveal.
    window.addEventListener('focusin', show);
    return () => {
      target.removeEventListener('scroll', onScroll);
      window.removeEventListener('focusin', show);
    };
  }, [enabled, scrollSelector]);

  useEffect(() => {
    if (forceVisible) setHidden(false);
  }, [forceVisible]);

  return enabled && !forceVisible && hidden;
}

function TabBadge({ count }: { count: number }) {
  return (
    <span className="absolute -top-1.5 -end-2 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-primary-700 px-1 text-[10px] font-bold leading-none text-primary-foreground">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function TabBar({
  tabs,
  locale,
  shell,
  basePath = '',
  onTabClick,
  scrollSelector,
  forceVisible = false,
  hideOnScroll = true,
  showRail = true,
}: TabBarProps) {
  assertTabCapacity(tabs, shell);

  const pathname = usePathname();
  const t = useTranslations('nav');
  const isRTL = locale === 'ar';
  const hidden = useHideOnScroll(hideOnScroll, scrollSelector, forceVisible);

  // §2.2: a short label variant wins when the config provides one. `t.has` keeps
  // the lookup safe under the §2.7 strict missing-key gate.
  const label = useCallback(
    (key: string) => (t.has(`short.${key}` as never) ? t(`short.${key}` as never) : t(key as never)),
    [t],
  );

  const isActive = useCallback(
    (path: string) => {
      if (path.startsWith('#')) return false;
      const full = `/${locale}${path}`;
      return pathname === full || (path !== basePath && pathname.startsWith(full));
    },
    [locale, pathname, basePath],
  );

  return (
    <>
      {/* ── Mobile bottom bar (<md) ── */}
      <nav
        aria-label={t('dashboard')}
        data-testid="tab-bar"
        data-hidden={hidden ? 'true' : 'false'}
        dir={isRTL ? 'rtl' : 'ltr'}
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 md:hidden',
          // DA-23: opaque enough that content cannot bleed through and read as an
          // active tab. Token-backed white → flips correctly in dark.
          'border-t border-gray-100 bg-white/95 backdrop-blur-xl',
          'shadow-[0_-1px_3px_rgba(0,0,0,0.05)]',
          'pb-[env(safe-area-inset-bottom,0px)]',
          'flex items-stretch',
          // Transform-only motion: no layout shift, and stilled for reduced motion.
          'transition-transform duration-[220ms] ease-out motion-reduce:transition-none',
          hidden ? 'translate-y-full' : 'translate-y-0',
        )}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.path);
          const isAction = tab.path.startsWith('#');
          const content = (
            <>
              {/* DA-45: the active tab carries an indicator SHAPE, not just a hue. */}
              <span
                aria-hidden
                className={cn(
                  'absolute inset-x-3 top-0 h-1 rounded-b-full transition-opacity',
                  active ? 'bg-[color:var(--shell-accent,#cd1419)] opacity-100' : 'opacity-0',
                )}
              />
              <span className="relative flex items-center justify-center">
                <Icon className="h-6 w-6 min-[420px]:h-7 min-[420px]:w-7" aria-hidden="true" />
                {tab.badge !== undefined && tab.badge > 0 && <TabBadge count={tab.badge} />}
              </span>
              {/* §2.2: NO truncate. 11px floor. Active is bolder (Option B). */}
              <span
                className={cn(
                  'max-w-full text-[11px] leading-none min-[420px]:text-[0.8125rem]',
                  active ? 'font-bold' : 'font-medium',
                )}
              >
                {label(tab.key)}
              </span>
            </>
          );

          const className = cn(
            'relative flex flex-1 flex-col items-center justify-center gap-1',
            // Option B: 56pt bar (min-h-[56px]) with 44pt+ targets.
            'min-h-[56px] min-w-[44px] px-1 py-2',
            'touch-manipulation select-none transition-colors duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--shell-accent,#cd1419)] focus-visible:ring-inset',
            active
              ? 'text-[color:var(--shell-accent,#cd1419)]'
              : 'text-gray-500 hover:text-gray-700',
          );

          return isAction ? (
            <button
              key={tab.key}
              type="button"
              data-testid={`tab-${tab.key}`}
              onClick={() => onTabClick?.(tab.key)}
              className={className}
            >
              {content}
            </button>
          ) : (
            <Link
              key={tab.key}
              href={`/${locale}${tab.path}`}
              data-testid={`tab-${tab.key}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => onTabClick?.(tab.key)}
              className={className}
            >
              {content}
            </Link>
          );
        })}
      </nav>

      {/* ── Desktop side rail (md+). Carried over from NativeTabBar unchanged;
             §4/W2 owns its layering + logical-side fix. ── */}
      {showRail && (
        <nav
          aria-label={t('dashboard')}
          data-testid="desktop-rail"
          dir={isRTL ? 'rtl' : 'ltr'}
          className={cn(
            'fixed inset-y-0 z-40 hidden w-20 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-[calc(env(safe-area-inset-top,0px)+4rem)] md:flex',
            'flex-col items-center gap-1 border-r border-gray-100 bg-white',
            isRTL ? 'right-0 border-l' : 'left-0',
          )}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab.path);
            const isAction = tab.path.startsWith('#');
            const className = cn(
              'flex w-[68px] flex-col items-center justify-center gap-0.5 rounded-xl py-2',
              'text-[10px] transition-colors duration-200',
              'touch-manipulation select-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--shell-accent,#cd1419)]',
              active
                ? 'bg-black/5 font-bold text-[color:var(--shell-accent,#cd1419)]'
                : 'font-medium text-gray-400 hover:bg-gray-50 hover:text-gray-600',
            );
            const content = (
              <>
                <Icon className="h-6 w-6" aria-hidden="true" />
                <span className="max-w-full leading-none">{label(tab.key)}</span>
              </>
            );
            return isAction ? (
              <button
                key={tab.key}
                type="button"
                data-testid={`rail-${tab.key}`}
                onClick={() => onTabClick?.(tab.key)}
                className={className}
              >
                {content}
              </button>
            ) : (
              <Link
                key={tab.key}
                href={`/${locale}${tab.path}`}
                data-testid={`rail-${tab.key}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => onTabClick?.(tab.key)}
                className={className}
              >
                {content}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
