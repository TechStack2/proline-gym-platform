'use client'

/**
 * PWA-INSTALL — the admin-side "Install the app" card (front-desk hub / Today).
 *
 * Dismissible, platform-aware, and the SINGLE install affordance (it consolidates
 * the old Chrome/Edge-only bottom-bar prompt — which did strictly less — so the two
 * never double up). Where the native prompt is captured (Chromium) it triggers it;
 * otherwise it shows the per-platform manual steps (macOS Safari "Add to Dock",
 * Mac/Win Chrome-Edge address-bar install icon). Already-installed → renders nothing.
 */
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { usePwaInstall } from '@/lib/pwa/use-pwa-install'
import { Download, X, CheckCircle2 } from 'lucide-react'

export function InstallAppCard({ locale }: { locale: string }) {
  const t = useTranslations('pwa')
  const isRTL = locale === 'ar'
  const { canPrompt, shouldOffer, instructions, dismiss, promptInstall } = usePwaInstall()

  // Already installed (standalone) / dismissed → no nag.
  if (!shouldOffer) return null

  const onInstall = async () => {
    const outcome = await promptInstall()
    if (outcome === 'accepted') dismiss() // appinstalled also hides it; belt + suspenders
  }

  return (
    <div data-testid="install-app-card" data-can-prompt={canPrompt} dir={isRTL ? 'rtl' : 'ltr'}
      className="rounded-2xl border border-[#cd1419]/20 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#cd1419] text-sm font-extrabold text-white">PL</div>
          <div>
            <p className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t('cardTitle')}</p>
            <p className="mt-0.5 text-xs text-gray-500">{t('cardDescription')}</p>
          </div>
        </div>
        <button type="button" data-testid="install-app-dismiss" onClick={dismiss} aria-label={t('dismissButton')}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
          <X className="h-4 w-4" />
        </button>
      </div>

      {canPrompt ? (
        // Chromium with a captured prompt → one-tap native install.
        <button type="button" data-testid="install-app-btn" onClick={() => void onInstall()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#cd1419] px-3 py-2 text-xs font-semibold text-white hover:bg-[#b01216]">
          <Download className="h-4 w-4" /> {t('installButton')}
        </button>
      ) : (
        // No native prompt (macOS Safari, or eligible browser that didn't fire it) →
        // platform-aware manual steps.
        <div data-testid="install-app-instructions" className="mt-3 rounded-xl bg-gray-50 p-3">
          <p className="text-xs font-semibold text-gray-800">{t(`steps.${instructions}.title`)}</p>
          <ol className={cn('mt-1.5 list-decimal space-y-1 text-xs text-gray-600', isRTL ? 'pr-4' : 'pl-4')}>
            <li>{t(`steps.${instructions}.s1`)}</li>
            <li>{t(`steps.${instructions}.s2`)}</li>
          </ol>
          <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-gray-400">
            <CheckCircle2 className="h-3 w-3" /> {t('alreadyInstalledHint')}
          </p>
        </div>
      )}
    </div>
  )
}
