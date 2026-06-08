'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Instagram, Facebook, MessageCircle } from 'lucide-react';

type LandingFooterProps = {
  locale: string;
};

export function LandingFooter({ locale }: LandingFooterProps) {
  const t = useTranslations('landing');
  const isRTL = locale === 'ar';

  return (
    <footer className="bg-secondary-950 text-gray-300">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="relative h-8 w-8 overflow-hidden rounded-lg">
                <Image src="/logo.jpg" alt="PRO LINE Gym" width={32} height={32} className="h-full w-full object-cover" />
              </div>
              <span className={cn('text-lg font-bold text-white', isRTL && 'font-arabic')}>
                PRO LINE Gym
              </span>
            </div>
            <p className="text-sm text-gray-400">
              {t('footer.tagline') || 'Unleash the fighter in you 🥊'}
            </p>
            <div className="flex items-center gap-3 pt-2">
              <a
                href="https://instagram.com/prolinegym.lb"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg p-2 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Instagram"
              >
                <Instagram className="h-5 w-5" />
              </a>
              <a
                href="https://facebook.com/prolinegym.lb"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg p-2 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Facebook"
              >
                <Facebook className="h-5 w-5" />
              </a>
              <a
                href="https://wa.me/96170628601"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg p-2 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="WhatsApp"
              >
                <MessageCircle className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">{t('footer.links') || 'Quick Links'}</h4>
            <ul className="space-y-2.5">
              <li><Link href={`/${locale}/auth/login`} className="text-sm text-gray-400 hover:text-white transition-colors">{t('footer.login') || 'Member Login'}</Link></li>
              <li><a href="#disciplines" className="text-sm text-gray-400 hover:text-white transition-colors">{t('footer.programs') || 'Programs'}</a></li>
              <li><a href="#pricing" className="text-sm text-gray-400 hover:text-white transition-colors">{t('footer.plans') || 'Membership Plans'}</a></li>
              <li><a href="#trial" className="text-sm text-gray-400 hover:text-white transition-colors">{t('footer.trial') || 'Free Trial'}</a></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">{t('footer.contact') || 'Contact'}</h4>
            <ul className="space-y-2.5">
              <li className="text-sm text-gray-400">
                Sky Business Center, Baabda
              </li>
              <li>
                <a href="tel:+96170628601" dir="ltr" className="text-sm text-gray-400 hover:text-white transition-colors">
                  +961 70 628 601
                </a>
              </li>
              <li>
                <a href="mailto:alifakih998@gmail.com" className="text-sm text-gray-400 hover:text-white transition-colors">
                  alifakih998@gmail.com
                </a>
              </li>
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
            &copy; {new Date().getFullYear()} PRO LINE Gym. {t('footer.rights') || 'All rights reserved.'} {t('footer.fakih') || 'By Fakih Brothers.'}
          </p>
        </div>
      </div>
    </footer>
  );
}