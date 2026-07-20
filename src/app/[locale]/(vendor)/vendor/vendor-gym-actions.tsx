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
import { ExternalLink, Copy, Check, Pause, Play, Loader2, AlertTriangle, KeyRound, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { setGymActive, lookupGymOwner, resetGymOwnerPassword, type GymOwner } from './actions';

/**
 * OWNER-RESET — the server's refusal reasons, mapped to copy that tells the admin what
 * to DO. `no_owner` / `multiple_owners` are not failures to retry past: they mean the
 * gym's ownership is in a state a credential reset must not guess at.
 */
const RESET_ERR: Record<string, 'errNoOwner' | 'errMultipleOwners' | 'errOwnerNoAccount' | 'errOwnerChanged'> = {
  no_owner: 'errNoOwner',
  multiple_owners: 'errMultipleOwners',
  owner_no_account: 'errOwnerNoAccount',
  owner_changed: 'errOwnerChanged',
};

export function VendorGymActions({
  gymId, slug, origin, name, active, locale,
}: {
  gymId: string;
  slug: string;
  /** INVITE-HOST: THIS gym's canonical origin (primary domain → subdomain → SITE_URL),
   *  resolved server-side. The vendor console is served from the platform apex, so we
   *  must NOT use window.location.origin here (that would leak the vendor host). */
  origin: string;
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

  // ── OWNER-RESET state ──────────────────────────────────────────────────────
  // Three phases, deliberately separate: 'confirm' shows WHO would be reset (the
  // lookup result) and 'done' shows the issued password ONCE. `temp` lives only in
  // this component's state — never persisted, never sent anywhere else, and gone the
  // moment the modal closes or the page navigates.
  const [resetPhase, setResetPhase] = useState<null | 'confirm' | 'done'>(null);
  const [owner, setOwner] = useState<GymOwner | null>(null);
  const [temp, setTemp] = useState('');
  const [tempCopied, setTempCopied] = useState(false);
  const [resetErr, setResetErr] = useState('');

  const resetErrText = (code: string) =>
    RESET_ERR[code] ? t(RESET_ERR[code], { gym: name }) : t('errResetFailed');

  /** Step 1: ask the server WHO the owner is. Read-only — nothing is issued yet. */
  const openReset = () =>
    startTransition(async () => {
      setResetErr(''); setOwner(null); setTemp(''); setTempCopied(false);
      const res = await lookupGymOwner({ gymId });
      if (res.ok) { setOwner(res.owner); setResetPhase('confirm'); }
      else { setOwner(null); setResetErr(resetErrText(res.error)); setResetPhase('confirm'); }
    });

  /** Step 2: issue it. The owner id is echoed back so the server can refuse if
   *  ownership changed between the confirmation and this click. */
  const doReset = () =>
    startTransition(async () => {
      if (!owner) return;
      setResetErr('');
      const res = await resetGymOwnerPassword({ gymId, ownerUserId: owner.userId });
      if (res.ok) { setTemp(res.tempPassword); setResetPhase('done'); }
      else setResetErr(resetErrText(res.error));
    });

  const closeReset = () => {
    // Drop the credential from memory as soon as the admin is done with it.
    setResetPhase(null); setOwner(null); setTemp(''); setTempCopied(false); setResetErr('');
  };

  const copyTemp = async () => {
    try {
      await navigator.clipboard.writeText(temp);
      setTempCopied(true);
      setTimeout(() => setTempCopied(false), 2000);
    } catch { /* clipboard unavailable — the password is displayed for manual copy */ }
  };

  // The gym's login URL on ITS OWN canonical host (never the vendor apex).
  const loginUrl = `${origin || (typeof window !== 'undefined' ? window.location.origin : '')}/${locale}/auth/login`;
  const landingUrl = `${origin || (typeof window !== 'undefined' ? window.location.origin : '')}/${locale}?gym=${slug}`;
  const copyLogin = async () => {
    try {
      await navigator.clipboard.writeText(loginUrl);
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
          href={landingUrl}
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

      {/* OWNER-RESET: credential issuance. Never a one-click action — the click only
          asks WHO would be reset; issuing happens behind the confirmation below. */}
      <button
        type="button"
        onClick={openReset}
        disabled={pending}
        data-testid="vendor-reset-owner-pw"
        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        <KeyRound className="h-3.5 w-3.5" /> {t('resetPw')}
      </button>

      {resetPhase && (
        <ModalPortal>
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={closeReset}>
            <div
              data-testid="vendor-reset-modal"
              data-phase={resetPhase}
              onClick={(e) => e.stopPropagation()}
              dir={isRTL ? 'rtl' : 'ltr'}
              className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            >
              {resetPhase === 'confirm' ? (
                <>
                  <div className={cn('mb-2 flex items-center gap-2', isRTL && 'flex-row-reverse')}>
                    <ShieldAlert className="h-5 w-5 shrink-0 text-amber-500" />
                    <h3 className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
                      {t('resetPwTitle')}
                    </h3>
                  </div>

                  {owner ? (
                    <>
                      <p className={cn('mb-3 text-sm text-gray-600', isRTL && 'font-arabic text-right')}>
                        {t('resetPwBody', { gym: name })}
                      </p>
                      {/* R2: WHICH account — shown before anything is issued, so a
                          wrong-gym or wrong-person click is caught here. */}
                      <div
                        data-testid="vendor-reset-target"
                        data-owner-id={owner.userId}
                        className="mb-4 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2"
                      >
                        <span className="block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                          {t('resetPwAccount')}
                        </span>
                        <span className="block text-sm font-semibold text-gray-900" data-testid="vendor-reset-owner-name">
                          {owner.name}
                        </span>
                        <span className="block font-mono text-xs text-gray-500" dir="ltr" data-testid="vendor-reset-owner-email">
                          {owner.maskedEmail}
                        </span>
                      </div>
                    </>
                  ) : null}

                  {resetErr && (
                    <p data-testid="vendor-reset-error" className={cn('mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700', isRTL && 'text-right')}>
                      {resetErr}
                    </p>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeReset}
                      disabled={pending}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {t('cancel')}
                    </button>
                    {/* No owner resolved → there is nothing to confirm, so no CTA. */}
                    {owner && (
                      <button
                        type="button"
                        onClick={doReset}
                        disabled={pending}
                        data-testid="vendor-reset-confirm"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-amber-700 disabled:opacity-60"
                      >
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {t('resetPwCta')}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className={cn('mb-2 flex items-center gap-2', isRTL && 'flex-row-reverse')}>
                    <KeyRound className="h-5 w-5 shrink-0 text-green-600" />
                    <h3 className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
                      {t('resetPwDoneTitle')}
                    </h3>
                  </div>

                  {/* Shown ONCE. The warning is not decoration: this value exists
                      nowhere else — not in the DB, not in a log, not in an email. */}
                  <p data-testid="vendor-reset-once-warning"
                    className={cn('mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800', isRTL && 'font-arabic text-right')}>
                    {t('resetPwDoneWarn')}
                  </p>

                  <div className="mb-3 flex items-center gap-2">
                    <code
                      data-testid="vendor-reset-temp-password"
                      dir="ltr"
                      className="flex-1 select-all rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center font-mono text-base font-bold tracking-wide text-gray-900"
                    >
                      {temp}
                    </code>
                    <button
                      type="button"
                      onClick={copyTemp}
                      data-testid="vendor-reset-copy"
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {tempCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {tempCopied ? t('copied') : t('resetPwCopy')}
                    </button>
                  </div>

                  <p className={cn('mb-4 text-xs text-gray-500', isRTL && 'font-arabic text-right')}>
                    {t('resetPwDoneHint', { name: owner?.name ?? '' })}
                  </p>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={closeReset}
                      data-testid="vendor-reset-close"
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {t('close')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </ModalPortal>
      )}

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
