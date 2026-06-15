'use client';

import { useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { NativeHeader, NativeTabBar, PageTransition } from '@/components/native';
import { getDashboardTabs, DASHBOARD_BASE_PATH } from './DashboardTabConfig';
import { MoreMenuSheet } from './MoreMenuSheet';
import type { DashboardRole } from './DashboardTabConfig';
import { createClient } from '@/lib/supabase/client';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { useInboxCount } from '@/hooks/use-inbox-count';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  children: React.ReactNode;
  locale: string;
  role: DashboardRole;
};

export function DashboardLayoutClient({ children, locale, role }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('nav');
  const supabase = createClient();
  const [moreOpen, setMoreOpen] = useState(false);
  const isRTL = locale === 'ar';
  const inboxCount = useInboxCount();

  const { primaryTabs: baseTabs } = getDashboardTabs(role);
  // The Inbox tab carries the live actionable-count badge (IA-1).
  const primaryTabs = baseTabs.map((tab) =>
    tab.key === 'inbox' && inboxCount > 0 ? { ...tab, badge: inboxCount } : tab
  );

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push(`/${locale}/auth/login`);
    router.refresh();
  };

  const handleMoreClick = useCallback(() => {
    setMoreOpen(true);
  }, []);

  const activeTab = primaryTabs.find((tab) => {
    if (tab.key === 'more') return false;
    const fullPath = `/${locale}${tab.path}`;
    return (
      pathname === fullPath ||
      (tab.path !== DASHBOARD_BASE_PATH && pathname.startsWith(fullPath))
    );
  });

  const headerTitle = activeTab
    ? (t(activeTab.key as any) || activeTab.label || activeTab.key)
    : (t('today') || 'Today');

  return (
    <div className={cn('flex flex-col h-screen bg-gray-50', isRTL && 'rtl')}
      style={{ ['--shell-accent' as string]: '#cd1419' }}>
      <NativeHeader
        title={headerTitle}
        locale={locale}
        role={role}
        shell="staff"
        variant="large"
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

      <main className="flex-1 overflow-y-auto">
        <PageTransition
          direction="forward"
          isActive={true}
          locale={locale}
        >
          {/* FD-2 PWA footer fix: the mobile NativeTabBar is `fixed bottom-0`, so
              the last rows of every dashboard page (seen on Today/Inbox) hid
              behind it. Clear it with tab-bar height + safe-area bottom padding
              on mobile only (the md+ side-rail has no bottom bar → md:pb-0). */}
          <div key={pathname} className="pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0">{children}</div>
        </PageTransition>
      </main>

      <NativeTabBar
        tabs={primaryTabs}
        locale={locale}
        basePath={DASHBOARD_BASE_PATH}
        onTabClick={(key) => {
          if (key === 'more') setMoreOpen(true);
        }}
      />

      <MoreMenuSheet
        isOpen={moreOpen}
        onClose={() => setMoreOpen(false)}
        locale={locale}
        role={role}
      />
    </div>
  );
}
