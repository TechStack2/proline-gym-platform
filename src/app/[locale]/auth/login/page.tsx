'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { signInWithPhone, signInWithEmail } from '@/lib/auth/actions';
import { withAuthTimeout, isTransportError } from '@/lib/auth/transport';
import { useAuthGymBrand } from '@/hooks/use-auth-gym-brand';
import { AuthLocaleSwitcher } from '@/components/shared/auth-locale-switcher';
import { cn } from '@/lib/utils';
import { Mail, Lock, Eye, EyeOff, Users, LogIn, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

type Props = { params: { locale: string } };

const DEMO_ACCOUNTS = [
  {
    email: 'owner@prolinegym.lb',
    label: 'Owner — Staff Dashboard',
    labelAr: 'المالك — لوحة التحكم',
    labelFr: 'Propriétaire — Tableau de bord',
    role: 'owner',
  },
  {
    email: 'coach@prolinegym.lb',
    label: 'Coach — Mobile App',
    labelAr: 'مدرب — تطبيق الجوال',
    labelFr: 'Coach — Application mobile',
    role: 'coach',
  },
  {
    email: 'reception@prolinegym.lb',
    label: 'Receptionist — Staff Dashboard',
    labelAr: 'استقبال — لوحة التحكم',
    labelFr: 'Réception — Tableau de bord',
    role: 'receptionist',
  },
  {
    email: 'student@prolinegym.lb',
    label: 'Student — Member Portal',
    labelAr: 'طالب — بوابة الأعضاء',
    labelFr: 'Étudiant — Portail membre',
    role: 'student',
  },
  {
    // DEMO-GUARDIAN: the 5th account — a parent linked to the hero student
    // (Karim) so the kid-switcher + household billing can be demoed. Seeded by
    // migration 000066 (auth user + parent role + guardians + guardian_students).
    email: 'guardian@prolinegym.lb',
    label: 'Guardian — Parent Portal',
    labelAr: 'ولي الأمر — بوابة الوالدين',
    labelFr: 'Tuteur — Portail parent',
    role: 'parent',
  },
];

export default function LoginPage({ params }: Props) {
  const { locale } = params;
  const t = useTranslations('auth');
  const isRTL = locale === 'ar';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // hide-demo (go-live): the demo-account buttons are OFF by default so Proline's real
  // login is clean. The SAME deployment's demo showcase surfaces them with `?demo=1` for
  // sales pitches. Read client-side (no Suspense needed; the default render stays clean —
  // showDemo starts false, so prod never flashes the buttons).
  const [showDemo, setShowDemo] = useState(false);
  useEffect(() => {
    try { setShowDemo(new URLSearchParams(window.location.search).get('demo') === '1'); } catch { /* noop */ }
  }, []);

  // WL-DOMAIN-ROUTING: brand the login entry from the request Host — extracted to
  // useAuthGymBrand (DA-42) so forgot/reset carry the same identity.
  const brand = useAuthGymBrand(locale);
  const brandName = brand.name || 'PRO LINE Gym';

  // AUTH-STUCK: success keeps the spinner only for a bounded grace window — if
  // navigation to /dashboard hasn't unmounted this page by then (e.g. the network
  // dropped right after the cookies were set), stop spinning and let the user retry.
  const NAV_GRACE_MS = 8_000;
  const navGraceTimer = useRef<number | null>(null);
  useEffect(() => () => { if (navGraceTimer.current !== null) window.clearTimeout(navGraceTimer.current); }, []);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (navGraceTimer.current !== null) { window.clearTimeout(navGraceTimer.current); navGraceTimer.current = null; }

    if (!email || !password) {
      setError(t('errEmailPassword'));
      return;
    }

    setLoading(true);

    // INVITE-PHONE-UX (Option B): staff sign in with email; invited members sign in
    // with their PHONE. The Supabase phone provider is disabled, so a phone-shaped
    // input goes through a SERVER ACTION that resolves phone → the hidden synthetic
    // email + signs in server-side (setting the session cookies), returning only a
    // generic ok/fail (no account-existence enumeration).
    // ERROR-HARDEN #3: email sign-in goes through the SERVER action too — the old
    // client-side supabase.auth.signInWithPassword bypassed the per-(IP+identifier)
    // limiter and leaked raw GoTrue error.message.
    //
    // AUTH-STUCK (field failure, prod): a server-action await REJECTS on a network
    // drop. Without the try/catch the exception escaped, setLoading(false) never
    // ran, and the button spun forever. Both branches now share one guarded call:
    // catch classifies transport vs generic (a transport error carries no account
    // signal — third state, anti-enumeration posture unchanged), finally clears
    // the spinner for every non-success outcome, and withAuthTimeout bounds a
    // hung request so it fails visibly instead of never settling.
    const id = email.trim();
    const isPhone = /^\+?[0-9][0-9\s-]{5,}$/.test(id);
    let signedIn = false;
    try {
      const res = await withAuthTimeout(isPhone ? signInWithPhone(id, password) : signInWithEmail(id, password));
      if (res.ok) {
        signedIn = true;
      } else {
        // AUTH-ERRORS: four distinct states, because the old single message made a
        // wrong password look like a platform outage (field failure, 7/20).
        //   · credentials  — identical for a wrong password AND for an address with
        //                    no account (J6: no enumeration oracle; the action puts
        //                    both in this bucket, so the copy cannot drift apart)
        //   · rate_limited — LOGIN-LIMITER; fires on the SUBMITTED identifier
        //                    whether or not it exists, so it leaks nothing either
        //   · server       — OUR failure; never tell someone their password is
        //                    wrong when it was our side that broke
        //   · connection   — the transport state below (AUTH-STUCK)
        setError(
          res.reason === 'rate_limited' ? t('tooManyAttempts')
          : res.reason === 'server' ? t('errServer')
          : t('errCredentials'),
        );
      }
    } catch (err) {
      // A rejected action is either the network (the user's) or a server that
      // answered badly (ours). Both are true statements; neither mentions the
      // account, so the anti-enumeration posture is untouched.
      setError(isTransportError(err) ? t('errConnection') : t('errServer'));
    } finally {
      if (!signedIn) setLoading(false);
    }
    if (!signedIn) return;

    // Cookies were set server-side. AUTH-NAV-FIX: land on /dashboard with a
    // FULL-DOCUMENT navigation, NOT a next-intl soft push. /dashboard is a server
    // redirect stub → the role home (/today · /coach · /portal, via middleware +
    // the stub). A soft router.push INTO that stub fired the redirect
    // mid-client-transition and threw React #310 ("Rendered more hooks than during
    // the previous render") on iOS Safari (crash #2). window.location.assign lets
    // middleware role-routing + the stub resolve as ordinary full-page server
    // redirects — no App-Router transition to choke — and the full reload adopts
    // the freshly-set session (so the old router.refresh() is no longer needed).
    // The spinner survives navigation, but only for NAV_GRACE_MS: the page unloads
    // first, yet on the rare stall (network dropped after the cookies were set)
    // the timer still surfaces the message instead of spinning silently.
    window.location.assign(`/${locale}/dashboard`);
    navGraceTimer.current = window.setTimeout(() => {
      navGraceTimer.current = null;
      setLoading(false);
      setError(t('errSlowNav'));
    }, NAV_GRACE_MS);
  };

  const fillDemoAccount = (accountEmail: string) => {
    setEmail(accountEmail);
    setPassword('ProlineDemo2024!');
    setError('');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Back to site */}
        <Link
          href={`/${locale}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className={cn('h-4 w-4', isRTL && 'rotate-180')} />
          {t('backToSite')}
        </Link>

        {/* DA-42: from sm up the form sits in the §2 card recipe (a real auth panel)
            instead of a bare mobile column floating on gray; ≤sm stays frameless. */}
        <div className="sm:rounded-2xl sm:border sm:bg-white sm:p-8 sm:shadow-elevation-1">
        {/* Logo */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl shadow-lg ring-2 ring-primary-200/50">
            <Image
              src={brand.logoUrl || '/logo.jpg'}
              alt={brandName}
              width={80}
              height={80}
              className="h-full w-full object-cover"
              priority
            />
          </div>
          <h1 data-testid="login-brand-name" className={cn('text-2xl font-bold text-gray-900', isRTL && 'font-arabic')}>
            {brandName}
          </h1>
          {/* DA-58: gym-voiced, not platform-voiced — the member signs in to THEIR
              gym (brandName is already the per-locale resolved gym name). */}
          <p className="mt-1 text-sm text-gray-500">
            {t('signInGym', { gym: brandName })}
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
                placeholder="you@email.com"
                disabled={loading}
                className={cn(
                  'w-full rounded-xl border border-gray-200 py-3 text-base',
                  'bg-white text-gray-900 placeholder:text-gray-400',
                  'focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  isRTL ? 'pr-12 pl-4 text-right' : 'pl-12 pr-4'
                )}
                dir="ltr"
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
                placeholder="••••••••"
                disabled={loading}
                className={cn(
                  'w-full rounded-xl border border-gray-200 py-3 text-base',
                  'bg-white text-gray-900 placeholder:text-gray-400',
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

          {/* J6 — forgot-password entry (platform-wide gap, ships with go-live) */}
          <div className={cn('flex', isRTL ? 'justify-start' : 'justify-end')}>
            <Link
              href={`/${locale}/auth/forgot`}
              data-testid="forgot-password-link"
              className="text-sm font-medium text-primary-600 hover:underline"
            >
              {t('forgotPassword')}
            </Link>
          </div>

          {error && (
            <div data-testid="login-error" className="rounded-xl tint-danger p-3 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 py-3.5 text-base font-semibold text-primary-foreground transition-all hover:bg-primary-700 hover:scale-[1.01] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
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

        {/* Demo Accounts Quick Select — hide-demo: OFF by default; shown only with ?demo=1 */}
        {showDemo && (
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
            {/* DA-58: the account rows READ tappable — visible border + white ground +
                press state (they always filled on click, but looked like static
                monospace pills). */}
            {DEMO_ACCOUNTS.map((acct) => (
              <button
                key={acct.email}
                type="button"
                data-testid="demo-account"
                data-email={acct.email}
                onClick={() => fillDemoAccount(acct.email)}
                className={cn(
                  'flex items-center justify-between rounded-lg px-3 py-2 text-start text-xs transition-all active:scale-[0.99]',
                  email === acct.email
                    ? 'bg-primary-50 text-primary-700 border border-primary-200'
                    : 'text-gray-600 border border-gray-200 bg-white shadow-sm hover:border-primary-200 hover:bg-primary-50/40'
                )}
              >
                <span className="font-medium">
                  {locale === 'ar' ? acct.labelAr : locale === 'fr' ? acct.labelFr : acct.label}
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
        )}
        </div>

        {/* Language switcher (shared with forgot/reset — DA-42) */}
        <AuthLocaleSwitcher locale={locale} />
      </div>
    </div>
  );
}
