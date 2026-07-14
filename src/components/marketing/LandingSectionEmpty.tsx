import { cn } from '@/lib/utils';
import { ImageOff } from 'lucide-react';

/**
 * M2-C GALLERY — the tasteful empty state for a per-gym landing image section
 * (Champions / Gallery / Affiliations) on a NON-DEFAULT gym that has no rows yet.
 * The built-in Proline photos are demo content shown ONLY on the default gym
 * (slug === DEFAULT_GYM_SLUG); every other gym renders this instead — the section
 * still appears (heading + subtitle), but with a muted placeholder, NEVER Proline's
 * athletes/logos. Dark + RTL safe. Server component (the sections are server-rendered).
 */
export function LandingSectionEmpty({
  id,
  bgClass,
  compact = false,
  title,
  subtitle,
  emptyLabel,
  isRTL,
}: {
  /** The section anchor id (`champions` | `gallery` | `affiliations`). */
  id: string;
  bgClass: string;
  /** Affiliations uses a shorter vertical rhythm. */
  compact?: boolean;
  title: string;
  subtitle?: string;
  emptyLabel: string;
  isRTL: boolean;
}) {
  return (
    <section id={id} className={cn(bgClass, compact ? 'py-14 lg:py-16' : 'py-20 lg:py-28')}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <h2 className={cn('font-display text-3xl sm:text-4xl font-bold text-white')}>{title}</h2>
          {subtitle && <p className="mx-auto mt-3 max-w-2xl text-gray-400">{subtitle}</p>}
        </div>
        <div
          data-testid={`landing-${id}-empty`}
          className="mx-auto flex max-w-md flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center"
        >
          <ImageOff className="h-6 w-6 text-white/25" />
          <p className={cn('text-sm text-white/40', isRTL && 'font-arabic')}>{emptyLabel}</p>
        </div>
      </div>
    </section>
  );
}
