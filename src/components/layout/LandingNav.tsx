'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { cn } from '@/lib/utils';
import { Menu, X } from 'lucide-react';

type LandingNavProps = {
  locale: string;
  // TENANT-CONTENT: the resolved LANDING gym's identity. Only the default gym falls
  // back to the built-in Proline name/logo; every other tenant shows its own.
  gymName?: string;
  logoUrl?: string;
  isDefault?: boolean;
};

export function LandingNav({ locale, gymName, logoUrl, isDefault = false }: LandingNavProps) {
  const brandName = gymName || (isDefault ? 'PRO LINE Gym' : '');
  const logoSrc = logoUrl || (isDefault ? '/logo.jpg' : '');
  const t = useTranslations('landing');
  const isRTL = locale === 'ar';
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLinks = [
    { href: '#disciplines', label: t('nav.disciplines') || 'Programs' },
    { href: '#pricing', label: t('nav.pricing') || 'Pricing' },
    { href: '#facility', label: t('nav.facility') || 'Facility' },
    { href: '#trial', label: t('nav.trial') || 'Free Trial' },
  ];

  return (
    <nav
      className={cn(
        'fixed top-0 z-50 w-full transition-all duration-300',
        scrolled
          ? 'bg-white/95 backdrop-blur-sm shadow-elevation-1 border-b'
          : 'bg-transparent'
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href={`/${locale}`} className="flex items-center gap-2.5">
            {logoSrc && (
              <div className="relative h-9 w-9 overflow-hidden rounded-lg shadow-sm">
                <Image
                  src={logoSrc}
                  alt={brandName}
                  width={36}
                  height={36}
                  className="h-full w-full object-cover"
                  priority
                />
              </div>
            )}
            <span
              data-testid="landing-nav-name"
              className={cn(
                'text-lg font-bold tracking-tight transition-colors',
                scrolled ? 'text-secondary-900' : 'text-white',
                isRTL && 'font-arabic'
              )}
            >
              {brandName}
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={cn(
                  'text-sm font-medium transition-colors hover:text-primary-500',
                  scrolled ? 'text-gray-600' : 'text-white/90'
                )}
              >
                {link.label}
              </a>
            ))}
            <LanguageSwitcher locale={locale} />
            {/* MJ-2 FRONT DOOR: the member sign-in link. Staff-only credential gate —
                there is NO public registration link (the public path is request → leads). */}
            <Link
              href={`/${locale}/auth/login`}
              data-testid="landing-member-signin"
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-semibold transition-all',
                scrolled
                  ? 'bg-primary-600 text-primary-foreground hover:bg-primary-700'
                  : 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm'
              )}
            >
              {t('nav.login') || 'Member sign-in'}
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className={cn(
              'md:hidden rounded-lg p-2 transition-colors',
              scrolled ? 'text-gray-600 hover:bg-gray-100' : 'text-white hover:bg-white/10'
            )}
            aria-label="Menu"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t bg-white shadow-lg animate-slide-in-from-right">
          <div className="px-4 py-3 space-y-2">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-2 border-t">
              <LanguageSwitcher locale={locale} variant="inline" />
            </div>
            <Link
              href={`/${locale}/auth/login`}
              data-testid="landing-member-signin-mobile"
              onClick={() => setMobileOpen(false)}
              className="block rounded-lg bg-primary-600 px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground hover:bg-primary-700 mt-2"
            >
              {t('nav.login') || 'Member sign-in'}
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}