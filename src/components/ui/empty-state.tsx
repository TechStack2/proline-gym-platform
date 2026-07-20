'use client';

/**
 * DS 2.0 §2.4 — the one empty state, and the calm-zero doctrine.
 *
 * DA-31: three ad-hoc tiers with padding p-5/p-6/p-8/p-10 and text in
 * gray-400/500/700, `PortalEmpty` used only by portal/coach, and staff Inbox
 * stacking four near-identical "No pending requests." cards. Notifications is the
 * exemplar this follows.
 *
 * The doctrine the primitive encodes:
 *  · `tone="calm"` (default) — a zero is a fact. Neutral ink, no alarm hue, and
 *    no live CTA to process nothing (DA-33): pass `cta` only when there is
 *    genuinely something for the user to do next.
 *  · `variant="card"` for a section that owns a card of its own; `variant="bare"`
 *    for an empty row inside an existing card — which is what most of the staff
 *    one-liners actually are.
 */

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export type EmptyStateProps = {
  /** Decorative — the primitive marks it aria-hidden. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Full dotted i18n path. `title` wins if both are given. */
  titleKey?: string;
  title?: React.ReactNode;
  hintKey?: string;
  hint?: React.ReactNode;
  /** Only when there is a real next action. A zero is not an action. */
  cta?: React.ReactNode;
  tone?: 'calm';
  variant?: 'card' | 'bare';
  className?: string;
  'data-testid'?: string;
};

export function EmptyState({
  icon: Icon,
  titleKey,
  title,
  hintKey,
  hint,
  cta,
  variant = 'card',
  className,
  'data-testid': testId,
}: EmptyStateProps) {
  const t = useTranslations();
  const heading = title ?? (titleKey ? t(titleKey as never) : null);
  const supporting = hint ?? (hintKey ? t(hintKey as never) : null);

  return (
    <div
      data-testid={testId}
      className={cn(
        'text-center',
        variant === 'card'
          ? 'rounded-2xl border border-gray-100 bg-white p-8 shadow-sm'
          : 'py-6',
        className,
      )}
    >
      {Icon && <Icon className="mx-auto mb-3 h-8 w-8 text-gray-300" aria-hidden="true" />}
      {heading && <p className="text-sm text-gray-500">{heading}</p>}
      {supporting && <p className="mt-1 text-xs text-gray-400">{supporting}</p>}
      {cta && <div className="mt-4 flex justify-center">{cta}</div>}
    </div>
  );
}
