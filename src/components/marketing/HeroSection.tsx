import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Phone, MessageCircle } from 'lucide-react';

type HeroSectionProps = {
  locale: string;
};

export function HeroSection({ locale }: HeroSectionProps) {
  // AX-1: copy now flows through next-intl (the isRTL?ar:en bypass dropped fr).
  const t = useTranslations('landing.hero');
  const isRTL = locale === 'ar';

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Full-bleed gym photo (no baked-in text). Every usable source photo is
          portrait/square (the only landscape file, hero.jpg, has baked text), so
          object-cover crops it to a vertical band — see the wash below for why
          that's fine. LCP element → priority. */}
      <Image
        src="/landing/gym-1.jpg"
        alt=""
        aria-hidden
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />

      {/* AX-3: an EVEN, horizontally-uniform brand wash. The old overlay paired a
          to-br + a to-t gradient (uneven across the WIDTH), so the portrait photo's
          bright side read as a blob on the LEFT and unbalanced the centered content
          ("pushing the hero to the right"). A vertical-only wash subdues the photo
          equally left-to-right → a balanced, text-forward hero on any source crop. */}
      <div className="absolute inset-0 bg-gradient-to-b from-secondary-950/85 via-secondary-950/88 to-secondary-950/95" />

      {/* Symmetric crimson brand glow (centered → no left/right bias) for depth. */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 70% 55% at 50% 42%, rgba(205,20,25,0.18), transparent 70%)' }}
      />

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 pb-32 text-center">
        {/* Logo */}
        <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl shadow-2xl ring-2 ring-white/20">
          <Image
            src="/logo.jpg"
            alt="PRO LINE Gym"
            width={96}
            height={96}
            className="h-full w-full object-cover"
            priority
          />
        </div>

        {/* Tagline */}
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-primary-400">
          {t('tagline')}
        </p>

        {/* Headline */}
        <h1
          className={cn(
            'text-4xl sm:text-5xl lg:text-6xl xl:text-display-lg font-bold text-white leading-tight',
            isRTL ? 'font-arabic' : 'tracking-tight'
          )}
        >
          {t('headline')}
        </h1>

        {/* Subheadline */}
        <p className="mt-4 mx-auto max-w-2xl text-lg sm:text-xl text-gray-300 leading-relaxed">
          {t('subheadline')}
        </p>
        <p className="mt-2 text-sm font-semibold tracking-wide text-gray-300">
          {t('byline')}
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href={`/${locale}/auth/login`}
            className="w-full sm:w-auto rounded-xl bg-primary-600 px-8 py-4 text-base font-semibold text-white shadow-glow-primary hover:bg-primary-700 transition-all hover:scale-105 active:scale-95"
          >
            {t('ctaTrial')}
          </Link>
          <a
            href="https://wa.me/96170628601"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border-2 border-white/30 px-8 py-4 text-base font-semibold text-white hover:bg-white/10 hover:border-white/50 transition-all"
          >
            <MessageCircle className="h-5 w-5" />
            {t('ctaWhatsapp')}
          </a>
        </div>

        {/* Instagram handle */}
        <div className="mt-8 flex items-center justify-center gap-2 text-sm text-gray-400">
          <span>📸</span>
          <a
            href="https://instagram.com/prolinegym.lb"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary-400 transition-colors"
          >
            @prolinegym.lb
          </a>
          <span className="text-gray-600">•</span>
          <span>2,760 {t('followers')}</span>
        </div>
      </div>

      {/* Bottom fade to next section */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-gray-50 to-transparent" />
    </section>
  );
}