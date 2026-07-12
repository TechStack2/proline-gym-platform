'use client';

/**
 * MJ-5 JOIN-DOOR — the public "Request to join" CTA (Req1).
 * Every gym landing renders this. A prospect leaves name + phone + product
 * interests (membership / classes / PT / camp) + an optional note; it lands as a
 * LEAD (source=landing) in that gym's pipeline via the rate-limited server action
 * → submit_public_lead. OWNER GATE: this only ever REQUESTS — no account, no
 * credential, no promise of automatic anything (the thank-you says "we'll contact
 * you"). Identity-neutral copy (no gym contact rendered) so it's safe on every
 * white-label tenant.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Send, CheckCircle } from 'lucide-react';
import { submitJoinRequest } from '@/app/[locale]/(marketing)/join-actions';

type JoinCTASectionProps = { locale: string; gymSlug: string };

const INTERESTS = ['membership', 'classes', 'pt', 'camp'] as const;

export function JoinCTASection({ locale, gymSlug }: JoinCTASectionProps) {
  const t = useTranslations('landing.joinCta');
  const isRTL = locale === 'ar';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const toggleInterest = (k: string) =>
    setInterests((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name || !phone) { setError(t('fillAll')); return; }
    setLoading(true);
    try {
      const res = await submitJoinRequest({
        gymSlug, name, phone, interests, note: note || undefined, honeypot: honeypot || undefined,
      });
      if (res === 'invalid') { setError(t('submitFailed')); return; }
      if (res === 'rate_limited') { setError(t('tooMany')); return; }
      setSuccess(true); // 'ok' and 'duplicate' both land on the thank-you state
    } catch {
      setError(t('submitFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <section id="join" className="py-20 lg:py-28 bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="mx-auto max-w-lg px-4 text-center">
          <CheckCircle className="mx-auto h-16 w-16 text-white/80" />
          <h2 className={cn('mt-6 text-3xl font-bold text-white', isRTL && 'text-right font-arabic')} data-testid="join-success">
            {t('thanksTitle')}
          </h2>
          <p className="mt-3 text-lg text-white/80">{t('thanksBody')}</p>
        </div>
      </section>
    );
  }

  return (
    <section id="join" className="py-20 lg:py-28 bg-gradient-to-br from-gray-900 to-gray-800">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className={cn('text-3xl sm:text-4xl font-bold text-white', isRTL && 'text-right font-arabic')}>
              {t('title')}
            </h2>
            <p className="mt-4 text-lg text-white/80 leading-relaxed">{t('subtitle')}</p>
          </div>

          <div className="rounded-2xl bg-white p-6 sm:p-8 shadow-elevation-3">
            <form onSubmit={handleSubmit} className="space-y-4" data-testid="join-capture-form">
              <div>
                <label htmlFor="join-name" className={cn('block text-sm font-medium text-gray-700 mb-1.5', isRTL && 'text-right font-arabic')}>
                  {t('nameLabel')}
                </label>
                <input id="join-name" type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder={t('namePh')} disabled={loading} data-testid="join-name"
                  className={cn('w-full rounded-xl border border-gray-200 px-4 py-3 text-base bg-gray-50 placeholder:text-gray-400',
                    'focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-50',
                    isRTL && 'text-right')} />
              </div>

              <div>
                <label htmlFor="join-phone" className={cn('block text-sm font-medium text-gray-700 mb-1.5', isRTL && 'text-right font-arabic')}>
                  {t('phoneLabel')}
                </label>
                <input id="join-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="+961 70 123 456" disabled={loading} dir="ltr" data-testid="join-phone"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base bg-gray-50 placeholder:text-gray-400 focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-50" />
              </div>

              {/* Product-interest chips (multi-select; no commitment — just interest) */}
              <div>
                <label className={cn('block text-sm font-medium text-gray-700 mb-1.5', isRTL && 'text-right font-arabic')}>
                  {t('interestLabel')}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {INTERESTS.map((k) => (
                    <button key={k} type="button" data-testid="join-interest-chip" data-value={k}
                      aria-pressed={interests.includes(k)}
                      onClick={() => toggleInterest(k)}
                      className={cn('rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                        interests.includes(k) ? 'border-primary-600 bg-primary-600 text-primary-foreground' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}>
                      {t(`interest.${k}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="join-note" className={cn('block text-sm font-medium text-gray-700 mb-1.5', isRTL && 'text-right font-arabic')}>
                  {t('noteLabel')}
                </label>
                <textarea id="join-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                  placeholder={t('notePh')} disabled={loading} data-testid="join-note"
                  className={cn('w-full rounded-xl border border-gray-200 px-4 py-3 text-base bg-gray-50 placeholder:text-gray-400 focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-50', isRTL && 'text-right')} />
              </div>

              {/* Honeypot: off-screen, not announced — bots fill it. */}
              <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden">
                <label htmlFor="join-company">Company</label>
                <input id="join-company" type="text" tabIndex={-1} autoComplete="off"
                  value={honeypot} onChange={(e) => setHoneypot(e.target.value)} data-testid="join-honeypot" />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600" data-testid="join-error">{error}</div>
              )}

              <button type="submit" disabled={loading} data-testid="join-submit"
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
