import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Phone, MessageCircle } from 'lucide-react';

type HeroSectionProps = {
  locale: string;
};

export function HeroSection({ locale }: HeroSectionProps) {
  const isRTL = locale === 'ar';

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Real gym photo background (graceful: covered by gradients if missing) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/landing/hero.jpg"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Dark gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-secondary-950/90 via-secondary-900/85 to-primary-950/90" />

      {/* Crimson overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-secondary-950/95 via-secondary-950/50 to-secondary-950/30" />

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
          {isRTL ? 'ابدأ ملحمتك الخاصة' : 'Start Your Own Saga'}
        </p>

        {/* Headline */}
        <h1
          className={cn(
            'text-4xl sm:text-5xl lg:text-6xl xl:text-display-lg font-bold text-white leading-tight',
            isRTL && 'font-arabic'
          )}
        >
          {isRTL ? 'تدرّب كبطل القصة' : 'Train Like the Main Character'}
        </h1>

        {/* Subheadline */}
        <p className="mt-4 mx-auto max-w-2xl text-lg sm:text-xl text-gray-300 leading-relaxed">
          {isRTL
            ? 'ملاكمة تايلاندية • ملاكمة • لياقة • زومبا • تدريب السيدات • أطفال'
            : 'Muay Thai • Boxing • Fitness • Zumba • Ladies Training • Kids'}
        </p>
        <p className="mt-2 text-sm font-semibold tracking-wide text-gray-300">
          {isRTL ? 'من الأخوة فقيه' : 'by Fakih Brothers'}
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href={`/${locale}/auth/login`}
            className="w-full sm:w-auto rounded-xl bg-primary-600 px-8 py-4 text-base font-semibold text-white shadow-glow-primary hover:bg-primary-700 transition-all hover:scale-105 active:scale-95"
          >
            {isRTL ? 'ابدأ تجربتك المجانية' : 'Start Your Free Trial'}
          </Link>
          <a
            href="https://wa.me/96170628601"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border-2 border-white/30 px-8 py-4 text-base font-semibold text-white hover:bg-white/10 hover:border-white/50 transition-all"
          >
            <MessageCircle className="h-5 w-5" />
            {isRTL ? 'واتساب' : 'WhatsApp Us'}
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
          <span>2,760 {isRTL ? 'متابع' : 'followers'}</span>
        </div>
      </div>

      {/* Bottom fade to next section */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-gray-50 to-transparent" />
    </section>
  );
}