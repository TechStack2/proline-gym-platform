'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type NativeHeaderProps = {
  title: string;
  locale: string;
  role?: string;
  /** AX-1 per-shell identity — accent bar + labeled badge (per-ROLE platform tokens). */
  shell?: 'staff' | 'coach' | 'portal';
  rightActions?: React.ReactNode;
  onBack?: () => void;
  variant?: 'large' | 'compact';
  /**
   * PORTAL-SHELL: in single-shell layouts (portal/coach) the NativeHeader renders
   * on BOTH breakpoints, so its large title echoes the desktop content H1. Set
   * this so the chrome title is MOBILE-ONLY (large + collapsed title `md:hidden`),
   * letting the page's `hidden md:block` H1 own the desktop title — matching the
   * (dashboard) shell (whose NativeHeader already lives in a `md:hidden` shell, so
   * this is a no-op there). Default keeps the title at all breakpoints.
   */
  titleMobileOnly?: boolean;
};

// design-system.md "Per-shell accents": staff=brand red, coach=gold-on-black,
// portal=cool teal. Tenant-clean: keyed by ROLE-shell, never by gym.
const SHELL_STYLE: Record<'staff' | 'coach' | 'portal', { bar: string; badge: string; labelKey: string }> = {
  staff: { bar: '#cd1419', badge: 'bg-[#cd1419] text-white', labelKey: 'shellStaff' },
  coach: { bar: '#d4af37', badge: 'bg-[#111111] text-[#d4af37]', labelKey: 'shellCoach' },
  portal: { bar: '#0e7490', badge: 'bg-[#0e7490] text-white', labelKey: 'shellMember' },
};

const roleLabels: Record<string, { en: string; ar: string; fr: string }> = {
  owner: { en: 'Owner', ar: 'مالك', fr: 'Propriétaire' },
  head_coach: { en: 'Head Coach', ar: 'مدرب رئيسي', fr: 'Entraîneur en chef' },
  coach: { en: 'Coach', ar: 'مدرب', fr: 'Entraîneur' },
  receptionist: { en: 'Reception', ar: 'استقبال', fr: 'Réception' },
  student: { en: 'Member', ar: 'عضو', fr: 'Membre' },
  parent: { en: 'Parent', ar: 'ولي أمر', fr: 'Parent' },
  external_coach: { en: 'Ext. Coach', ar: 'مدرب خارجي', fr: 'Entraîneur ext.' },
};

const roleBadgeColors: Record<string, string> = {
  owner: 'bg-[#eab308]',
  head_coach: 'bg-[#3b82f6]',
  receptionist: 'bg-[#22c55e]',
  coach: 'bg-[#a855f7]',
  student: 'bg-gray-400',
  parent: 'bg-orange-400',
  external_coach: 'bg-teal-400',
};

export function NativeHeader({
  title,
  locale,
  role,
  shell,
  rightActions,
  onBack,
  variant = 'large',
  titleMobileOnly = false,
}: NativeHeaderProps) {
  const tCommon = useTranslations('common');
  const isRTL = locale === 'ar';
  const [isCollapsed, setIsCollapsed] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only observe scroll collapse on large variant
    if (variant !== 'large') return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // When sentinel is not intersecting, the title has scrolled past.
        // RESPONSIVE-CSP-HARDENING (BUG 1 root cause): EQUALITY-GUARD the setState.
        // On a mobile-resize the day-view's (formerly CSP-stripped) inline-style
        // cells thrash layout near this sentinel → the observer fires repeatedly at
        // the threshold; an unguarded setIsCollapsed(true↔false) then drives an
        // infinite render loop that FREEZES the tab. Bail when unchanged.
        const collapsed = !entry.isIntersecting;
        setIsCollapsed((prev) => (prev === collapsed ? prev : collapsed));
      },
      {
        root: null,
        threshold: 0,
        rootMargin: '0px 0px 0px 0px',
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [variant]);

  const BackIcon = isRTL ? ChevronRight : ChevronLeft;
  const roleLabel = role
    ? (roleLabels[role]?.[locale as 'en' | 'ar' | 'fr'] ?? roleLabels[role]?.en ?? role)
    : null;
  const shellStyle = shell ? SHELL_STYLE[shell] : null;
  const roleDotColor = role ? roleBadgeColors[role] ?? 'bg-gray-400' : null;

  return (
    <header
      className={cn(
        'sticky top-0 z-30',
        'bg-white/90 backdrop-blur-md',
        'pt-[env(safe-area-inset-top,0px)]',
        'border-b border-gray-100'
      )}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* AX-1 shell accent bar. BUG 3: was style={{ backgroundColor }} (SSR'd →
          stripped by the prod strict style-src CSP). --shell-accent is set by the
          shell root's shell-{staff,portal,coach} class (globals.css) and equals
          SHELL_STYLE[shell].bar, so a var'd class is CSP-safe + identical. */}
      {shellStyle && <div className="h-1 w-full bg-[color:var(--shell-accent)]" aria-hidden />}
      {/* Top row: back button + right actions + collapsed title */}
      <div className="flex items-center justify-between px-4 h-12">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className={cn(
                'flex items-center justify-center',
                'min-h-[44px] min-w-[44px]',
                'rounded-full text-gray-600 hover:bg-gray-100',
                'transition-colors'
              )}
              aria-label={tCommon('back')}
            >
              <BackIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          )}

          {/* Collapsed title — shown when scrolled past large title */}
          {variant === 'large' && isCollapsed && (
            <h1
              className={cn(
                'text-lg font-semibold text-[#252525] truncate',
                'transition-opacity duration-200',
                isCollapsed ? 'opacity-100' : 'opacity-0',
                titleMobileOnly && 'md:hidden'
              )}
            >
              {title}
            </h1>
          )}
        </div>

        <div className="flex items-center gap-1">{rightActions}</div>
      </div>

      {/* Shell + role badge row */}
      {(shellStyle || role) && (
        <div className="flex items-center gap-1.5 px-4 pb-2">
          {shellStyle && (
            <span
              data-testid="shell-badge"
              data-shell={shell}
              className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-2xs font-bold uppercase tracking-wider shadow-sm', shellStyle.badge)}
            >
              {tCommon(shellStyle.labelKey as Parameters<typeof tCommon>[0])}
            </span>
          )}
          {role && (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white shadow-sm',
                roleDotColor ?? 'bg-gray-400', // pre-AX-1 this class was computed but never APPLIED
              )}
            >
              <span className="h-2 w-2 rounded-full bg-white/60" aria-hidden="true" />
              <span className="leading-none">{roleLabel}</span>
            </span>
          )}
        </div>
      )}

      {/* Large title */}
      <div
        className={cn(
          'px-4 pb-3',
          variant === 'large' ? 'block' : 'hidden',
          titleMobileOnly && 'md:hidden'
        )}
      >
        <h1
          data-testid="native-large-title"
          className={cn(
            'text-3xl font-bold text-[#252525] leading-tight',
            'transition-all duration-200',
            isCollapsed ? 'opacity-0 max-h-0 overflow-hidden' : 'opacity-100 max-h-20'
          )}
        >
          {title}
        </h1>
      </div>

      {/* Compact title — always visible */}
      {variant === 'compact' && (
        <div className="px-4 pb-3">
          <h1 className="text-xl font-bold text-[#252525] leading-tight">
            {title}
          </h1>
        </div>
      )}

      {/* Sentinel element for Intersection Observer */}
      <div
        ref={sentinelRef}
        className="h-px w-full"
        aria-hidden="true"
      />
    </header>
  );
}
