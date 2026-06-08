'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

export type SwipeableSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  snapPoints?: number[];
  locale?: string;
};

export function SwipeableSheet({
  isOpen,
  onClose,
  title,
  children,
  snapPoints = [50, 100],
  locale = 'en',
}: SwipeableSheetProps) {
  const isRTL = locale === 'ar';
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const [currentSnap, setCurrentSnap] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const startYRef = useRef(0);
  const sheetHeightRef = useRef(0);
  const snapPointRef = useRef(snapPoints[0] ?? 50);

  // Sort snap points descending so highest = most expanded
  const sortedSnaps = [...snapPoints].sort((a, b) => b - a);

  const findClosestSnap = useCallback(
    (currentPercent: number): number => {
      let closest = sortedSnaps[0];
      let minDiff = Infinity;
      for (const snap of sortedSnaps) {
        const diff = Math.abs(snap - currentPercent);
        if (diff < minDiff) {
          minDiff = diff;
          closest = snap;
        }
      }
      return closest;
    },
    [sortedSnaps]
  );

  // Initialize sheet position when opened
  useEffect(() => {
    if (isOpen) {
      const initialSnap = snapPoints[0] ?? 50;
      snapPointRef.current = initialSnap;
      setCurrentSnap(initialSnap);
      setDragOffset(0);
      setIsAnimating(false);

      // Lock body scroll
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, snapPoints]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleDragStart = useCallback(
    (clientY: number) => {
      setIsDragging(true);
      startYRef.current = clientY;
      sheetHeightRef.current = sheetRef.current?.offsetHeight ?? window.innerHeight;
      setIsAnimating(false);
    },
    []
  );

  const handleDragMove = useCallback(
    (clientY: number) => {
      if (!isDragging) return;
      const deltaY = clientY - startYRef.current;
      const currentSnapPercent = snapPointRef.current;
      const deltaPercent = (deltaY / sheetHeightRef.current) * 100;
      const newPercent = currentSnapPercent + deltaPercent;
      // Clamp between 0 and 100
      setDragOffset(Math.max(0, Math.min(100, newPercent)));
    },
    [isDragging]
  );

  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    setIsAnimating(true);

    const currentSnapPercent = snapPointRef.current;
    const deltaY = dragOffset - currentSnapPercent;

    // If dragged down more than 30% from current snap, dismiss or go to lower snap
    const closestSnap = findClosestSnap(dragOffset);

    // If dragged far enough down from the lowest snap, dismiss
    if (dragOffset > 80 || (currentSnapPercent === sortedSnaps[sortedSnaps.length - 1] && deltaY > 15)) {
      onClose();
      setCurrentSnap(null);
      setDragOffset(0);
      return;
    }

    // Snap to closest
    snapPointRef.current = closestSnap;
    setCurrentSnap(closestSnap);
    setDragOffset(0);

    setTimeout(() => setIsAnimating(false), 350);
  }, [isDragging, dragOffset, findClosestSnap, onClose, sortedSnaps]);

  // Touch event handlers for the drag handle
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      handleDragStart(e.touches[0].clientY);
    },
    [handleDragStart]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      handleDragMove(e.touches[0].clientY);
    },
    [handleDragMove]
  );

  const onTouchEnd = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // Mouse event handlers for desktop testing
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      handleDragStart(e.clientY);

      const handleMouseMove = (me: MouseEvent) => {
        handleDragMove(me.clientY);
      };
      const handleMouseUp = () => {
        handleDragEnd();
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [handleDragStart, handleDragMove, handleDragEnd]
  );

  if (!isOpen && !currentSnap) return null;

  // Calculate translateY based on current snap or drag
  const translateY = isDragging
    ? (100 - dragOffset) + '%'
    : currentSnap !== null
      ? (100 - currentSnap) + '%'
      : '100%';

  return (
    <div className="fixed inset-0 z-[100]" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-black/40',
          'transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Sheet'}
        className={cn(
          'absolute bottom-0 inset-x-0',
          'bg-white rounded-t-2xl',
          'shadow-[0_-4px_20px_rgba(0,0,0,0.15)]',
          'flex flex-col',
          'max-h-[95vh]',
          'pb-[env(safe-area-inset-bottom,0px)]',
          isAnimating && 'transition-transform duration-300 ease-out',
          isDragging && 'transition-none'
        )}
        style={{
          transform: `translateY(${translateY})`,
          height: currentSnap !== null ? `${currentSnap}vh` : '50vh',
        }}
      >
        {/* Drag Handle */}
        <div
          ref={dragRef}
          className={cn(
            'flex-shrink-0 flex items-center justify-center',
            'py-3 cursor-grab active:cursor-grabbing',
            'touch-manipulation select-none'
          )}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onMouseDown={onMouseDown}
          aria-label="Drag to resize or dismiss"
        >
          <span className="w-8 h-1 bg-gray-300 rounded-full mx-auto" aria-hidden="true" />
        </div>

        {/* Title */}
        {title && (
          <div className="flex-shrink-0 px-5 pb-2">
            <h2 className="text-lg font-semibold text-[#252525]">{title}</h2>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>
      </div>
    </div>
  );
}
