'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { NativeHeader, NativeTabBar, PageTransition } from '@/components/native';
import { COACH_TABS, COACH_BASE_PATH } from './CoachTabConfig';
import { createClient } from '@/lib/supabase/client';
import { LogOut } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { PortalContent } from '@/components/portal/portal-kit';

type Props = {
  children: React.ReactNode;
  locale: string;
};

export function CoachLayoutClient({ children, locale }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('nav');
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push(`/${locale}/auth/login`);
    router.refresh();
  };

  const activeTab = COACH_TABS.find((tab) => {
    const fullPath = `/${locale}${tab.path}`;
    return (
      pathname === fullPath ||
      (tab.path !== COACH_BASE_PATH && pathname.startsWith(fullPath))
    );
  });
  const headerTitle = activeTab
    ? t(activeTab.key) || activeTab.label || activeTab.key
    : t('schedule') || 'Schedule';

  return (
    <div className="flex flex-col h-screen bg-gray-50" style={{ ['--shell-accent' as string]: '#d4af37' }}>
      <NativeHeader
        title={headerTitle}
        locale={locale}
        variant="large"
        titleMobileOnly
        role="coach"
        shell="coach"
        rightActions={
          <div className="flex items-center gap-2">
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
        tabs={COACH_TABS}
        locale={locale}
        basePath={COACH_BASE_PATH}
      />
    </div>
  );
}
