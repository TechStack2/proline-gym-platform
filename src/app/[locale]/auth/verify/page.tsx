'use client';

import { useTranslations } from 'next-intl';
import { useCaughtErrorText } from '@/lib/errors/use-error-text';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { ArrowLeft, Check } from 'lucide-react';

type Props = {
  params: { locale: string };
  searchParams: Promise<{ phone: string }>;
};

export default function VerifyPage({ params }: Props) {
  const { locale } = params;
  const t = useTranslations('auth');
  const errCaught = useCaughtErrorText();
  const router = useRouter();
  const supabase = createClient();
  const isRTL = locale === 'ar';

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);

    // Auto-advance to next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(''));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = code.join('');

    if (token.length !== 6) {
      setError(t('invalidCode'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Get phone from URL search params
      const searchParams = new URLSearchParams(window.location.search);
      const phone = searchParams.get('phone') || '';

      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: 'sms',
      });

      if (verifyError) throw verifyError;

      // Success. AUTH-NAV-FIX: full-document navigation into the /dashboard redirect
      // stub (same crash-avoidance as the login door) — NOT a next-intl soft push.
      // A soft router.push into the /dashboard→role-home server redirect fires the
      // redirect mid-client-transition and throws React #310 on iOS Safari.
      window.location.assign(`/${locale}/dashboard`);
    } catch (err: any) {
      setError(errCaught(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <button
          onClick={() => router.push('/auth/login')}
          className="mb-8 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('backToLogin')}
        </button>

        <h1 className={cn('text-2xl font-bold text-gray-900', isRTL && 'font-arabic')}>
          {t('verifyTitle')}
        </h1>
        <p className="mt-2 text-sm text-gray-500">{t('verifySubtitle')}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          {/* Code inputs */}
          <div className="flex justify-center gap-2" dir="ltr">
            {code.map((digit, index) => (
              <input
                key={index}
                ref={(el) => { inputRefs.current[index] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={index === 0 ? handlePaste : undefined}
                disabled={loading}
                className="h-14 w-12 rounded-lg border border-gray-200 text-center text-xl font-bold
                  focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100
                  disabled:cursor-not-allowed disabled:opacity-50"
              />
            ))}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || code.join('').length !== 6}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold text-white transition-colors',
              'bg-primary-600 hover:bg-primary-700',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <Check className="h-4 w-4" />
                {t('verifyButton')}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
