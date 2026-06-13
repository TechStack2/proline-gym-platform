'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Mail, Lock, Eye, EyeOff, Users, LogIn, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

type Props = { params: { locale: string } };

const DEMO_ACCOUNTS = [
  {
    email: 'owner@prolinegym.lb',
    label: 'Owner — Staff Dashboard',
    labelAr: 'المالك — لوحة التحكم',
    role: 'owner',
  },
  {
    email: 'coach@prolinegym.lb',
    label: 'Coach — Mobile App',
    labelAr: 'مدرب — تطبيق الجوال',
    role: 'coach',
  },
  {
    email: 'reception@prolinegym.lb',
    label: 'Receptionist — Staff Dashboard',
    labelAr: 'استقبال — لوحة التحكم',
    role: 'receptionist',
  },
  {
    email: 'student@prolinegym.lb',
    label: 'Student — Member Portal',
    labelAr: 'طالب — بوابة الأعضاء',
    role: 'student',
  },
];

export default function LoginPage({ params }: Props) {
  const { locale } = params;
  const t = useTranslations('auth');
  const router = useRouter();
  const supabase = createClient();
  const isRTL = locale === 'ar';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError(t('errEmailPassword'));
      return;
    }

    setLoading(true);

    // ON-1: staff use email; invited members/coaches are PHONE-credentialed.
    // Detect a phone shape and sign in accordingly.
    const id = email.trim();
    const isPhone = /^\+?[0-9][0-9\s-]{5,}$/.test(id);
    const { error: loginError } = await supabase.auth.signInWithPassword(
      isPhone ? { phone: id.replace(/[\s-]/g, ''), password } : { email: id, password },
    );

    if (loginError) {
      setError(loginError.message);
      setLoading(false);
      return;
    }

    router.push('/dashboard');
  };

  const fillDemoAccount = (accountEmail: string) => {
    setEmail(accountEmail);
    setPassword('ProlineDemo2024!');
    setError('');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Back to site */}
        <Link
          href={`/${locale}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('backToSite')}
        </Link>

        {/* Logo */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl shadow-lg ring-2 ring-primary-200/50">
            <Image
              src="/logo.jpg"
              alt="PRO LINE Gym"
              width={80}
              height={80}
              className="h-full w-full object-cover"
              priority
            />
          </div>
          <h1 className={cn('text-2xl font-bold text-gray-900', isRTL && 'font-arabic')}>
            PRO LINE Gym
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('signInPlatform')}
          </p>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleEmailLogin} className="space-y-4">
          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className={cn('mb-1.5 block text-sm font-medium text-gray-700', isRTL && 'text-right font-arabic')}
            >
              {t('emailOrPhoneLabel') || t('emailLabel') || 'Email or phone'}
            </label>
            <div className="relative">
              <Mail className={cn(
                'absolute top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400',
                isRTL ? 'right-3' : 'left-3'
              )} />
              <input
                id="email"
                type="text"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@prolinegym.lb"
                disabled={loading}
                className={cn(
                  'w-full rounded-xl border border-gray-200 py-3 text-base',
                  'bg-white placeholder:text-gray-400',
                  'focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  isRTL ? 'pr-12 pl-4 text-right' : 'pl-12 pr-4'
                )}
                dir="ltr"
                autoFocus
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className={cn('mb-1.5 block text-sm font-medium text-gray-700', isRTL && 'text-right font-arabic')}
            >
              {t('passwordLabel') || 'Password'}
            </label>
            <div className="relative">
              <Lock className={cn(
                'absolute top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400',
                isRTL ? 'right-3' : 'left-3'
              )} />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="ProlineDemo2024!"
                disabled={loading}
                className={cn(
                  'w-full rounded-xl border border-gray-200 py-3 text-base',
                  'bg-white placeholder:text-gray-400',
                  'focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  isRTL ? 'pr-12 pl-12 text-right' : 'pl-12 pr-12'
                )}
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={cn(
                  'absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600',
                  isRTL ? 'left-3' : 'right-3'
                )}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 py-3.5 text-base font-semibold text-white transition-all hover:bg-primary-700 hover:scale-[1.01] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <LogIn className="h-5 w-5" />
                {t('login') || 'Sign In'}
              </>
            )}
          </button>
        </form>

        {/* Demo Accounts Quick Select */}
        <div className="mt-6 border-t border-gray-100 pt-5">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100">
              <Users className="h-4 w-4 text-amber-600" />
            </div>
            <span className={cn('text-sm font-semibold text-gray-700', isRTL && 'font-arabic')}>
              {t('demoAccounts')}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            {DEMO_ACCOUNTS.map((acct) => (
              <button
                key={acct.email}
                type="button"
                onClick={() => fillDemoAccount(acct.email)}
                className={cn(
                  'flex items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-all',
                  email === acct.email
                    ? 'bg-primary-50 text-primary-700 border border-primary-200'
                    : 'text-gray-600 hover:bg-gray-50 border border-transparent'
                )}
              >
                <span className="font-medium">
                  {isRTL ? acct.labelAr : acct.label}
                </span>
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded font-mono',
                  email === acct.email ? 'bg-primary-100' : 'bg-gray-100'
                )}>
                  {acct.email}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] text-gray-400">
            {t('demoPassword')} 
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[10px] font-mono text-gray-600">ProlineDemo2024!</code>
          </p>
        </div>

        {/* Language switcher */}
        <div className="mt-5 flex justify-center gap-1">
          {(['ar', 'en', 'fr'] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => router.replace('/auth/login', { locale: lang })}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                locale === lang
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-gray-500 hover:bg-gray-100'
              )}
            >
              {lang === 'ar' ? 'العربية' : lang === 'en' ? 'English' : 'Français'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
