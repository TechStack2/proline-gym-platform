'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Instagram, Facebook, MessageCircle } from 'lucide-react';
import { EMPTY_CONTACT, type LandingContact } from '@/lib/marketing/contact';

type LandingFooterProps = {
  locale: string;
  // TENANT-CONTENT: the resolved LANDING gym's identity + public contact. Only the
  // default gym (isDefault) falls back to the built-in Proline identity; every other
  // tenant shows its own row with honest empty fallbacks (empty = the row is hidden).
  gymName?: string;
  logoUrl?: string;
  address?: string;
  contact?: LandingContact;
  isDefault?: boolean;
};

export function LandingFooter({ locale, gymName, logoUrl, address, contact = EMPTY_CONTACT, isDefault = false }: LandingFooterProps) {
  const t = useTranslations('landing');
  const isRTL = locale === 'ar';
  const brandName = gymName || (isDefault ? 'PRO LINE Gym' : '');
  const logoSrc = logoUrl || (isDefault ? '/logo.jpg' : '');
  const addressLine = address || (isDefault ? 'Sky Business Center, Baabda' : '');

  return (
    <footer className="landing-dark bg-secondary-950 text-gray-300">
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

          {/* Hours */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">{t('footer.hours') || 'Hours'}</h4>
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