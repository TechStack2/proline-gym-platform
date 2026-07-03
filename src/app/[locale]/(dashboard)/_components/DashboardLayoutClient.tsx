'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { NativeHeader, NativeTabBar, PageTransition } from '@/components/native';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
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

// SHELL-IA: nav i18n keys for the mobile large title, by first path segment.
// The large title is the SINGLE page title on mobile, so it must resolve on
// EVERY (dashboard) route — not just the 4 mobile-primary tabs (the old lookup
// fell back to "Today" on money/team/settings/profile + every out-of-nav page).
const TITLE_KEYS = new Set([
  'today', 'inbox', 'students', 'schedule', 'money', 'coaches', 'settings',
  'profile', 'belts', 'pt', 'rentals', 'camps', 'reports', 'attendance',
  'classes', 'leads', 'payments', 'invoices', 'disciplines', 'notifications',
  'campaigns', 'desk',
]);

export function DashboardLayoutClient({ children, locale, role }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('nav');
  const supabase = createClient();
  const [moreOpen, setMoreOpen] = useState(false);
  const isRTL = locale === 'ar';
  const inboxCount = useInboxCount();

  // DOUBLE-SHELL: exactly ONE NotificationBell may be MOUNTED (it polls every 30s
  // + holds a realtime channel; CSS-hiding does not unmount). Track the breakpoint
  // and mount the bell in the matching chrome only. null until hydration → the
  // bell appears right after mount (it renders nothing meaningful before its
  // fetch anyway), never two.
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

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

  // The page's own name as the mobile large title (single title per breakpoint).
  const seg = pathname.split('/')[2] || 'today'; // [1] = locale, [2] = route segment
  const headerTitle = t((TITLE_KEYS.has(seg) ? seg : 'today') as any);

  // DOUBLE-SHELL: ONE responsive shell, {children} mounted ONCE (the PortalLayoutClient
  // pattern). Before, layout.tsx rendered the whole subtree twice (block md:hidden mobile
  // + hidden md:flex desktop) → double data-fetch/polling, duplicate DOM ids, double
  // offline-flush listeners. Now the CHROME is responsive around a single subtree:
  // mobile = NativeHeader + bottom NativeTabBar; desktop = Sidebar + Header.
  return (
    <div className={cn('flex h-screen flex-col bg-gray-50 md:flex-row md:overflow-hidden', isRTL && 'rtl')}
      style={{ ['--shell-accent' as string]: '#cd1419' }}>
      {/* Desktop side nav — self-hides below lg (fixed w-64 lg:flex); Header's Menu
          button covers md–lg exactly as before. */}
      <Sidebar locale={locale} role={role} />

      <div className={cn('flex h-full min-h-0 flex-1 flex-col md:h-auto md:overflow-hidden', isRTL ? 'lg:pr-64' : 'lg:pl-64')}>
        {/* Desktop chrome (≥md) */}
        <div className="hidden md:block">
          <Header locale={locale} role={role} showBell={isDesktop === true} />
        </div>

        {/* Mobile chrome (<md) */}
        <div className="md:hidden">
          <NativeHeader
            title={headerTitle}
            locale={locale}
            role={role}
            shell="staff"
            variant="large"
            rightActions={
              <div className="flex items-center gap-2">
                {isDesktop === false && <NotificationBell locale={locale} />}
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
        </div>

        <main className="flex-1 overflow-y-auto scrollbar-thin md:p-6 lg:p-8">
          <PageTransition
            direction="forward"
            isActive={true}
            locale={locale}
            desktopStatic
          >
            {/* SHELL-IA: mobile horizontal edge padding owned ONCE here (px-4), so
                pages no longer add their own `p-4` (which double-padded). Desktop
                padding lives on the single <main> above (md:p-6 lg:p-8) → md:px-0.
                FD-2 PWA footer fix: the mobile NativeTabBar is `fixed bottom-0`, so
                the last rows of every dashboard page (seen on Today/Inbox) hid
                behind it. Clear it with tab-bar height + safe-area bottom padding
                on mobile only (no bottom bar ≥md → md:pb-0). */}
            <div key={pathname} className="px-4 md:px-0 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0">{children}</div>
          </PageTransition>
        </main>

        {/* Mobile bottom tab bar (the staff desktop uses the Sidebar, never the rail) */}
        <div className="md:hidden">
          <NativeTabBar
            tabs={primaryTabs}
            locale={locale}
            basePath={DASHBOARD_BASE_PATH}
            onTabClick={(key) => {
              if (key === 'more') setMoreOpen(true);
            }}
          />
        </div>

        <MoreMenuSheet
          isOpen={moreOpen}
          onClose={() => setMoreOpen(false)}
          locale={locale}
          role={role}
        />
      </div>
    </div>
  );
}
