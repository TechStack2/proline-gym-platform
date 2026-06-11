'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from './LanguageSwitcher';
import { cn } from '@/lib/utils';
import { Menu, Search, LogOut } from 'lucide-react';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from '@/i18n/routing';
import { NotificationBell } from '@/components/notifications/notification-bell';

type HeaderProps = {
  locale: string;
  role?: string;
};

const roleLabels: Record<string, { en: string; ar: string }> = {
  owner: { en: 'Owner', ar: 'مالك' },
  head_coach: { en: 'Head Coach', ar: 'مدرب رئيسي' },
  coach: { en: 'Coach', ar: 'مدرب' },
  receptionist: { en: 'Reception', ar: 'استقبال' },
  student: { en: 'Member', ar: 'عضو' },
  parent: { en: 'Parent', ar: 'ولي أمر' },
  external_coach: { en: 'Ext. Coach', ar: 'مدرب خارجي' },
};

export function Header({ locale, role }: HeaderProps) {
  const t = useTranslations();
  const router = useRouter();
  const supabase = createClient();
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const isRTL = locale === 'ar';

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  const label = role ? (isRTL ? roleLabels[role]?.ar : roleLabels[role]?.en) : 'Admin';

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-white px-4">
      <button
        onClick={() => setShowMobileSidebar(!showMobileSidebar)}
        className="lg:hidden rounded-lg p-2 text-gray-600 hover:bg-gray-100"
        aria-label="Menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex-1 flex items-center gap-2 max-w-md">
        <div className="relative flex-1">
          <Search className={cn(
            'absolute top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400',
            isRTL ? 'right-3' : 'left-3'
          )} />
          <input
            type="search"
            placeholder={t('common.search')}
            className={cn(
              'w-full rounded-lg border border-gray-200 py-2 text-sm',
              'bg-gray-50 placeholder:text-gray-400',
              'focus:border-primary-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100',
              isRTL ? 'pr-10 pl-3' : 'pl-10 pr-3'
            )}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <LanguageSwitcher locale={locale} />
        
        {/* Real recipient-scoped bell (IA-1) — was a decorative stub. */}
        <NotificationBell locale={locale} />

        <button
          onClick={handleLogout}
          className="rounded-lg p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          title="Logout"
        >
          <LogOut className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 ml-1">
          <div className="relative h-8 w-8 overflow-hidden rounded-full">
            <Image src="/logo.jpg" alt="PRO LINE Gym" width={32} height={32} className="h-full w-full object-cover" />
          </div>
          <span className="hidden sm:inline text-sm font-medium text-gray-700 capitalize">
            {label}
          </span>
        </div>
      </div>
    </header>
  );
}
