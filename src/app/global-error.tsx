'use client'

/**
 * ERROR-HARDEN #1 — the LAST-RESORT boundary (a throw in the root layout itself).
 * Next's contract: global-error REPLACES the root layout, so it MUST render its
 * own <html>/<body> (the one place that's correct — see the auth-layout nested-
 * html lesson). Self-contained: no provider or i18n context can be assumed, and
 * trilingual copy is shown together (the locale segment may not have resolved).
 * Tailwind CLASSES, not inline styles — the prod CSP strips inline style
 * attributes; stylesheet rules survive (worst case: unstyled but readable).
 *
 * ERROR-OBSERVE: also REPORT to Sentry on mount (guarded) and surface the Next
 * digest as a copyable reference code — a crash here used to be console-only, so
 * we were blind to the exact throw the owner saw on the PWA.
 */
import { useEffect } from 'react'
import { captureError } from '@/lib/observability/sentry'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Raw error → console only; never the UI.
  console.error('[global-error]', error)
  // Feed the last-resort crash to Sentry (guarded — capture can never re-crash here).
  useEffect(() => { captureError(error) }, [error])
  return (
    <html>
      <body className="m-0 bg-gray-50 font-sans">
        <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-3xl">⚠️</div>
          <h1 className="mt-5 text-xl font-bold text-gray-900">Something went wrong · حدث خطأ ما</h1>
          <p className="mt-2 max-w-md text-sm text-gray-500">
            An unexpected error occurred — please try again. · حدث خطأ غير متوقع — يرجى المحاولة مرة أخرى. · Une erreur est survenue — veuillez réessayer.
          </p>
          <button type="button" onClick={reset} data-testid="error-retry"
            className="mt-6 rounded-xl bg-primary-700 px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-800">
            Try again · إعادة المحاولة
          </button>
          {/* ERROR-OBSERVE: the Next digest correlates to the Sentry event — a code
              the owner can read us off a phone. Present only when a digest exists. */}
          {error?.digest && (
            <p className="mt-4 text-xs text-gray-400">
              <span className="me-1">Reference · المرجع · Référence:</span>
              <code data-testid="error-digest" className="select-all font-mono text-gray-500">{error.digest}</code>
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
