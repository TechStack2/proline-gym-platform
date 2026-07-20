'use client';

/**
 * DS 2.0 §2.3 — the one status pill.
 *
 * Colour comes from `lib/status-vocabulary` (the only place a domain status picks
 * one) and the label from the `statuses` i18n namespace, so the six competing
 * conventions DA-32 catalogued collapse to one.
 *
 * Palette note: the variant classes are deliberately the SAME fixed status hues
 * the app already ships on its hand-rolled pills, so adopting this primitive is a
 * pixel-for-pixel swap at the call site. §1.3's promotion of the status hues to
 * `--c-success/warning/info/neutral-*` channel form (and the alpha-tint
 * refinement) is the DS2-TOKENS slice's job, not this one — doing it here would
 * bury a colour migration inside a primitive migration.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { humanizeEnum } from '@/lib/fmt';
import {
  statusEntry,
  type StatusDomain,
  type StatusVariant,
} from '@/lib/status-vocabulary';

const VARIANT: Record<StatusVariant, string> = {
  success: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
  neutral: 'bg-gray-100 text-gray-600',
  brand: 'bg-primary-50 text-primary-700',
};

const SIZE = {
  sm: 'px-2 py-0.5 text-2xs',
  md: 'px-2.5 py-0.5 text-xs',
} as const;

export type StatusChipProps = React.HTMLAttributes<HTMLSpanElement> & {
  domain: StatusDomain;
  status: string | null | undefined;
  size?: keyof typeof SIZE;
  /** Override the vocabulary's label (rare — a caller with richer context). */
  label?: string;
  /** Leading icon slot; keep it decorative. */
  icon?: React.ReactNode;
  className?: string;
  'data-testid'?: string;
};

export function StatusChip({
  domain,
  status,
  size = 'md',
  label,
  icon,
  className,
  'data-testid': testId,
  ...rest
}: StatusChipProps) {
  const t = useTranslations('statuses');
  const entry = statusEntry(domain, status);

  const text =
    label ??
    (entry.i18nKey && t.has(entry.i18nKey as never)
      ? t(entry.i18nKey as never)
      : humanizeEnum(status ?? ''));

  if (!text) return null;

  return (
    <span
      {...rest}
      data-testid={testId}
      data-status={status ?? undefined}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full font-medium',
        SIZE[size],
        VARIANT[entry.variant],
        entry.strikethrough && 'line-through decoration-2',
        className,
      )}
    >
      {icon}
      {text}
    </span>
  );
}
