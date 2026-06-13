'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Send, CheckCircle } from 'lucide-react';

type TrialCTASectionProps = {
  locale: string;
  // X1: when set (e.g. `/en?gym=<slug>`), public-lead submits target that gym.
  gymSlug?: string;
};

const PROGRAM_OPTIONS_EN = [
  'Muay Thai', 'Boxing', 'Fitness', 'Zumba', 'Ladies Training', 'Kids',
];
const PROGRAM_OPTIONS_AR = [
  'ملاكمة تايلاندية', 'ملاكمة', 'لياقة بدنية', 'زومبا', 'تدريب السيدات', 'أطفال',
];

export function TrialCTASection({ locale, gymSlug }: TrialCTASectionProps) {
  const t = useTranslations('landing.trialCta');
  const isRTL = locale === 'ar';
  const supabase = createClient();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [program, setProgram] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const programOptions = isRTL ? PROGRAM_OPTIONS_AR : PROGRAM_OPTIONS_EN;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !phone) {
      setError(t('fillAll'));
      return;
    }

    setLoading(true);
    try {
      // p_program is mapped to a real interested_discipline_id inside the RPC,
      // which also emits the lead_new staff notification (anon caller → emitted
      // in the SECURITY DEFINER RPC; sanctioned F2 exception).
      const { data, error: rpcError } = await supabase.rpc('submit_public_lead', {
        p_first_name: name,
        p_phone: phone,
        p_source: 'website',
        p_program: program || null,
        p_gym_slug: gymSlug || null,
      });

      if (rpcError) throw rpcError;

      setSuccess(true);
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
          <h2 className={cn('mt-6 text-3xl font-bold text-white', isRTL && 'text-right font-arabic')}>
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
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="trial-name"
                  className={cn('block text-sm font-medium text-gray-700 mb-1.5', isRTL && 'text-right font-arabic')}
                >
                  {t('nameLabel')}
                </label>
                <input
                  id="trial-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('namePh')}
                  disabled={loading}
                  className={cn(
                    'w-full rounded-xl border border-gray-200 px-4 py-3 text-base',
                    'bg-gray-50 placeholder:text-gray-400',
                    'focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    isRTL && 'text-right'
                  )}
                />
              </div>

              <div>
                <label
                  htmlFor="trial-phone"
                  className={cn('block text-sm font-medium text-gray-700 mb-1.5', isRTL && 'text-right font-arabic')}
                >
                  {t('phoneLabel')}
                </label>
                <input
                  id="trial-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+961 70 123 456"
                  disabled={loading}
                  dir="ltr"
                  className={cn(
                    'w-full rounded-xl border border-gray-200 px-4 py-3 text-base',
                    'bg-gray-50 placeholder:text-gray-400',
                    'focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100',
                    'disabled:cursor-not-allowed disabled:opacity-50'
                  )}
                />
              </div>

              <div>
                <label
                  htmlFor="trial-program"
                  className={cn('block text-sm font-medium text-gray-700 mb-1.5', isRTL && 'text-right font-arabic')}
                >
                  {t('programLabel')}
                </label>
                <select
                  id="trial-program"
                  value={program}
                  onChange={(e) => setProgram(e.target.value)}
                  disabled={loading}
                  className={cn(
                    'w-full rounded-xl border border-gray-200 px-4 py-3 text-base',
                    'bg-gray-50',
                    'focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100',
                    'disabled:cursor-not-allowed disabled:opacity-50'
                  )}
                >
                  <option value="">{t('programPh')}</option>
                  {programOptions.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3.5 text-base font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-95 shadow-glow-primary"
              >
                {loading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    {t('send')}
                  </>
                )}
              </button>

              <p className="text-center text-xs text-gray-400">
                {t('noSpam')}
              </p>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
