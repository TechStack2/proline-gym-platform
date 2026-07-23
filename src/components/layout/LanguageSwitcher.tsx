'use client';

import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { Languages, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

type LanguageSwitcherProps = {
  locale: string;
  variant?: 'dropdown' | 'inline';
  /** LANDING DA-57: trigger overrides for a dark/transparent bar — the default
   *  neutral gray read as a DISABLED control over the landing hero. */
  className?: string;
};

const languageNames = {
  ar: 'العربية',
  en: 'English',
  fr: 'Français',
};

const languageFlags = {
  ar: '🇱🇧',
  en: '🇺🇸',
  fr: '🇫🇷',
};

export function LanguageSwitcher({ locale, variant = 'dropdown', className }: LanguageSwitcherProps) {
  const t = useTranslations('language');
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const switchLanguage = (newLocale: string) => {
    router.replace(pathname, { locale: newLocale });
    setIsOpen(false);
  };

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-1">
        {(['ar', 'en', 'fr'] as const).map((lang) => (
          <button
            key={lang}
            onClick={() => switchLanguage(lang)}
            className={cn(
              'rounded-md px-2 py-1 text-xs font-medium transition-colors',
              locale === lang
                ? 'bg-primary-100 text-primary-700'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            )}
          >
            {languageNames[lang]}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn('flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors', className)}
        aria-label={t('switch')}
      >
        <Languages className="h-4 w-4" />
        <span className="hidden sm:inline">{languageNames[locale as keyof typeof languageNames]}</span>
        <ChevronDown className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute end-0 mt-1 w-40 rounded-lg border bg-white shadow-lg py-1 z-50">
          {(['ar', 'en', 'fr'] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => switchLanguage(lang)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors',
                locale === lang
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-700 hover:bg-gray-50'
              )}
            >
              <span>{languageFlags[lang]}</span>
              <span>{languageNames[lang]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
