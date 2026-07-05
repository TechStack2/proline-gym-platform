'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { NativeHeader, NativeTabBar, PageTransition } from '@/components/native';
import { PORTAL_TABS, PORTAL_BASE_PATH } from './PortalTabConfig';
import { createClient } from '@/lib/supabase/client';
import { LogOut } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { HeaderAvatar } from '@/components/shared/header-avatar';
import { PortalContent } from '@/components/portal/portal-kit';

type Props = {
  children: React.ReactNode;
  locale: string;
};

export function PortalLayoutClient({ children, locale }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('nav');
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push(`/${locale}/auth/login`);
    router.refresh();
  };

  const activeTab = PORTAL_TABS.find((tab) => {
    const fullPath = `/${locale}${tab.path}`;
    return (
      pathname === fullPath ||
      (tab.path !== PORTAL_BASE_PATH && pathname.startsWith(fullPath))
    );
  });
  const headerTitle = activeTab
    ? t(activeTab.key) || activeTab.key
    : t('home') || 'Home';

  return (
    <div className="shell-portal flex flex-col h-screen bg-gray-50">
      <NativeHeader
        title={headerTitle}
        locale={locale}
        shell="portal"
        variant="large"
        titleMobileOnly
        rightActions={
          <div className="flex items-center gap-2">
            <HeaderAvatar />
            <NotificationBell locale={locale} />
            <button
              onClick={handleLogout}
            className="rounded-full h-10 w-10 inline-flex items-center justify-center hover:bg-red-50 transition-colors"
              aria-label="Sign out"
            >
              <LogOut className="h-5 w-5 text-red-500" />
            </button>
          </div>
        }
      />
      <main className={`flex-1 overflow-y-auto ${locale === 'ar' ? 'md:mr-20' : 'md:ml-20'}`}>
        <PageTransition
          direction="forward"
          isActive={true}
          locale={locale}
        >
          <div key={pathname}>
            <PortalContent>{children}</PortalContent>
          </div>
        </PageTransition>
      </main>
      <NativeTabBar
        tabs={PORTAL_TABS}
        locale={locale}
        basePath={PORTAL_BASE_PATH}
      />
    </div>
  );
}
