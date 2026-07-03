'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export type PageTransitionProps = {
  children: React.ReactNode;
  direction: 'forward' | 'back';
  isActive: boolean;
  locale?: string;
  /** DOUBLE-SHELL: render as a static passthrough at md+ (no transform/transition).
   *  The slide keeps a persistent `translate-x-0`, and ANY transform makes this div
   *  a containing block for position:fixed descendants — mis-centering inline fixed
   *  modals. The desktop dashboard never had the transition (it lived only in the
   *  md:hidden mobile shell), so the collapsed single shell must not add it there. */
  desktopStatic?: boolean;
};

export function PageTransition({
  children,
  direction,
  isActive,
  locale = 'en',
  desktopStatic = false,
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
    <div className={cn('w-full overflow-hidden', desktopStatic && 'md:overflow-visible')}>
      <div
        className={cn(
          'w-full',
          // CSP-SWEEP: transition timing as classes, not an inline style the prod
          // CSP strips (preserves the custom easing; transform+opacity only).
          'transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
          'opacity-0',
          isVisible && 'opacity-100',
          getTranslateClass(),
          // DOUBLE-SHELL: at md+ the wrapper is inert — no transform (no fixed-modal
          // containing block), no fade (desktop never had one).
          desktopStatic && 'md:transform-none md:opacity-100 md:transition-none'
        )}
      >
        {children}
      </div>
    </div>
  );
}
