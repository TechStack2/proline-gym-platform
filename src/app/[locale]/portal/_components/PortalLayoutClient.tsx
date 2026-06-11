'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { NativeHeader, NativeTabBar, PageTransition } from '@/components/native';
import { PORTAL_TABS, PORTAL_BASE_PATH } from './PortalTabConfig';
import { createClient } from '@/lib/supabase/client';
import { LogOut } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { HeaderAvatar } from '@/components/shared/header-avatar';

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
    <div className="flex flex-col h-screen bg-gray-50">
      <NativeHeader
        title={headerTitle}
        locale={locale}
        variant="large"
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
      <main className="flex-1 overflow-y-auto">
        <PageTransition
          direction="forward"
          isActive={true}
          locale={locale}
        >
          <div key={pathname}>{children}</div>
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
