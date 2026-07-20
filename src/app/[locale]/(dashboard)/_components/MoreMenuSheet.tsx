'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { SwipeableSheet } from '@/components/native';
import type { DashboardRole } from './DashboardTabConfig';
import { getDashboardTabs } from './DashboardTabConfig';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { cn } from '@/lib/utils';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  locale: string;
  role: DashboardRole;
};

export function MoreMenuSheet({ isOpen, onClose, locale, role }: Props) {
  const t = useTranslations('nav');
  const isRTL = locale === 'ar';
  const { moreItems } = getDashboardTabs(role);

  return (
    <SwipeableSheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('more') || 'More'}
      locale={locale}
      // PWA-MOBILE-UX #3: open taller so the secondary items aren't below the fold
      // (owners have ~8-12 more-items; the old 50vh hid the tail). The sheet content
      // still scrolls (overflow-y-auto) for the longest lists.
      snapPoints={[78, 94]}
    >
      {/* Bottom padding clears the home indicator so the LAST item is never clipped. */}
      <div className={cn('space-y-1 px-1 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]')}>
        {moreItems.map((item) => {
          const Icon = item.icon;
          const fullPath = `/${locale}${item.path}`;

          // Try i18n key, fall back to label prop
          const label = t(item.key as any) || item.label;

          return (
            <Link
              key={item.key}
              href={fullPath}
              onClick={onClose}
              className={cn(
                'flex items-center gap-4 rounded-xl px-4 py-3 text-sm font-medium transition-colors active:scale-[0.98]',
                'text-gray-700 hover:bg-gray-100 active:bg-gray-200',
                isRTL ? 'flex-row-reverse text-right' : '',
              )}
            >
              <Icon className="h-5 w-5 flex-shrink-0 text-gray-500" />
              <span className="flex-1">{label}</span>
              <svg
                className={cn(
                  'h-4 w-4 text-gray-400',
                  isRTL && 'rotate-180',
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          );
        })}

        {/* PWA-MOBILE-UX #3: the language switcher lives in the mobile menu too, so
            it's easy to find after login (the header switcher is easy to miss). */}
        <div className="mt-3 border-t pt-3" data-testid="more-language">
          <p className={cn('px-4 pb-2 text-xs font-medium uppercase tracking-wide text-gray-400', isRTL && 'text-right')}>
            {locale === 'ar' ? 'اللغة' : locale === 'fr' ? 'Langue' : 'Language'}
          </p>
          <div className="px-3">
            <LanguageSwitcher locale={locale} variant="inline" />
          </div>
        </div>
      </div>
    </SwipeableSheet>
  );
}
