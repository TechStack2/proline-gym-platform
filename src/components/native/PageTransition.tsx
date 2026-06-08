'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export type PageTransitionProps = {
  children: React.ReactNode;
  direction: 'forward' | 'back';
  isActive: boolean;
  locale?: string;
};

export function PageTransition({
  children,
  direction,
  isActive,
  locale = 'en',
}: PageTransitionProps) {
  const isRTL = locale === 'ar';
  const [isVisible, setIsVisible] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Check for prefers-reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);

    const handler = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Trigger entrance animation on mount
  useEffect(() => {
    if (isActive) {
      // Small delay to allow CSS transition to work
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    } else {
      setIsVisible(false);
    }

    return () => {
      setIsVisible(false);
    };
  }, [isActive]);

  if (prefersReducedMotion) {
    return <div className="w-full">{children}</div>;
  }

  // RTL swaps the directions:
  // LTR: forward = slide from right, back = slide from left
  // RTL: forward = slide from left, back = slide from right
  const getTranslateClass = () => {
    if (!isVisible) {
      if (direction === 'forward') {
        return isRTL ? '-translate-x-full' : 'translate-x-full';
      }
      return isRTL ? 'translate-x-full' : '-translate-x-full';
    }
    return 'translate-x-0';
  };

  return (
    <div className="w-full overflow-hidden">
      <div
        className={cn(
          'w-full',
          'transition-all duration-300 ease-out',
          'opacity-0',
          isVisible && 'opacity-100',
          getTranslateClass()
        )}
        style={{
          transitionProperty: 'transform, opacity',
          transitionDuration: '300ms',
          transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
