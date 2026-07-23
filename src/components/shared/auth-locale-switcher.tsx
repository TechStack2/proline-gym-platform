'use client'

import { useRouter, usePathname } from '@/i18n/routing'
import { cn } from '@/lib/utils'

/**
 * LANDING DA-42 — the auth-page language row (extracted from the login page so
 * /auth/forgot and /auth/reset stop dropping the switcher login has). Same
 * three-button recipe; path-aware so each page re-enters itself in the new locale.
 */
export function AuthLocaleSwitcher({ locale }: { locale: string }) {
  const router = useRouter()
  const pathname = usePathname()
  return (
    <div className="mt-5 flex justify-center gap-1">
      {(['ar', 'en', 'fr'] as const).map((lang) => (
        <button
          key={lang}
          onClick={() => router.replace(pathname, { locale: lang })}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            locale === lang ? 'bg-primary-100 text-primary-700' : 'text-gray-500 hover:bg-gray-100'
          )}
        >
          {lang === 'ar' ? 'العربية' : lang === 'en' ? 'English' : 'Français'}
        </button>
      ))}
    </div>
  )
}
