'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type NativeHeaderProps = {
  title: string;
  locale: string;
  role?: string;
  rightActions?: React.ReactNode;
  onBack?: () => void;
  variant?: 'large' | 'compact';
};

const roleLabels: Record<string, { en: string; ar: string }> = {
  owner: { en: 'Owner', ar: 'مالك' },
  head_coach: { en: 'Head Coach', ar: 'مدرب رئيسي' },
  coach: { en: 'Coach', ar: 'مدرب' },
  receptionist: { en: 'Reception', ar: 'استقبال' },
  student: { en: 'Member', ar: 'عضو' },
  parent: { en: 'Parent', ar: 'ولي أمر' },
  external_coach: { en: 'Ext. Coach', ar: 'مدرب خارجي' },
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
  rightActions,
  onBack,
  variant = 'large',
}: NativeHeaderProps) {
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
        // When sentinel is not intersecting, the title has scrolled past
        setIsCollapsed(!entry.isIntersecting);
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
    ? isRTL
      ? roleLabels[role]?.ar ?? role
      : roleLabels[role]?.en ?? role
    : null;
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
              aria-label={isRTL ? 'رجوع' : 'Back'}
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
                isCollapsed ? 'opacity-100' : 'opacity-0'
              )}
            >
              {title}
            </h1>
          )}
        </div>

        <div className="flex items-center gap-1">{rightActions}</div>
      </div>

      {/* Role badge row — shown below top bar */}
      {role && (
        <div className="px-4 pb-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5',
              'px-2.5 py-1 rounded-full',
              'text-xs font-medium text-white',
              'shadow-sm'
            )}
            style={{ backgroundColor: roleDotColor ? undefined : '#6b7280' }}
          >
            {roleDotColor && (
              <span
                className={cn('h-2 w-2 rounded-full bg-white/60')}
                aria-hidden="true"
              />
            )}
            <span className="leading-none">{roleLabel}</span>
          </span>
        </div>
      )}

      {/* Large title */}
      <div
        className={cn(
          'px-4 pb-3',
          variant === 'large' ? 'block' : 'hidden'
        )}
      >
        <h1
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
