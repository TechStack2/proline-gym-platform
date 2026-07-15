import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { PLATFORM_BRAND } from '@/lib/brand';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { RequestDemoSection } from '@/components/marketing/RequestDemoSection';
import {
  CalendarDays, ClipboardCheck, Award, DollarSign, Dumbbell, Tent, Users, WifiOff,
  MessageCircle, ArrowRight, UserPlus, Settings, Rocket,
} from 'lucide-react';

/**
 * PRAXELLA-DOOR R2 — the marketing surface for the PLATFORM itself (Praxella),
 * distinct from any tenant gym landing. Rendered by (marketing)/page.tsx when the
 * host resolves as a vendor request (praxella.com / www / VENDOR_LANDING_HOSTS, or
 * ?vendor=1). Server component; copy is code-level i18n (ar/en/fr). The BRAND is a
 * text logotype driven by the single PLATFORM_BRAND constant (name + tagline) —
 * swap it there to rename or drop in a logo, no page edits.
 *
 * Dark: hero + footer are landing-dark (designed-dark, PINNED in both themes, like
 * HeroSection/LandingFooter); the mid sections adapt to the viewer's theme via
 * channel-vars. CSP-safe: classes only, NO inline style attributes.
 */

// The platform pillars shown in the features grid.
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

const STEPS = [
  { key: 'step1', Icon: UserPlus },
  { key: 'step2', Icon: Settings },
  { key: 'step3', Icon: Rocket },
] as const;

export function VendorLanding({ locale }: { locale: string }) {
  const t = useTranslations('vendor');
  const isRTL = locale === 'ar';
  const arabic = isRTL ? 'font-arabic' : '';
  const brand = PLATFORM_BRAND.name;

  return (
    <div className="bg-white">
      {/* ── Nav ── */}
      <nav className="absolute top-0 z-50 w-full">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <span data-testid="vendor-nav-name" className={cn('text-lg font-bold tracking-tight text-white', arabic)}>
            {brand}
          </span>
          <div className="flex items-center gap-4 sm:gap-6">
            <a href="#features" className="hidden text-sm font-medium text-white/90 transition-colors hover:text-primary-400 md:inline">
              {t('nav.features')}
            </a>
            <a href="#how" className="hidden text-sm font-medium text-white/90 transition-colors hover:text-primary-400 md:inline">
              {t('nav.how')}
            </a>
            <LanguageSwitcher locale={locale} />
            <ThemeToggle className="text-white hover:bg-white/10 hover:text-white dark:text-zinc-50" />
            <a
              href="#demo"
              data-testid="vendor-nav-cta"
              className="rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/25"
            >
              {t('nav.cta')}
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero (designed-dark, pinned in both themes) ── */}
      <section
        data-testid="vendor-hero"
        className="landing-dark relative flex min-h-[85vh] items-center justify-center overflow-hidden bg-gradient-to-b from-secondary-950 via-secondary-900 to-secondary-950"
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-primary-900/30 via-transparent to-blue-900/20" />
        <div className="relative z-10 mx-auto max-w-4xl px-4 py-24 text-center sm:px-6 lg:px-8">
          <span className={cn('mb-6 inline-block rounded-full bg-primary-600/20 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary-300 ring-1 ring-primary-500/30', arabic)}>
            {t('hero.badge')}
          </span>
          <h1 data-testid="vendor-hero-name" className={cn('text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl', arabic)}>
            {brand}
          </h1>
          <p className={cn('mx-auto mt-6 max-w-2xl text-xl font-semibold text-primary-300 sm:text-2xl', arabic)}>
            {t('hero.tagline')}
          </p>
          <p className={cn('mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-gray-300', arabic)}>
            {t('hero.subtitle')}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="#demo"
              data-testid="vendor-cta"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-8 py-4 text-base font-semibold text-primary-foreground shadow-glow-primary transition-all hover:scale-105 hover:bg-primary-700 active:scale-95 sm:w-auto"
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

      {/* ── Features grid ── */}
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

      {/* ── How it works ── */}
      <section id="how" data-testid="vendor-how" className="bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-14 text-center">
            <h2 className={cn('text-3xl font-bold text-secondary-900 sm:text-4xl', arabic)}>{t('howItWorks.title')}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-gray-500">{t('howItWorks.subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {STEPS.map(({ key, Icon }, i) => (
              <div key={key} data-testid="vendor-how-step" className="relative text-center">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg">
                  <Icon className="h-8 w-8 text-white" aria-hidden />
                </div>
                <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-primary-600">{t('howItWorks.stepLabel', { n: i + 1 })}</span>
                <h3 className={cn('mb-3 text-xl font-semibold text-secondary-900', arabic)}>{t(`howItWorks.${key}.title` as Parameters<typeof t>[0])}</h3>
                <p className="leading-relaxed text-gray-500">{t(`howItWorks.${key}.desc` as Parameters<typeof t>[0])}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Request a demo (client form → platform_leads) ── */}
      <RequestDemoSection locale={locale} />

      {/* ── Footer (designed-dark, pinned) ── */}
      <footer className="landing-dark bg-secondary-950 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 text-center sm:px-6 lg:px-8">
          <span className={cn('text-lg font-bold text-white', arabic)}>{brand}</span>
          <p className={cn('max-w-md text-sm text-gray-400', arabic)}>{PLATFORM_BRAND.tagline}</p>
          <p className="text-xs text-gray-500">© {new Date().getFullYear()} {brand}. {t('footer.rights')}</p>
        </div>
      </footer>
    </div>
  );
}
