'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Instagram, Facebook, MessageCircle, Youtube } from 'lucide-react';
import { EMPTY_CONTACT, type LandingContact } from '@/lib/marketing/contact';
import { DAY_KEYS, hasOfficeHours, normalizeOfficeHours, type OfficeHours } from '@/lib/marketing/office-hours';

// lucide has no TikTok glyph — a minimal inline mark keeps the social row honest.
function TiktokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M16.5 3c.3 2 1.5 3.6 3.5 3.9V10c-1.4 0-2.7-.4-3.8-1.1v6.3a5.7 5.7 0 1 1-5.7-5.7c.3 0 .6 0 .9.1v3.1a2.6 2.6 0 1 0 1.8 2.5V3h3.3Z" />
    </svg>
  );
}

type LandingFooterProps = {
  locale: string;
  // TENANT-CONTENT: the resolved LANDING gym's identity + public contact. Only the
  // default gym (isDefault) falls back to the built-in Proline identity; every other
  // tenant shows its own row with honest empty fallbacks (empty = the row is hidden).
  gymName?: string;
  logoUrl?: string;
  address?: string;
  contact?: LandingContact;
  // LANDING-CUSTOM: per-gym office hours (JSONB). NULL/absent → the hardcoded i18n
  // fallback below stays (unset gyms render byte-identical).
  officeHours?: OfficeHours | null;
  isDefault?: boolean;
};

export function LandingFooter({ locale, gymName, logoUrl, address, contact = EMPTY_CONTACT, officeHours = null, isDefault = false }: LandingFooterProps) {
  const t = useTranslations('landing');
  const isRTL = locale === 'ar';
  const showHours = hasOfficeHours(officeHours);
  const hours = showHours ? normalizeOfficeHours(officeHours) : null;
  const brandName = gymName || (isDefault ? 'PRO LINE Gym' : '');
  const logoSrc = logoUrl || (isDefault ? '/logo.jpg' : '');
  const addressLine = address || (isDefault ? 'Sky Business Center, Baabda' : '');

  return (
    <footer className="surface-fixed-dark bg-secondary-950 text-gray-300">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              {logoSrc && (
                <div className="relative h-8 w-8 overflow-hidden rounded-lg">
                  <Image src={logoSrc} alt={brandName} width={32} height={32} className="h-full w-full object-cover" />
                </div>
              )}
              <span data-testid="footer-brand-name" className={cn('text-lg font-bold text-white', isRTL && 'font-arabic')}>
                {brandName}
              </span>
            </div>
            <p className="text-sm text-gray-400">
              {t('footer.tagline') || 'Unleash the fighter in you 🥊'}
            </p>
            <div className="flex items-center gap-3 pt-2">
              {contact.instagram && (
                <a
                  href={`https://instagram.com/${contact.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="footer-ig"
                  className="rounded-lg p-2 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Instagram"
                >
                  <Instagram className="h-5 w-5" />
                </a>
              )}
              {contact.facebook && (
                <a
                  href={`https://facebook.com/${contact.facebook}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="footer-fb"
                  className="rounded-lg p-2 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Facebook"
                >
                  <Facebook className="h-5 w-5" />
                </a>
              )}
              {contact.whatsapp && (
                <a
                  href={`https://wa.me/${contact.whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="footer-wa"
                  className="rounded-lg p-2 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="WhatsApp"
                >
                  <MessageCircle className="h-5 w-5" />
                </a>
              )}
              {contact.tiktok && (
                <a
                  href={`https://tiktok.com/@${contact.tiktok}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="footer-tiktok"
                  className="rounded-lg p-2 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="TikTok"
                >
                  <TiktokIcon className="h-5 w-5" />
                </a>
              )}
              {contact.youtube && (
                <a
                  href={`https://youtube.com/@${contact.youtube}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="footer-youtube"
                  className="rounded-lg p-2 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="YouTube"
                >
                  <Youtube className="h-5 w-5" />
                </a>
              )}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">{t('footer.links') || 'Quick Links'}</h4>
            <ul className="space-y-2.5">
              <li><Link href={`/${locale}/auth/login`} data-testid="landing-footer-signin" className="text-sm text-gray-400 hover:text-white transition-colors">{t('footer.login') || 'Member sign-in'}</Link></li>
              <li><a href="#disciplines" className="text-sm text-gray-400 hover:text-white transition-colors">{t('footer.programs') || 'Programs'}</a></li>
              <li><a href="#pricing" className="text-sm text-gray-400 hover:text-white transition-colors">{t('footer.plans') || 'Membership Plans'}</a></li>
              <li><a href="#trial" className="text-sm text-gray-400 hover:text-white transition-colors">{t('footer.trial') || 'Free Trial'}</a></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">{t('footer.contact') || 'Contact'}</h4>
            <ul className="space-y-2.5">
              {addressLine && (
                <li className="text-sm text-gray-400" data-testid="footer-address">
                  {addressLine}
                </li>
              )}
              {contact.phone && (
                <li>
                  <a href={`tel:${contact.phone.replace(/\s/g, '')}`} dir="ltr" data-testid="footer-phone" className="text-sm text-gray-400 hover:text-white transition-colors">
                    {contact.phone}
                  </a>
                </li>
              )}
              {contact.email && (
                <li>
                  <a href={`mailto:${contact.email}`} data-testid="footer-email" className="text-sm text-gray-400 hover:text-white transition-colors">
                    {contact.email}
                  </a>
                </li>
              )}
            </ul>
          </div>

          {/* Hours — data-driven per-gym when office_hours is set; otherwise the
              hardcoded i18n fallback stays (unset gyms render byte-identical). */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">{t('footer.hours') || 'Hours'}</h4>
            {hours ? (
              <ul className="space-y-2.5" data-testid="footer-hours">
                {DAY_KEYS.map((day) => (
                  <li key={day} className="flex items-center justify-between gap-4 text-sm text-gray-400">
                    <span className={cn(isRTL && 'font-arabic')}>{t(`footer.days.${day}`)}</span>
                    <span dir="ltr" className="tabular-nums">
                      {hours[day].closed
                        ? t('footer.closed')
                        : `${hours[day].open} – ${hours[day].close}`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="space-y-2.5">
                <li className="text-sm text-gray-400">
                  {t('footer.weekdays') || 'Mon – Fri: 6:00 AM – 10:00 PM'}
                </li>
                <li className="text-sm text-gray-400">
                  {t('footer.saturday') || 'Sat: 8:00 AM – 8:00 PM'}
                </li>
                <li className="text-sm text-gray-400">
                  {t('footer.sunday') || 'Sun: 9:00 AM – 6:00 PM'}
                </li>
              </ul>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-white/10 text-center">
          <p className="text-xs text-gray-500">
            &copy; {new Date().getFullYear()} {brandName}. {t('footer.rights') || 'All rights reserved.'}
            {/* TENANT-CONTENT: the Proline founders' credit belongs ONLY on the default gym. */}
            {isDefault ? ` ${t('footer.fakih') || 'By Fakih Brothers.'}` : ''}
          </p>
        </div>
      </div>
    </footer>
  );
}