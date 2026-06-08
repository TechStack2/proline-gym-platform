'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { SwipeableSheet } from '@/components/native';
import type { DashboardRole } from './DashboardTabConfig';
import { getDashboardTabs } from './DashboardTabConfig';
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
      snapPoints={[50, 85]}
    >
      <div className={cn('space-y-1 px-1', isRTL && 'rtl')}>
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
      </div>
    </SwipeableSheet>
  );
}
