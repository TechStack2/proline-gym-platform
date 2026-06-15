'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Send, CheckCircle } from 'lucide-react';

type Discipline = { id: string; name: string };

type TrialCTASectionProps = {
  locale: string;
  // X1: when set (e.g. `/en?gym=<slug>`), the capture targets that gym.
  gymSlug?: string;
  // GRW-1: gym's anon-readable disciplines → interest chips.
  disciplines?: Discipline[];
};

export function TrialCTASection({ locale, gymSlug, disciplines = [] }: TrialCTASectionProps) {
  const t = useTranslations('landing.trialCta');
  const isRTL = locale === 'ar';
  const supabase = createClient();
  // GRW-1: the tracked-link campaign code (`/{locale}?c=CODE`) — resolved to
  // attribution inside the SECURITY DEFINER RPC (campaigns has no anon read).
  const campaignCode = useSearchParams().get('c');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [disciplineId, setDisciplineId] = useState('');
  const [honeypot, setHoneypot] = useState(''); // bots fill this; humans never see it
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name || !phone) {
      setError(t('fillAll'));
      return;
    }

    setLoading(true);
    try {
      // submit_trial_inquiry guards inside (honeypot, validation, 24h dedup,
      // campaign attribution) + emits the lead_new staff notification (anon
      // caller → in-RPC, sanctioned definer exception). Returns ok/duplicate/
      // invalid only — no row data to anon.
      // AX-2: the page passes the RESOLVED gym slug, so this is real on the bare
      // landing. Defensive only — a missing slug is a config error, not "fill all".
      const { data, error: rpcError } = await supabase.rpc('submit_trial_inquiry', {
        p_gym_slug: gymSlug || null,
        p_name: name,
        p_phone: phone,
        p_discipline_id: disciplineId || null,
        p_campaign_code: campaignCode || null,
        p_honeypot: honeypot || null,
      });
      if (rpcError) throw rpcError;
      // 'invalid' means the RPC couldn't resolve the gym / inputs — an honest
      // "couldn't submit" message (the empty-field case is caught client-side above).
      if (data === 'invalid') {
        setError(t('submitFailed'));
        return;
      }
      setSuccess(true); // 'ok' and 'duplicate' both land on the success state
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <section id="trial" className="py-20 lg:py-28 bg-gradient-to-br from-primary-600 to-primary-800">
        <div className="mx-auto max-w-lg px-4 text-center">
          <CheckCircle className="mx-auto h-16 w-16 text-white/80" />
          <h2 className={cn('mt-6 text-3xl font-bold text-white', isRTL && 'text-right font-arabic')} data-testid="trial-success">
            {t('gotIt')}
          </h2>
          <p className="mt-3 text-lg text-white/80">
            {t('whatsapp24')}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section id="trial" className="py-20 lg:py-28 bg-gradient-to-br from-primary-600 to-primary-800">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Text side */}
          <div>
            <h2 className={cn('text-3xl sm:text-4xl font-bold text-white', isRTL && 'text-right font-arabic')}>
              {t('title')}
            </h2>
            <p className="mt-4 text-lg text-white/80 leading-relaxed">
              {t('subtitle')}
            </p>
          </div>

          {/* Form side */}
          <div className="rounded-2xl bg-white p-6 sm:p-8 shadow-elevation-3">
            <form onSubmit={handleSubmit} className="space-y-4" data-testid="trial-capture-form">
              <div>
                <label htmlFor="trial-name" className={cn('block text-sm font-medium text-gray-700 mb-1.5', isRTL && 'text-right font-arabic')}>
                  {t('nameLabel')}
                </label>
                <input id="trial-name" type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder={t('namePh')} disabled={loading} data-testid="trial-name"
                  className={cn('w-full rounded-xl border border-gray-200 px-4 py-3 text-base bg-gray-50 placeholder:text-gray-400',
                    'focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-50',
                    isRTL && 'text-right')} />
              </div>

              <div>
                <label htmlFor="trial-phone" className={cn('block text-sm font-medium text-gray-700 mb-1.5', isRTL && 'text-right font-arabic')}>
                  {t('phoneLabel')}
                </label>
                <input id="trial-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="+961 70 123 456" disabled={loading} dir="ltr" data-testid="trial-phone"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base bg-gray-50 placeholder:text-gray-400 focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-50" />
              </div>

              {/* Interest chips — the gym's disciplines (no dropdown, per design-system) */}
              {disciplines.length > 0 && (
                <div>
                  <label className={cn('block text-sm font-medium text-gray-700 mb-1.5', isRTL && 'text-right font-arabic')}>
                    {t('programLabel')}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {disciplines.map((d) => (
                      <button key={d.id} type="button" data-testid="trial-interest-chip" data-id={d.id}
                        onClick={() => setDisciplineId(disciplineId === d.id ? '' : d.id)}
                        className={cn('rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                          disciplineId === d.id ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}>
                        {d.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Honeypot: visually hidden, off-screen, not announced — bots fill it. */}
              <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden">
                <label htmlFor="trial-company">Company</label>
                <input id="trial-company" type="text" tabIndex={-1} autoComplete="off"
                  value={honeypot} onChange={(e) => setHoneypot(e.target.value)} data-testid="trial-honeypot" />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600" data-testid="trial-error">{error}</div>
              )}

              <button type="submit" disabled={loading} data-testid="trial-submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3.5 text-base font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-95 shadow-glow-primary">
                {loading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <><Send className="h-5 w-5" /> {t('send')}</>
                )}
              </button>

              <p className="text-center text-xs text-gray-400">{t('noSpam')}</p>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
