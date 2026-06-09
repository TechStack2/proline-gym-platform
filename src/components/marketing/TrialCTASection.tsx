'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Send, CheckCircle } from 'lucide-react';

type TrialCTASectionProps = {
  locale: string;
};

const PROGRAM_OPTIONS_EN = [
  'Muay Thai', 'Boxing', 'Fitness', 'Zumba', 'Ladies Training', 'Kids',
];
const PROGRAM_OPTIONS_AR = [
  'ملاكمة تايلاندية', 'ملاكمة', 'لياقة بدنية', 'زومبا', 'تدريب السيدات', 'أطفال',
];

export function TrialCTASection({ locale }: TrialCTASectionProps) {
  const t = useTranslations('landing');
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
      setError(isRTL ? 'يرجى ملء جميع الحقول' : 'Please fill in all fields');
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
            {isRTL ? 'تم الاستلام!' : 'Got it!'}
          </h2>
          <p className="mt-3 text-lg text-white/80">
            {isRTL
              ? 'سنتواصل معك عبر واتساب خلال 24 ساعة!'
              : "We\'ll WhatsApp you within 24 hours!"}
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
              {isRTL ? 'ابدأ تجربتك المجانية' : 'Start Your Free Trial'}
            </h2>
            <p className="mt-4 text-lg text-white/80 leading-relaxed">
              {isRTL
                ? 'جرب أي برنامج بدون التزام. املأ النموذج و سنتواصل معك عبر واتساب لتحديد موعد جلستك الأولى.'
                : 'Try any program with no commitment. Fill out the form and we\'ll WhatsApp you to schedule your first session.'}
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
                  {isRTL ? 'الاسم' : 'Your Name'}
                </label>
                <input
                  id="trial-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isRTL ? 'أدخل اسمك' : 'Enter your name'}
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
                  {isRTL ? 'رقم الهاتف' : 'Phone Number'}
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
                  {isRTL ? 'البرنامج المهتم به' : 'Interested Program'}
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
                  <option value="">{isRTL ? 'اختر برنامجاً' : 'Select a program'}</option>
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
                    {isRTL ? 'أرسل' : 'Send'}
                  </>
                )}
              </button>

              <p className="text-center text-xs text-gray-400">
                {isRTL
                  ? 'سنرد عليك عبر واتساب. لا سبام.'
                  : 'We\'ll reply via WhatsApp. No spam.'}
              </p>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
