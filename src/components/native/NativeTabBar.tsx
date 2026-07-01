'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

export type TabItem = {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  label?: string;
  path: string;
  badge?: number;
};

export type NativeTabBarProps = {
  tabs: TabItem[];
  locale: string;
  basePath?: string;
  variant?: 'default' | 'compact';
  onTabClick?: (key: string) => void;
};

export function NativeTabBar({
  tabs,
  locale,
  basePath = '',
  variant = 'default',
  onTabClick,
}: NativeTabBarProps) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const [animatingTab, setAnimatingTab] = useState<string | null>(null);
  const isRTL = locale === 'ar';

  const handleTabClick = useCallback((key: string) => {
    setAnimatingTab(key);
    setTimeout(() => setAnimatingTab(null), 200);
    onTabClick?.(key);
  }, [onTabClick]);

  return (
    <>
      {/* Inline keyframe injection — safe for App Router since it uses dangerouslySetInnerHTML */}
      <style
        key="tab-bounce-keyframes"
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes tab-bounce {
              0% { transform: scale(1); }
              40% { transform: scale(0.9); }
              70% { transform: scale(1.05); }
              100% { transform: scale(1); }
            }
            .animate-tab-bounce {
              animation: tab-bounce 200ms ease-out;
            }
          `,
        }}
      />

      {/* Mobile bottom tab bar — hidden on desktop (md and up) */}
      <nav
        role="tablist"
        aria-label={t('dashboard')}
        dir={isRTL ? 'rtl' : 'ltr'}
        className={cn(
          'md:hidden fixed bottom-0 inset-x-0 z-50',
          'bg-white/80 backdrop-blur-xl border-t border-white/20',
          'pb-[env(safe-area-inset-bottom,0px)]',
          'flex items-stretch',
          'shadow-[0_-1px_3px_rgba(0,0,0,0.05)]'
        )}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const fullPath = `/${locale}${tab.path}`;
          const isHashLink = tab.path.startsWith('#');
          const isActive =
            !isHashLink &&
            (pathname === fullPath ||
              (tab.path !== basePath && pathname.startsWith(fullPath)));

          // PWA-MOBILE-UX #2: on Pro-Max-class widths (≥420px — 14/15/16 Pro Max is
          // ~430 CSS px, Plus ~428) each flex-1 tab is much wider, so the fixed
          // 22px icon / 10px label looked tiny. Scale both up at that breakpoint
          // (the bar stays md:hidden, so this only affects phones). Safe-area kept
          // by the nav's pb-[env(safe-area-inset-bottom)].
          const tabClassName = cn(
            'flex flex-1 flex-col items-center justify-center gap-1 min-[420px]:gap-1.5',
            'py-2 min-[420px]:py-2.5 px-1 min-h-[44px] min-[420px]:min-h-[52px] min-w-[44px]',
            'text-xs font-medium transition-colors duration-200',
            'touch-manipulation select-none',
            isActive
              ? 'text-[var(--shell-accent,#cd1419)]'
              : 'text-gray-400 hover:text-gray-600'
          );

          if (isHashLink) {
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-controls={`tabpanel-${tab.key}`}
                onClick={() => handleTabClick(tab.key)}
                className={tabClassName}
              >
                <div
                  className={cn(
                    'relative flex items-center justify-center',
                    animatingTab === tab.key && 'animate-tab-bounce'
                  )}
                >
                  <Icon className="h-[22px] w-[22px] min-[420px]:h-[27px] min-[420px]:w-[27px]" aria-hidden="true" />
                </div>
                {variant === 'default' && (
                  <span className="text-[0.625rem] leading-none truncate max-w-full">
                    {(t(tab.key as any) as any) || tab.label || tab.key}
                  </span>
                )}
              </button>
            );
          }

          return (
            <Link
              key={tab.key}
              href={fullPath}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.key}`}
              onClick={() => handleTabClick(tab.key)}
              className={tabClassName}
            >
              <div
                className={cn(
                  'relative flex items-center justify-center',
                  animatingTab === tab.key && 'animate-tab-bounce'
                )}
              >
                <Icon className="h-[22px] w-[22px] min-[420px]:h-[27px] min-[420px]:w-[27px]" aria-hidden="true" />
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-[#cd1419] text-white text-[10px] font-bold leading-none">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </div>

              {variant === 'default' && (
                <span className="text-[0.625rem] min-[420px]:text-[0.8125rem] leading-none truncate max-w-full">
                  {(t(tab.key as any) as any) || tab.label || tab.key}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Desktop sidebar-style tab bar — visible on md and up */}
      <nav
        role="tablist"
        aria-label={t('dashboard')}
        dir={isRTL ? 'rtl' : 'ltr'}
        className={cn(
          'hidden md:flex fixed inset-y-0 z-40 w-20 pt-[calc(env(safe-area-inset-top,0px)+4rem)] pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]',
          'flex-col items-center gap-1 bg-white border-r border-gray-100',
          isRTL ? 'right-0 border-l' : 'left-0'
        )}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const fullPath = `/${locale}${tab.path}`;
          const isHashLink = tab.path.startsWith('#');
          const isActive =
            !isHashLink &&
            (pathname === fullPath ||
              (tab.path !== basePath && pathname.startsWith(fullPath)));

          const tabClassName = cn(
            'flex flex-col items-center justify-center gap-0.5 w-[68px] py-2 rounded-xl',
            'text-[10px] font-medium transition-colors duration-200',
            'touch-manipulation select-none',
            isActive
              ? 'text-[var(--shell-accent,#cd1419)] bg-black/5'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
          );

          if (isHashLink) {
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-controls={`tabpanel-dsk-${tab.key}`}
                onClick={() => handleTabClick(tab.key)}
                className={tabClassName}
              >
                <Icon className="h-6 w-6" aria-hidden="true" />
                <span className="leading-none truncate max-w-full">
                  {(t(tab.key as any) as any) || tab.label || tab.key}
                </span>
              </button>
            );
          }

          return (
            <Link
              key={tab.key}
              href={fullPath}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-dsk-${tab.key}`}
              onClick={() => handleTabClick(tab.key)}
              className={tabClassName}
            >
              <Icon className="h-6 w-6" aria-hidden="true" />
              <span className="leading-none truncate max-w-full">
                {(t(tab.key as any) as any) || tab.label || tab.key}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
