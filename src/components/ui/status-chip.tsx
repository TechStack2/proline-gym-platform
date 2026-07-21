'use client';

/**
 * DS 2.0 §2.3 — the one status pill.
 *
 * Colour comes from `lib/status-vocabulary` (the only place a domain status picks
 * one) and the label from the `statuses` i18n namespace, so the six competing
 * conventions DA-32 catalogued collapse to one.
 *
 * Palette note (W3a): the variants wear the §2.3 end-state — the role hue at
 * TINT strength (`.tint-*`, globals.css) with the on-tint text channel that
 * lifts under html.dark. This retires the raw `bg-green-100`-family pills that
 * stayed light-pinned in dark mode (DA-25's chip class); in light the tints
 * land within a shade of the old -100 fills.
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
  success: 'tint-success',
  warning: 'tint-warning',
  danger: 'tint-danger',
  info: 'tint-info',
  neutral: 'tint-neutral',
  brand: 'tint-brand',
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
