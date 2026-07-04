import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import {
  CalendarDays, ClipboardCheck, Award, DollarSign, Dumbbell, Tent, Users, WifiOff,
  MessageCircle, Swords, Globe2, Languages, Check, ArrowRight,
} from 'lucide-react';

/**
 * VENDOR-LANDING (Phase 4, WL-ready) — the marketing surface for the VENDOR
 * product "Gym 360 Pro", distinct from any tenant gym landing. Rendered by
 * (marketing)/page.tsx when the request resolves as a vendor request (Host ∈
 * VENDOR_LANDING_HOSTS or ?vendor=1). Server component (reads VENDOR_CONTACT_EMAIL,
 * uses next-intl's isomorphic useTranslations). Copy is code-level i18n (ar/en/fr);
 * placeholder-but-real, no fake testimonials/logos/numbers. CSP-safe: classes only,
 * NO inline style attributes (the prod strict-dynamic style-src strips them).
 */

// The nine platform pillars (VENDOR-LANDING content spec).
const PILLARS = [
  { key: 'scheduling', Icon: CalendarDays, grad: 'from-blue-500 to-indigo-500' },
  { key: 'attendance', Icon: ClipboardCheck, grad: 'from-emerald-500 to-green-600' },
  { key: 'belts', Icon: Award, grad: 'from-amber-400 to-yellow-600' },
  { key: 'billing', Icon: DollarSign, grad: 'from-rose-500 to-red-600' },
  { key: 'pt', Icon: Dumbbell, grad: 'from-violet-500 to-fuchsia-600' },
  { key: 'camps', Icon: Tent, grad: 'from-orange-500 to-amber-600' },
  { key: 'leads', Icon: Users, grad: 'from-cyan-500 to-blue-600' },
  { key: 'offline', Icon: WifiOff, grad: 'from-slate-500 to-slate-700' },
  { key: 'whatsapp', Icon: MessageCircle, grad: 'from-green-500 to-emerald-600' },
] as const;

const WHO = [
  { key: 'martial', Icon: Swords, grad: 'from-red-500 to-orange-600' },
  { key: 'mena', Icon: Globe2, grad: 'from-blue-500 to-cyan-600' },
  { key: 'arabic', Icon: Languages, grad: 'from-emerald-500 to-teal-600' },
] as const;

const TIERS = [
  { key: 'starter', featured: false },
  { key: 'pro', featured: true },
  { key: 'enterprise', featured: false },
] as const;

export function VendorLanding({ locale }: { locale: string }) {
  const t = useTranslations('vendor');
  const isRTL = locale === 'ar';
  const arabic = isRTL ? 'font-arabic' : '';
  // Owner-configurable vendor contact; a clear placeholder until set (reported).
  const contactEmail = process.env.VENDOR_CONTACT_EMAIL || 'hello@gym360pro.com';
  const demoHref = `mailto:${contactEmail}?subject=${encodeURIComponent('Gym 360 Pro — demo request')}`;
  const productName = t('hero.name');

  return (
    <div className="bg-white">
      {/* ── Nav ── */}
      <nav className="absolute top-0 z-50 w-full">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <span data-testid="vendor-nav-name" className={cn('text-lg font-bold tracking-tight text-white', arabic)}>
            {productName}
          </span>
          <div className="flex items-center gap-6">
            <a href="#features" className="hidden text-sm font-medium text-white/90 transition-colors hover:text-primary-400 md:inline">
              {t('nav.features')}
            </a>
            <a href="#pricing" className="hidden text-sm font-medium text-white/90 transition-colors hover:text-primary-400 md:inline">
              {t('nav.pricing')}
            </a>
            <LanguageSwitcher locale={locale} />
            <a
              href={demoHref}
              className="rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/25"
            >
              {t('nav.cta')}
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section
        data-testid="vendor-hero"
        className="relative flex min-h-[85vh] items-center justify-center overflow-hidden bg-gradient-to-b from-secondary-950 via-secondary-900 to-secondary-950"
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-primary-900/30 via-transparent to-blue-900/20" />
        <div className="relative z-10 mx-auto max-w-4xl px-4 py-24 text-center sm:px-6 lg:px-8">
          <span className={cn('mb-6 inline-block rounded-full bg-primary-600/20 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary-300 ring-1 ring-primary-500/30', arabic)}>
            {t('hero.badge')}
          </span>
          <h1 data-testid="vendor-hero-name" className={cn('text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl', arabic)}>
            {productName}
          </h1>
          <p className={cn('mx-auto mt-6 max-w-2xl text-xl font-semibold text-primary-300 sm:text-2xl', arabic)}>
            {t('hero.tagline')}
          </p>
          <p className={cn('mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-gray-300', arabic)}>
            {t('hero.subtitle')}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href={demoHref}
              data-testid="vendor-cta"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-8 py-4 text-base font-semibold text-white shadow-glow-primary transition-all hover:scale-105 hover:bg-primary-700 active:scale-95 sm:w-auto"
            >
              {t('hero.ctaPrimary')}
              <ArrowRight className={cn('h-5 w-5', isRTL && 'rotate-180')} />
            </a>
            <a
              href="#features"
              className="inline-flex w-full items-center justify-center rounded-xl border-2 border-white/30 px-8 py-4 text-base font-semibold text-white transition-all hover:border-white/50 hover:bg-white/10 sm:w-auto"
            >
              {t('hero.ctaSecondary')}
            </a>
          </div>
        </div>
      </section>

      {/* ── Features (the nine pillars) ── */}
      <section id="features" data-testid="vendor-features" className="bg-gray-50 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-14 text-center">
            <h2 className={cn('text-3xl font-bold text-secondary-900 sm:text-4xl', arabic)}>{t('features.title')}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-gray-500">{t('features.subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map(({ key, Icon, grad }) => (
              <div
                key={key}
                data-testid="vendor-feature-card"
                data-pillar={key}
                className="group rounded-2xl bg-white p-7 shadow-elevation-1 transition-all duration-300 hover:-translate-y-1 hover:shadow-elevation-3"
              >
                <div className={cn('mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg', grad)}>
                  <Icon className="h-7 w-7 text-white" aria-hidden />
                </div>
                <h3 className={cn('text-lg font-semibold text-secondary-900', arabic)}>{t(`features.${key}.title` as Parameters<typeof t>[0])}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{t(`features.${key}.desc` as Parameters<typeof t>[0])}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Who it's for ── */}
      <section id="who" data-testid="vendor-who" className="bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-14 text-center">
            <h2 className={cn('text-3xl font-bold text-secondary-900 sm:text-4xl', arabic)}>{t('who.title')}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-gray-500">{t('who.subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {WHO.map(({ key, Icon, grad }) => (
              <div key={key} className="text-center">
                <div className={cn('mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg', grad)}>
                  <Icon className="h-8 w-8 text-white" aria-hidden />
                </div>
                <h3 className={cn('mb-3 text-xl font-semibold text-secondary-900', arabic)}>{t(`who.${key}.title` as Parameters<typeof t>[0])}</h3>
                <p className="leading-relaxed text-gray-500">{t(`who.${key}.desc` as Parameters<typeof t>[0])}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing (PLACEHOLDER tiers, clearly marked for owner copy) ── */}
      <section id="pricing" data-testid="vendor-pricing" className="bg-gray-50 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6 text-center">
            <h2 className={cn('text-3xl font-bold text-secondary-900 sm:text-4xl', arabic)}>{t('pricing.title')}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-gray-500">{t('pricing.subtitle')}</p>
          </div>
          <p
            data-testid="vendor-pricing-placeholder"
            className={cn('mx-auto mb-12 max-w-2xl rounded-xl border border-dashed border-amber-400 bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-800', arabic)}
          >
            {t('pricing.placeholder')}
          </p>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {TIERS.map(({ key, featured }) => (
              <div
                key={key}
                data-testid="vendor-tier"
                data-tier={key}
                className={cn(
                  'relative rounded-2xl bg-white p-8 shadow-elevation-1 transition-all duration-300 hover:-translate-y-1 hover:shadow-elevation-3',
                  featured && 'ring-2 ring-primary-500 shadow-elevation-2',
                )}
              >
                <h3 className={cn('text-xl font-semibold text-secondary-900', arabic)}>{t(`pricing.${key}.name` as Parameters<typeof t>[0])}</h3>
                <p className="mt-1 text-sm text-gray-500">{t(`pricing.${key}.tagline` as Parameters<typeof t>[0])}</p>
                <p className="mt-5">
                  <span className={cn('text-4xl font-bold text-secondary-900', arabic)}>{t(`pricing.${key}.price` as Parameters<typeof t>[0])}</span>
                  <span className="text-sm text-gray-500"> {t(`pricing.${key}.period` as Parameters<typeof t>[0])}</span>
                </p>
                <ul className="mt-6 space-y-3">
                  {(['f1', 'f2', 'f3'] as const).map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500" aria-hidden />
                      <span className="text-sm text-gray-600">{t(`pricing.${key}.${f}` as Parameters<typeof t>[0])}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={demoHref}
                  className={cn(
                    'mt-8 block rounded-xl px-6 py-3 text-center text-sm font-semibold transition-all hover:scale-105 active:scale-95',
                    featured ? 'bg-primary-600 text-white shadow-glow-primary hover:bg-primary-700' : 'bg-secondary-900 text-white hover:bg-secondary-800',
                  )}
                >
                  {t('pricing.cta')}
                </a>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-gray-500">{t('pricing.note')}</p>
        </div>
      </section>

      {/* ── Closing CTA ── */}
      <section className="bg-gradient-to-br from-secondary-950 to-secondary-900 py-20 lg:py-24">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className={cn('text-3xl font-bold text-white sm:text-4xl', arabic)}>{t('cta.title')}</h2>
          <p className={cn('mx-auto mt-4 max-w-xl text-lg text-gray-300', arabic)}>{t('cta.subtitle')}</p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href={demoHref}
              data-testid="vendor-cta-bottom"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-8 py-4 text-base font-semibold text-white shadow-glow-primary transition-all hover:scale-105 hover:bg-primary-700 active:scale-95 sm:w-auto"
            >
              {t('cta.button')}
              <ArrowRight className={cn('h-5 w-5', isRTL && 'rotate-180')} />
            </a>
            <Link
              href={`/${locale}/auth/login`}
              className="inline-flex w-full items-center justify-center rounded-xl border-2 border-white/30 px-8 py-4 text-base font-semibold text-white transition-all hover:border-white/50 hover:bg-white/10 sm:w-auto"
            >
              {t('cta.secondary')}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-secondary-950 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 text-center sm:px-6 lg:px-8">
          <span className={cn('text-lg font-bold text-white', arabic)}>{productName}</span>
          <p className={cn('max-w-md text-sm text-gray-400', arabic)}>{t('footer.tagline')}</p>
          <p className="text-xs text-gray-500">© {t('footer.rights')}</p>
        </div>
      </footer>
    </div>
  );
}
