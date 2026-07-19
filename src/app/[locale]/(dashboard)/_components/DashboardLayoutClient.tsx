'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { NativeHeader, PageTransition } from '@/components/native';
import { TabBar } from '@/components/native/TabBar';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { getDashboardTabs, DASHBOARD_BASE_PATH } from './DashboardTabConfig';
import { MoreMenuSheet } from './MoreMenuSheet';
import type { DashboardRole } from './DashboardTabConfig';
import { createClient } from '@/lib/supabase/client';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { PushPrompt } from '@/components/push/push-prompt';
import { useInboxCount } from '@/hooks/use-inbox-count';
import { LogOut } from 'lucide-react';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { cn } from '@/lib/utils';
import { pageTitleKey } from '@/lib/nav/page-titles';

type Props = {
  children: React.ReactNode;
  locale: string;
  role: DashboardRole;
  // TENANT-CONTENT: the USER's gym brand for the staff shell (never a hardcode).
  gymName?: string;
  logoUrl?: string | null;
};

// SHELL-IA / DS 2.0 §2.1: the mobile large title now resolves through the ONE
// page-title map (src/lib/nav/page-titles.ts) that PageHeader also uses, so the
// mobile chrome title and the desktop h1 cannot drift (DA-29). The local
// TITLE_KEYS Set + SEGMENT_TITLE_KEY map this replaces said the same thing in a
// second place — which is exactly how "Students" vs "Members" happened.

export function DashboardLayoutClient({ children, locale, role, gymName, logoUrl }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  // Root-scoped: the title map holds FULL dotted paths (§2.1).
  const t = useTranslations();
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
    // SHELL-RESPONSIVE-FIX (BUG 1): breakpoint at lg (1024px) to match the shell
    // chrome below (mobile <lg, Sidebar+Header ≥lg). matchMedia 'change' fires ONLY
    // on a breakpoint CROSS (never a per-pixel resize), and the functional setState
    // BAILS when the value is unchanged — so a spurious/repeated event (or a
    // scrollbar thrash near the edge) can't feed the reconciliation render loop.
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = (matches: boolean) => setIsDesktop((prev) => (prev === matches ? prev : matches));
    apply(mq.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
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
  const headerTitle = t(pageTitleKey(seg) as any);

  // DOUBLE-SHELL: ONE responsive shell, {children} mounted ONCE (the PortalLayoutClient
  // pattern). Before, layout.tsx rendered the whole subtree twice (block md:hidden mobile
  // + hidden md:flex desktop) → double data-fetch/polling, duplicate DOM ids, double
  // offline-flush listeners. Now the CHROME is responsive around a single subtree:
  // mobile = NativeHeader + bottom NativeTabBar; desktop = Sidebar + Header.
  return (
    <div className={cn('shell-staff flex h-screen flex-col bg-gray-50 lg:flex-row lg:overflow-hidden', isRTL && 'rtl')}>
      {/* SHELL-RESPONSIVE-FIX (BUG 2): the shell now switches at lg, not md — below
          lg is the MOBILE shell (NativeHeader + bottom TabBar), ≥lg is Sidebar +
          Header. This kills the old md–lg dead zone (desktop Header shown, but its
          hamburger targeted a Sidebar hard-hidden below lg → no working nav).
          --shell-accent (was an inline style here, STRIPPED by the prod CSP →
          React reconciliation churn) is dropped: NativeTabBar's var(--shell-accent,
          #cd1419) fallback IS the staff value, so zero visual change. */}
      {/* Desktop side nav — self-hides below lg (fixed w-64 lg:flex). */}
      <Sidebar locale={locale} role={role} gymName={gymName} logoUrl={logoUrl} />

      <div className={cn('flex h-full min-h-0 flex-1 flex-col lg:h-auto lg:overflow-hidden', isRTL ? 'md:pr-20 lg:pr-64' : 'md:pl-20 lg:pl-64')}>
        {/* Desktop chrome (≥lg) */}
        <div className="hidden lg:block">
          <Header locale={locale} role={role} showBell={isDesktop === true} gymName={gymName} logoUrl={logoUrl} />
        </div>

        {/* Mobile chrome (<lg) */}
        <div className="lg:hidden">
          <NativeHeader
            title={headerTitle}
            locale={locale}
            role={role}
            shell="staff"
            variant="large"
            rightActions={
              <div className="flex items-center gap-2">
                {isDesktop === false && <NotificationBell locale={locale} />}
                <ThemeToggle />
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

        <main className="flex-1 overflow-y-auto scrollbar-thin lg:p-8">
          <PushPrompt />
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
            <div key={pathname} data-testid="shell-content" className="px-4 lg:px-0 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0">{children}</div>
          </PageTransition>
        </main>

        {/* Mobile bottom tab bar (<lg; the staff desktop uses the Sidebar) */}
        <div className="lg:hidden">
          {/* DS 2.0 §2.2 — the shared TabBar primitive. Same 4+More IA; new is the
              ruled Option-B density, the indicator bar, nav ARIA (was role=tablist)
              and hide-on-scroll. The scroller is the shell's own <main>, not the
              window, and the bar is pinned down while the More sheet owns the
              screen. */}
          <TabBar
            tabs={primaryTabs}
            locale={locale}
            shell="staff"
            basePath={DASHBOARD_BASE_PATH}
            scrollSelector="main"
            forceVisible={moreOpen}
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
