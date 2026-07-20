'use client';

/**
 * DS 2.0 §2.1 — the page-header primitive.
 *
 * Replaces the hand-rolled desktop h1s (DA-29: two competing conventions —
 * `text-2xl` on today/money/settings/schedule/inbox vs `text-3xl` on
 * students/coaches/guardians — plus drifted subtitle margins and ad-hoc action
 * rows), and carries the back affordance (DA-8).
 *
 * Contract notes:
 *  · **One h1 per breakpoint (DA-60).** The staff shell renders the mobile title
 *    in `NativeHeader` below `lg` and this header from `lg` up — so the two never
 *    coexist. The previous `hidden md:block` convention overlapped the shell's
 *    `lg:hidden` chrome, putting TWO h1s in the DOM across the whole 768–1023
 *    band.
 *  · **One title source.** `segment` resolves through `PAGE_TITLE_KEY` (§2.1's
 *    single map) — the same map the shell uses — so mobile and desktop cannot
 *    drift. `title` is the escape hatch for detail routes whose heading is a
 *    person's or a class's name.
 *  · **Client component** on purpose: staff pages are a mix of server and client
 *    components, and a client primitive can be rendered from either.
 *  · The `isRTL && 'font-arabic'` / `'text-right'` that every call site repeated
 *    is dropped: the locale layout already sets the Arabic family on `<body>`,
 *    and `dir="rtl"` already aligns the text.
 *  · The status-zone half of §2.1 (`pt-[env(safe-area-inset-top)]`) belongs to
 *    the mobile chrome and already ships in `NativeHeader` + W0's
 *    `viewportFit: 'cover'`; nothing to add here.
 */

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pageTitleKey } from '@/lib/nav/page-titles';

export type PageHeaderProps = {
  /** Route segment — resolved through the §2.1 title map. */
  segment?: string;
  /** A literal title (detail routes: a member's name, a class name). Wins over `segment`. */
  title?: string;
  /** Full dotted i18n path, when a route needs a title outside the map. */
  titleKey?: string;
  /** Full dotted i18n path for the supporting line. */
  subtitleKey?: string;
  /** A literal subtitle (dynamic values). Wins over `subtitleKey`. */
  subtitle?: string;
  /** Right-aligned slot (start-aligned in RTL automatically — it is a flex row). */
  actions?: React.ReactNode;
  /** REQUIRED on detail routes (§2.1). Renders the back affordance. */
  backHref?: string;
  /** `large` (default) is the workspace heading; `compact` is for nested surfaces. */
  variant?: 'large' | 'compact';
  /**
   * Breakpoint at which this header appears. Staff pages use the default `lg`,
   * matching the shell's chrome switch so exactly one h1 renders per breakpoint.
   * `always` is for surfaces with no shell title of their own.
   */
  visibility?: 'lg' | 'md' | 'always';
  className?: string;
  'data-testid'?: string;
};

const VISIBILITY: Record<NonNullable<PageHeaderProps['visibility']>, string> = {
  lg: 'hidden lg:block',
  md: 'hidden md:block',
  always: 'block',
};

export function PageHeader({
  segment,
  title,
  titleKey,
  subtitleKey,
  subtitle,
  actions,
  backHref,
  variant = 'large',
  visibility = 'lg',
  className,
  'data-testid': testId,
}: PageHeaderProps) {
  const t = useTranslations();
  const tCommon = useTranslations('common');

  const heading = title ?? t(((titleKey ?? pageTitleKey(segment)) as never));
  const supporting = subtitle ?? (subtitleKey ? t(subtitleKey as never) : null);

  return (
    <div className={cn(VISIBILITY[visibility], className)} data-testid={testId}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          {backHref && (
            <Link
              href={backHref}
              aria-label={tCommon('back')}
              data-testid="page-header-back"
              className={cn(
                'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
                '-ms-2 text-gray-600 transition-colors hover:bg-gray-100',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--shell-accent)]',
              )}
            >
              {/* The chevron follows reading direction; `rtl:` flips it without a
                  locale prop, so this works in server and client trees alike. */}
              <ChevronLeft className="h-5 w-5 rtl:hidden" aria-hidden="true" />
              <ChevronRight className="hidden h-5 w-5 rtl:block" aria-hidden="true" />
            </Link>
          )}
          <div className="min-w-0">
            <h1
              data-testid="page-title"
              className={cn(
                'font-bold text-gray-900',
                variant === 'large' ? 'text-h2' : 'text-h3',
              )}
            >
              {heading}
            </h1>
            {supporting && (
              <p className="mt-1 text-sm text-gray-500" data-testid="page-subtitle">
                {supporting}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
