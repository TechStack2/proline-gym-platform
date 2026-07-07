'use client';

/**
 * VENDOR-CONSOLE-1 — per-gym row actions for the platform admin:
 *   · Open landing — the gym's public page in a new tab (/{locale}?gym=<slug>);
 *   · Copy login URL — the app's /auth/login (the invite-button copy idiom);
 *   · Suspend / Reactivate — toggles gyms.is_active via the gated setGymActive
 *     action, behind a plain-language confirm dialog (suspension is LANDING-ONLY —
 *     the copy says so honestly).
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ModalPortal } from '@/components/shared/modal-portal';
import { ExternalLink, Copy, Check, Pause, Play, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { setGymActive } from './actions';

export function VendorGymActions({
  gymId, slug, name, active, locale,
}: {
  gymId: string;
  slug: string;
  name: string;
  active: boolean;
  locale: string;
}) {
  const t = useTranslations('vendor.console');
  const router = useRouter();
  const isRTL = locale === 'ar';
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');

  // The app's login URL, absolute from the real request origin (client-side).
  const copyLogin = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${locale}/auth/login`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  const toggle = () =>
    startTransition(async () => {
      setError('');
      const res = await setGymActive({ gymId, active: !active });
      if (res.ok) {
        setConfirm(false);
        router.refresh();
      } else {
        setError(t('suspendFailed'));
      }
    });

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="vendor-gym-actions">
      {slug && (
        <a
          href={`/${locale}?gym=${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="vendor-open-landing"
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <ExternalLink className="h-3.5 w-3.5" /> {t('openLanding')}
        </a>
      )}

      <button
        type="button"
        onClick={copyLogin}
        data-testid="vendor-copy-login"
        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? t('copied') : t('copyLogin')}
      </button>

      <button
        type="button"
        onClick={() => { setError(''); setConfirm(true); }}
        data-testid="vendor-suspend-toggle"
        data-active={active}
        className={cn(
          'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium',
          active
            ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
            : 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100',
        )}
      >
        {active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        {active ? t('suspend') : t('reactivate')}
      </button>

      {confirm && (
        <ModalPortal>
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirm(false)}>
            <div
              data-testid="vendor-suspend-modal"
              onClick={(e) => e.stopPropagation()}
              dir={isRTL ? 'rtl' : 'ltr'}
              className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            >
              <div className={cn('mb-2 flex items-center gap-2', isRTL && 'flex-row-reverse')}>
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
                <h3 className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
                  {active ? t('suspendTitle') : t('reactivateTitle')}
                </h3>
              </div>
              <p className={cn('mb-4 text-sm text-gray-600', isRTL && 'font-arabic text-right')}>
                {active ? t('suspendBody', { gym: name }) : t('reactivateBody', { gym: name })}
              </p>
              {error && (
                <p data-testid="vendor-suspend-error" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirm(false)}
                  disabled={pending}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  onClick={toggle}
                  disabled={pending}
                  data-testid="vendor-suspend-confirm"
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-primary-foreground',
                    active ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700',
                  )}
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {active ? t('confirmSuspend') : t('confirmReactivate')}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
