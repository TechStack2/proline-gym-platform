import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { DEFAULT_BRAND_COLOR } from '@/lib/marketing/gym';
import { Phone, MessageCircle } from 'lucide-react';

// WL-LANDING: the resolved gym's branding. Every field is optional → the template
// falls back to the built-in Proline default, so the demo is byte-identical.
export type HeroBranding = {
  name?: string;
  logoUrl?: string;
  heroImageUrl?: string;
  brandColor: string;   // always a safe hex (default crimson when the gym is unset)
  tagline?: string;
  // PROLINE-LANDING-DATA: contact CTAs from data (fallback = Proline defaults).
  contactWhatsapp?: string;          // wa.me digits
  instagramHandle?: string;          // no @
  instagramFollowers?: number | null; // null/undefined → the follower segment is dropped
};

type HeroSectionProps = {
  locale: string;
  branding?: HeroBranding;
  isDefault?: boolean;
};

const DEFAULT_BRANDING: HeroBranding = { brandColor: DEFAULT_BRAND_COLOR };

export function HeroSection({ locale, branding = DEFAULT_BRANDING, isDefault = false }: HeroSectionProps) {
  // AX-1: copy now flows through next-intl (the isRTL?ar:en bypass dropped fr).
  const t = useTranslations('landing.hero');
  const isRTL = locale === 'ar';
  // TENANT-CONTENT: only the default gym falls back to the built-in Proline identity
  // (name / logo / WhatsApp / Instagram). Every other tenant shows its own or nothing —
  // the CTAs/handle self-hide when empty. The full-bleed hero PHOTO (heavily washed,
  // no text/logo) keeps a neutral decorative fallback for both.
  const logoSrc = branding.logoUrl || (isDefault ? '/logo.jpg' : '');
  const heroSrc = branding.heroImageUrl || '/landing/gym-1.jpg';
  const brandName = branding.name || (isDefault ? 'PRO LINE Gym' : '');
  const tagline = branding.tagline || t('tagline');
  const waDigits = (branding.contactWhatsapp || (isDefault ? '96170628601' : '')).replace(/\D/g, '');
  const igHandle = (branding.instagramHandle || (isDefault ? 'prolinegym.lb' : '')).replace(/^@/, '');
  const igFollowers = branding.instagramFollowers ?? null;

  return (
    <section className="landing-dark relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Full-bleed gym photo (no baked-in text). Every usable source photo is
          portrait/square (the only landscape file, hero.jpg, has baked text), so
          object-cover crops it to a vertical band — see the wash below for why
          that's fine. LCP element → priority.
          HERO-FIX: the full-bleed positioning is on CLASSES (`absolute inset-0
          h-full w-full`), NOT on next/image `fill`'s inline `style` attribute.
          The prod CSP is `style-src 'self' 'strict-dynamic' 'nonce-…'` with no
          'unsafe-inline' — and nonces/strict-dynamic do NOT cover inline style
          ATTRIBUTES — so `fill`'s inline `position:absolute;inset:0` is stripped
          in prod. Without these classes the img collapsed to `position:static`,
          becoming an in-flow flex child of this `justify-center` section and
          sidelining the centered content to the right (the recurring "unbalanced
          hero"). Classes are stylesheet rules → CSP-safe → survive in prod. */}
      <Image
        src={heroSrc}
        alt=""
        aria-hidden
        fill
        priority
        sizes="100vw"
        className="absolute inset-0 h-full w-full object-cover object-center"
      />

      {/* AX-3: an EVEN, horizontally-uniform brand wash. The old overlay paired a
          to-br + a to-t gradient (uneven across the WIDTH), so the portrait photo's
          bright side read as a blob on the LEFT and unbalanced the centered content
          ("pushing the hero to the right"). A vertical-only wash subdues the photo
          equally left-to-right → a balanced, text-forward hero on any source crop. */}
      <div className="absolute inset-0 bg-gradient-to-b from-secondary-950/85 via-secondary-950/88 to-secondary-950/95" />

      {/* WL-LANDING: symmetric brand glow in the RESOLVED gym's brand color. Rendered
          as an inline SVG radial gradient — `stop-color` is an SVG PRESENTATION
          ATTRIBUTE (not the HTML `style` attribute), so the prod CSP
          `style-src … no-unsafe-inline` does NOT strip it (unlike an inline
          `style={{background}}`), and no per-request nonce is needed. Defaults to
          crimson (#cd1419) when the gym leaves brand_color unset. */}
      <svg
        aria-hidden
        data-testid="hero-brand-glow"
        data-brand-color={branding.brandColor}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <radialGradient id="wl-hero-glow" cx="50%" cy="42%" r="60%">
            <stop offset="0%" stopColor={branding.brandColor} stopOpacity={0.18} />
            <stop offset="70%" stopColor={branding.brandColor} stopOpacity={0} />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#wl-hero-glow)" />
      </svg>

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 pb-32 text-center">
        {/* Logo — the resolved gym's logo (default gym: /logo.jpg; other tenants: their
            own, or nothing when unset — never Proline's). */}
        {logoSrc && (
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl shadow-2xl ring-2 ring-white/20">
            <Image
              src={logoSrc}
              alt={brandName}
              width={96}
              height={96}
              className="h-full w-full object-cover"
              priority
            />
          </div>
        )}

        {/* WL-LANDING: the resolved gym's NAME (was implicit in the logo alt only) */}
        <p data-testid="hero-gym-name" className={cn('mb-3 text-2xl font-bold text-white', isRTL && 'font-arabic')}>
          {brandName}
        </p>

        {/* Tagline — the gym's tagline, else the default copy */}
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-primary-400">
          {tagline}
        </p>

        {/* Headline */}
        <h1
          className={cn(
            // DISPLAY-FONT: Anton (EN) / Alexandria ExtraBold (AR) via .font-display-hero
            // (globals.css) — it owns font-family/weight/transform + the AR optical ramp
            // (both scripts, via its [dir="rtl"] rule), so NO font-arabic here: twMerge
            // treats font-display-hero + font-arabic as one font-family group and would
            // drop the earlier one. The size/color/leading classes below stay.
            'font-display-hero text-4xl sm:text-5xl lg:text-6xl xl:text-display-lg font-bold text-white leading-tight',
            !isRTL && 'tracking-tight'
          )}
        >
          {t('headline')}
        </h1>

        {/* Subheadline. STABILIZE-2: reserve TWO lines here. This is the SOLE
            element that changes height on the Arabic web-font swap — at the
            full max-w-2xl width the size-adjusted fallback (narrower glyphs) fits
            the disciplines line in 1 row while IBM Plex Sans Arabic wraps to 2,
            growing the centred hero block by exactly that line → re-centring
            everything → the ax1 landing-CLS flake. A 2-line min-height makes the
            fallback occupy the final height from first paint, so the swap can't
            reflow it (only md+ reaches the 2-line width; narrower already wraps). */}
        <p className="mt-4 mx-auto max-w-2xl text-lg sm:text-xl text-gray-300 leading-relaxed md:min-h-[3.5rem]">
          {t('subheadline')}
        </p>
        {/* TENANT-CONTENT: the "by Fakih Brothers" byline is the Proline founders' credit —
            default gym only, never on another tenant's hero. */}
        {isDefault && (
          <p className="mt-2 text-sm font-semibold tracking-wide text-gray-300">
            {t('byline')}
          </p>
        )}

        {/* CTAs */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href={`/${locale}/auth/login`}
            className="w-full sm:w-auto rounded-xl bg-primary-600 px-8 py-4 text-base font-semibold text-primary-foreground shadow-glow-primary hover:bg-primary-700 transition-all hover:scale-105 active:scale-95"
          >
            {t('ctaTrial')}
          </Link>
          {waDigits && (
            <a
              href={`https://wa.me/${waDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="hero-wa-cta"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border-2 border-white/30 px-8 py-4 text-base font-semibold text-white hover:bg-white/10 hover:border-white/50 transition-all"
            >
              <MessageCircle className="h-5 w-5" />
              {t('ctaWhatsapp')}
            </a>
          )}
        </div>

        {/* Instagram handle (per-gym; hidden entirely when the gym has no handle — a new
            tenant never shows Proline's @handle or its follower social proof). */}
        {igHandle && (
          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-gray-400">
            <span>📸</span>
            <a
              href={`https://instagram.com/${igHandle}`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="hero-ig"
              className="hover:text-primary-400 transition-colors"
            >
              @{igHandle}
            </a>
            {igFollowers != null && (
              <>
                <span className="text-gray-600">•</span>
                <span data-testid="hero-ig-followers">{igFollowers.toLocaleString('en-US')} {t('followers')}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom fade to next section */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-gray-50 to-transparent" />
    </section>
  );
}