'use client';

/**
 * DS 2.0 §2.2 + §4.4 — the shared More sheet (staff's pattern, promoted).
 *
 * Lists EXACTLY the shell nav config's non-primary entries (the same objects the
 * desktop rail renders — §4.4's one-source law) plus the utility row: language
 * switcher, theme toggle, sign-out (destructive-styled, two-tap confirm per
 * §2.2). Portal + coach consume this; the staff MoreMenuSheet aligns in W2b.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { LogOut, Moon } from 'lucide-react';
import { SwipeableSheet } from '@/components/native';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { cn } from '@/lib/utils';
import type { ShellNavEntry } from '@/lib/nav/shell-nav';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  locale: string;
  items: ShellNavEntry[];
  onSignOut: () => void;
};

export function MoreSheet({ isOpen, onClose, locale, items, onSignOut }: Props) {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  // §2.2: sign-out is destructive → two-tap confirm inside the sheet.
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  useEffect(() => {
    if (!isOpen) setConfirmingSignOut(false);
  }, [isOpen]);

  return (
    <SwipeableSheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('more')}
      locale={locale}
      snapPoints={[78, 94]}
    >
      <div className="space-y-1 px-1 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={`/${locale}${item.path}`}
              data-testid={`more-${item.key}`}
              onClick={onClose}
              className={cn(
                'flex items-center gap-4 rounded-xl px-4 py-3 text-sm font-medium transition-colors active:scale-[0.98]',
                'text-gray-700 hover:bg-gray-100 active:bg-gray-200',
              )}
            >
              <Icon className="h-5 w-5 flex-shrink-0 text-gray-500" />
              <span className="flex-1">{t(item.key as never)}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary-700 px-1 text-[10px] font-bold leading-none text-primary-foreground">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
              <svg
                className="h-4 w-4 text-gray-400 rtl:rotate-180"
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

        {/* Utility row (§2.2): language · theme · sign-out. */}
        <div className="mt-3 border-t pt-3" data-testid="more-language">
          <p className="px-4 pb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
            {locale === 'ar' ? 'اللغة' : locale === 'fr' ? 'Langue' : 'Language'}
          </p>
          <div className="px-3">
            <LanguageSwitcher locale={locale} variant="inline" />
          </div>
        </div>

        <div
          className="flex items-center justify-between rounded-xl px-4 py-2 text-sm font-medium text-gray-700"
          data-testid="more-theme"
        >
          <span className="flex items-center gap-4">
            <Moon className="h-5 w-5 text-gray-500" aria-hidden />
            {tCommon('theme')}
          </span>
          <ThemeToggle />
        </div>

        <button
          type="button"
          data-testid="more-signout"
          onClick={() => {
            if (!confirmingSignOut) {
              setConfirmingSignOut(true);
              return;
            }
            onClose();
            onSignOut();
          }}
          className={cn(
            'flex w-full items-center gap-4 rounded-xl px-4 py-3 text-sm font-semibold transition-colors',
            // W3b (DA-25): role tint, not a light-pinned red-50 — legible both themes.
            confirmingSignOut ? 'tint-danger' : 'text-danger-600 hover:bg-danger-500/10',
          )}
        >
          <LogOut className="h-5 w-5 flex-shrink-0" aria-hidden />
          <span className="flex-1 text-start">
            {confirmingSignOut ? tCommon('signOutConfirm') : tCommon('signOut')}
          </span>
        </button>
      </div>
    </SwipeableSheet>
  );
}
