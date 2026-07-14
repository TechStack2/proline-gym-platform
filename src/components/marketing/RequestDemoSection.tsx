'use client';

/**
 * PRAXELLA-DOOR R2 — the "Request a demo" section on the Praxella vendor landing.
 * A prospect leaves name + business + activity-type + phone (+ optional email,
 * city, message); it lands as a platform_leads row via the rate-limited server
 * action → submit_platform_lead (000100), triaged in the (vendor) console. Mirrors
 * the MJ-5 join-door form so the dark-field invariant holds for free (bg-gray-50 +
 * text-gray-900 inputs flip together; the dark: gradient keeps light+dark coherent).
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Send, CheckCircle } from 'lucide-react';
import { submitDemoRequest } from '@/app/[locale]/(marketing)/platform-lead-actions';

const ACTIVITIES = ['gym', 'martial_arts', 'gymnastics', 'dance', 'other'] as const;

export function RequestDemoSection({ locale }: { locale: string }) {
  const t = useTranslations('vendor.demo');
  const isRTL = locale === 'ar';

  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [activityType, setActivityType] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const inputCls = cn(
    'w-full rounded-xl border border-gray-200 px-4 py-3 text-base bg-gray-50 text-gray-900 placeholder:text-gray-400',
    'focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-50',
    isRTL && 'text-right',
  );
  const labelCls = cn('block text-sm font-medium text-gray-700 mb-1.5', isRTL && 'text-right font-arabic');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name || !phone) { setError(t('fillAll')); return; }
    setLoading(true);
    try {
      const res = await submitDemoRequest({
        name, phone,
        businessName: businessName || undefined,
        activityType: activityType || undefined,
        email: email || undefined,
        city: city || undefined,
        message: message || undefined,
        honeypot: honeypot || undefined,
      });
      if (res === 'invalid') { setError(t('submitFailed')); return; }
      if (res === 'rate_limited') { setError(t('tooMany')); return; }
      setSuccess(true);
    } catch {
      setError(t('submitFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <section id="demo" data-testid="vendor-demo" className="py-20 lg:py-28 bg-gradient-to-br from-secondary-950 to-secondary-900 dark:from-zinc-950 dark:to-zinc-900">
        <div className="mx-auto max-w-lg px-4 text-center">
          <CheckCircle className="mx-auto h-16 w-16 text-primary-400" />
          <h2 className={cn('mt-6 text-3xl font-bold text-white dark:text-zinc-50', isRTL && 'font-arabic')} data-testid="vendor-demo-success">
            {t('thanksTitle')}
          </h2>
          <p className="mt-3 text-lg text-white/80 dark:text-zinc-300">{t('thanksBody')}</p>
        </div>
      </section>
    );
  }

  return (
    <section id="demo" data-testid="vendor-demo" className="py-20 lg:py-28 bg-gradient-to-br from-secondary-950 to-secondary-900 dark:from-zinc-950 dark:to-zinc-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className={cn('text-3xl sm:text-4xl font-bold text-white dark:text-zinc-50', isRTL && 'text-right font-arabic')}>
              {t('title')}
            </h2>
            <p className="mt-4 text-lg text-white/80 leading-relaxed dark:text-zinc-300">{t('subtitle')}</p>
          </div>

          <div className="rounded-2xl bg-white p-6 sm:p-8 shadow-elevation-3">
            <form onSubmit={handleSubmit} className="space-y-4" data-testid="vendor-demo-form">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="demo-name" className={labelCls}>{t('nameLabel')}</label>
                  <input id="demo-name" type="text" value={name} onChange={(e) => setName(e.target.value)}
                    placeholder={t('namePh')} disabled={loading} data-testid="demo-name" className={inputCls} />
                </div>
                <div>
                  <label htmlFor="demo-business" className={labelCls}>{t('businessLabel')}</label>
                  <input id="demo-business" type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)}
                    placeholder={t('businessPh')} disabled={loading} data-testid="demo-business" className={inputCls} />
                </div>
              </div>

              {/* Activity-type chips (single-select) */}
              <div>
                <label className={labelCls}>{t('activityLabel')}</label>
                <div className="flex flex-wrap gap-1.5">
                  {ACTIVITIES.map((k) => (
                    <button key={k} type="button" data-testid="demo-activity-chip" data-value={k}
                      aria-pressed={activityType === k}
                      onClick={() => setActivityType((prev) => (prev === k ? '' : k))}
                      className={cn('rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                        activityType === k ? 'border-primary-600 bg-primary-600 text-primary-foreground' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}>
                      {t(`activity.${k}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="demo-phone" className={labelCls}>{t('phoneLabel')}</label>
                  <input id="demo-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                    placeholder="+961 70 123 456" disabled={loading} dir="ltr" data-testid="demo-phone"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-50" />
                </div>
                <div>
                  <label htmlFor="demo-email" className={labelCls}>{t('emailLabel')}</label>
                  <input id="demo-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('emailPh')} disabled={loading} dir="ltr" data-testid="demo-email"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-50" />
                </div>
              </div>

              <div>
                <label htmlFor="demo-city" className={labelCls}>{t('cityLabel')}</label>
                <input id="demo-city" type="text" value={city} onChange={(e) => setCity(e.target.value)}
                  placeholder={t('cityPh')} disabled={loading} data-testid="demo-city" className={inputCls} />
              </div>

              <div>
                <label htmlFor="demo-message" className={labelCls}>{t('messageLabel')}</label>
                <textarea id="demo-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={2}
                  placeholder={t('messagePh')} disabled={loading} data-testid="demo-message" className={inputCls} />
              </div>

              {/* Honeypot: off-screen, not announced — bots fill it. */}
              <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden">
                <label htmlFor="demo-company">Company</label>
                <input id="demo-company" type="text" tabIndex={-1} autoComplete="off"
                  value={honeypot} onChange={(e) => setHoneypot(e.target.value)} data-testid="demo-honeypot" />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600" data-testid="vendor-demo-error">{error}</div>
              )}

              <button type="submit" disabled={loading} data-testid="demo-submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3.5 text-base font-semibold text-primary-foreground hover:bg-primary-700 disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-95 shadow-glow-primary">
                {loading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <><Send className="h-5 w-5" /> {t('send')}</>
                )}
              </button>

              <p className="text-center text-xs text-gray-400">{t('noPromise')}</p>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
