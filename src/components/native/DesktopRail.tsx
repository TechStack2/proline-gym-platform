'use client';

/**
 * DS 2.0 §4.1 — the first-class desktop rail (Decision №2, RULED 2026-07-20).
 *
 * One rail for every shell, fed from the shell's SINGLE nav config (§4.4) — the
 * same source as the mobile tab bar, so an entry cannot exist in one form factor
 * and not the other. Two states, driven by the shell root's `--rail-w` token
 * (the ONE token the rail's width and the content offset both consume, §4.1's
 * layering law):
 *   · 768–1023  → icon-only (72px)
 *   · ≥1024     → expanded + labeled (232px)
 * Positioning is LOGICAL-side only (`start-0`, `border-e`) — Arabic mirrors for
 * free and wrong-side-margin bugs are unwritable (§4.1). Below 768 the rail is
 * not shown (the mobile tab bar owns navigation — XOR, never both).
 *
 * Active entry = brand-soft background + brand text; the coach shell keeps its
 * role hue per WL-CHROME (§4.4 boundary), passed via `accent="shell"`.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { ShellNavEntry } from '@/lib/nav/shell-nav';

export type DesktopRailProps = {
  items: ShellNavEntry[];
  locale: string;
  /** The shell's landing route, so it does not match as a prefix of every child. */
  basePath?: string;
  /**
   * `brand` (default) = brand-soft bg + brand text (portal/staff).
   * `shell` = the role hue (--shell-accent) — the coach's graphite, per WL-CHROME.
   */
  accent?: 'brand' | 'shell';
  /** Shell identity label key in `common` (shellMember / shellCoach / shellStaff). */
  shellLabelKey?: string;
  /**
   * The shell this rail belongs to. The expanded rail's identity chip carries
   * the SAME `shell-badge`/`data-shell` contract the mobile header's badge does
   * (testid-stability: the shell badge stays the shell badge on every form
   * factor — ax1/on1 assert it at desktop).
   */
  shell?: 'staff' | 'coach' | 'portal';
};

function RailBadge({ count }: { count: number }) {
  return (
    <span className="flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-primary-700 px-1 text-[10px] font-bold leading-none text-primary-foreground">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function DesktopRail({
  items,
  locale,
  basePath = '',
  accent = 'brand',
  shellLabelKey,
  shell,
}: DesktopRailProps) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');

  const isActive = useCallback(
    (path: string) => {
      const full = `/${locale}${path}`;
      return pathname === full || (path !== basePath && pathname.startsWith(full));
    },
    [locale, pathname, basePath],
  );

  return (
    <nav
      aria-label={t('dashboard')}
      data-testid="desktop-rail"
      className={cn(
        // §4.1: fixed, full height, logical start side, z-40, width = the token.
        'fixed inset-y-0 start-0 z-40 hidden w-[var(--rail-w)] md:flex',
        'flex-col border-e border-gray-100 bg-white',
        'pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-[calc(env(safe-area-inset-top,0px)+1rem)]',
      )}
    >
      {/* Shell identity chip — expanded rail only (the icon rail has no room). */}
      {shellLabelKey && (
        <div className="mb-2 hidden px-4 lg:block">
          <span
            data-testid="shell-badge"
            data-shell={shell}
            className="inline-flex items-center rounded-full bg-[color:var(--surface)] px-2.5 py-1 text-2xs font-bold uppercase tracking-wider text-white"
          >
            {tCommon(shellLabelKey as never)}
          </span>
        </div>
      )}

      <ul className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 lg:px-3">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <li key={item.key}>
              <Link
                href={`/${locale}${item.path}`}
                data-testid={`rail-${item.key}`}
                aria-current={active ? 'page' : undefined}
                title={t(item.key as never)}
                className={cn(
                  'flex items-center rounded-xl transition-colors duration-200',
                  // Icon rail (md): a centred square target. Expanded (lg): a row.
                  'h-12 justify-center lg:h-auto lg:justify-start lg:gap-3 lg:px-3 lg:py-2.5',
                  'text-sm font-medium touch-manipulation select-none',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--shell-accent)]',
                  active
                    ? accent === 'shell'
                      ? 'bg-gray-100 font-bold text-[color:var(--shell-accent)]'
                      : 'bg-primary-50 font-bold text-primary-700'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700',
                )}
              >
                <span className="relative">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                  {/* Icon-rail badge: pinned to the icon (no label row exists). */}
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute -end-2 -top-1.5 lg:hidden">
                      <RailBadge count={item.badge} />
                    </span>
                  )}
                </span>
                <span className="hidden min-w-0 flex-1 truncate lg:inline">{t(item.key as never)}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="hidden lg:inline-flex">
                    <RailBadge count={item.badge} />
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
