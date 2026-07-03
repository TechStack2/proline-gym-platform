'use client'

/**
 * ERROR-HARDEN #1 — the branded, localized segment error surface.
 *
 * Rendered by the segment error.tsx boundaries ((dashboard) / portal / coach /
 * (marketing)) and reused by not-found. DELIBERATELY self-contained: an inline
 * ar/en/fr dictionary + useParams for the locale, NO useTranslations — the i18n
 * provider (or a layout above it) may be exactly what threw, and the error
 * surface must never crash itself. RTL-correct for /ar; never shows the raw
 * error (it goes to console.error for debugging only).
 */
import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'

type ErrorCopy = { title: string; body: string; retry: string; home: string; nfTitle: string; nfBody: string }
const DICT: Record<'ar' | 'en' | 'fr', ErrorCopy> = {
  en: {
    title: 'Something went wrong',
    body: 'An unexpected error occurred. Your data is safe — please try again.',
    retry: 'Try again',
    home: 'Go home',
    nfTitle: 'Page not found',
    nfBody: 'The page you are looking for does not exist or has moved.',
  },
  ar: {
    title: 'حدث خطأ ما',
    body: 'حدث خطأ غير متوقع. بياناتك بأمان — يرجى المحاولة مرة أخرى.',
    retry: 'إعادة المحاولة',
    home: 'الصفحة الرئيسية',
    nfTitle: 'الصفحة غير موجودة',
    nfBody: 'الصفحة التي تبحث عنها غير موجودة أو تم نقلها.',
  },
  fr: {
    title: 'Une erreur est survenue',
    body: 'Une erreur inattendue est survenue. Vos données sont en sécurité — veuillez réessayer.',
    retry: 'Réessayer',
    home: 'Accueil',
    nfTitle: 'Page introuvable',
    nfBody: "La page que vous cherchez n'existe pas ou a été déplacée.",
  },
}

export function useErrorLocale(): { locale: 'ar' | 'en' | 'fr'; d: ErrorCopy } {
  const params = useParams<{ locale?: string }>()
  const locale = (['ar', 'en', 'fr'].includes(params?.locale ?? '') ? params!.locale : 'en') as 'ar' | 'en' | 'fr'
  return { locale, d: DICT[locale] }
}

export function SegmentError({ error, reset, notFound = false }: {
  error?: Error & { digest?: string }
  reset?: () => void
  notFound?: boolean
}) {
  const { locale, d } = useErrorLocale()
  const isRTL = locale === 'ar'

  useEffect(() => {
    // The raw error is for the console/monitoring ONLY — never the UI.
    if (error) console.error('[segment-error]', error)
  }, [error])

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} data-testid={notFound ? 'not-found-page' : 'segment-error'}
      className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
        <AlertTriangle className="h-8 w-8 text-[#cd1419]" aria-hidden />
      </div>
      <h1 className="mt-5 text-xl font-bold text-gray-900">{notFound ? d.nfTitle : d.title}</h1>
      <p className="mt-2 max-w-sm text-sm text-gray-500">{notFound ? d.nfBody : d.body}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {reset && (
          <button type="button" onClick={reset} data-testid="error-retry"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#cd1419] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#a81014]">
            <RotateCcw className="h-4 w-4" /> {d.retry}
          </button>
        )}
        <a href={`/${locale}`} data-testid="error-home"
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <Home className="h-4 w-4" /> {d.home}
        </a>
      </div>
    </div>
  )
}
