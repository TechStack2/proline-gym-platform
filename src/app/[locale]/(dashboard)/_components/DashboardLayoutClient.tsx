'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { NativeHeader, PageTransition, DesktopRail, IdentityBar, MoreSheet } from '@/components/native';
import { TabBar } from '@/components/native/TabBar';
import { Search, LogOut } from 'lucide-react';
import { staffNav, DASHBOARD_BASE_PATH } from './DashboardTabConfig';
import type { DashboardRole } from './DashboardTabConfig';
import { createClient } from '@/lib/supabase/client';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { PushPrompt } from '@/components/push/push-prompt';
import { OfflineIdentityStamp } from '@/components/pwa/offline-identity-stamp';
import { useInboxCount } from '@/hooks/use-inbox-count';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { pageTitleKey } from '@/lib/nav/page-titles';

type Props = {
  children: React.ReactNode;
  locale: string;
  role: DashboardRole;
  // TENANT-CONTENT: the USER's gym brand for the staff shell (never a hardcode).
  gymName?: string;
  logoUrl?: string | null;
};

// The staff role chip label (carried from the legacy Header — same strings).
const ROLE_LABELS: Record<string, { en: string; ar: string; fr: string }> = {
  owner: { en: 'Owner', ar: 'مالك', fr: 'Propriétaire' },
  head_coach: { en: 'Head Coach', ar: 'مدرب رئيسي', fr: 'Entraîneur en chef' },
  coach: { en: 'Coach', ar: 'مدرب', fr: 'Entraîneur' },
  receptionist: { en: 'Reception', ar: 'استقبال', fr: 'Réception' },
};

/**
 * DS 2.0 §4 (W2b) — the staff shell on the SAME first-class desktop contract as
 * portal + coach: DesktopRail + IdentityBar ≥768 (icon rail 768–1023, expanded
 * ≥1024), mobile TabBar + More sheet <768, ONE `--rail-w` token feeding rail
 * width AND content offset (§4.1's layering law — the legacy
 * `isRTL ? 'md:pr-20 lg:pr-64' : 'md:pl-20 lg:pl-64'` fork is dead), logical-
 * side only. The legacy Sidebar/Header pair and the md–lg legacy TabBar rail are
 * gone; the rail keeps the historical staff testids (`desktop-sidebar`,
 * `nav-*`, `inbox-badge`) per the testid-stability doctrine.
 */
export function DashboardLayoutClient({ children, locale, role, gymName, logoUrl }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  // Root-scoped: the title map holds FULL dotted paths (§2.1).
  const t = useTranslations();
  const supabase = createClient();
  const [moreOpen, setMoreOpen] = useState(false);
  const inboxCount = useInboxCount();

  const { tabs: baseTabs, moreItems, railItems: baseRailItems } = staffNav(role);
  // The Inbox entry carries the live actionable-count badge (IA-1) on every
  // carrier it appears in; the rail badge keeps its historical testid.
  const badge = <T extends { key: string; badge?: number; badgeTestId?: string }>(e: T): T =>
    e.key === 'inbox' && inboxCount > 0
      ? { ...e, badge: inboxCount, badgeTestId: 'inbox-badge' }
      : e;
  const tabs = baseTabs.map(badge);
  const railItems = baseRailItems.map(badge);

  // DOUBLE-SHELL rule: exactly ONE NotificationBell may be MOUNTED (it polls +
  // holds a realtime channel; CSS-hiding does not unmount). The shell chrome now
  // switches at md (768px — §4.1, was lg), so the bell mounts in the matching
  // chrome. matchMedia 'change' fires only on a breakpoint CROSS and the
  // functional setState bails when unchanged — no reconciliation loop.
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const apply = (m: boolean) => setIsDesktop((prev) => (prev === m ? prev : m));
    apply(mq.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push(`/${locale}/auth/login`);
    router.refresh();
  };

  // The page's own name as the mobile large title (single title per breakpoint,
  // resolved through the ONE §2.1 map — same source as PageHeader's desktop h1).
  const seg = pathname.split('/')[2] || 'today'; // [1] = locale, [2] = route segment
  const headerTitle = t(pageTitleKey(seg) as never);

  const roleLabel = ROLE_LABELS[role]?.[locale as 'en' | 'ar' | 'fr'] ?? role.replace('_', ' ');

  return (
    // §4.1 layering law: ONE token drives the rail width AND the content offset,
    // so they cannot disagree. 0 below md → 72px icon rail → 232px expanded.
    <div className="shell-staff h-screen bg-gray-50 [--rail-w:0px] md:[--rail-w:72px] lg:[--rail-w:232px]">
      <DesktopRail
        items={railItems}
        locale={locale}
        basePath={DASHBOARD_BASE_PATH}
        accent="brand"
        shellLabelKey="shellStaff"
        shell="staff"
        railTestId="desktop-sidebar"
        itemTestIdPrefix="nav"
      />

      <div className="flex h-full min-h-0 flex-col ms-[var(--rail-w)]">
        {/* Desktop chrome (≥768): the §4.1 identity bar — tenant identity, the
            staff-only global search (§4.1's shell-tools slot), language, bell,
            theme, role chip, sign-out. */}
        <IdentityBar
          locale={locale}
          gymName={gymName}
          logoUrl={logoUrl}
          roleLabel={roleLabel}
          bell={isDesktop === true ? <NotificationBell locale={locale} /> : null}
          onSignOut={handleLogout}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="relative w-full max-w-md">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                placeholder={t('common.search')}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 ps-10 pe-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <LanguageSwitcher locale={locale} />
          </div>
        </IdentityBar>

        {/* Mobile chrome (<768): status-zone header per §2.1. */}
        <div className="md:hidden">
          <NativeHeader
            title={headerTitle}
            locale={locale}
            role={role}
            shell="staff"
            variant="large"
            titleMobileOnly
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

        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <PushPrompt />
          <OfflineIdentityStamp gymName={gymName} locale={locale} />
          <PageTransition direction="forward" isActive={true} locale={locale} desktopStatic>
            {/* §4.1 content grid (Rule 5): max 1200px, centred beside the rail,
                24px gutters ≥768 — the 1920px balloon-cards die here. Mobile edge
                padding stays owned ONCE here (px-4). PERF-1 #5c: the fixed mobile
                TabBar clearance lives on THIS div (the spec measures it here). */}
            <div
              key={pathname}
              data-testid="shell-content"
              className="mx-auto w-full max-w-[1200px] px-4 md:px-6 md:py-6 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-6"
            >
              {children}
            </div>
          </PageTransition>
        </main>

        {/* Mobile bottom bar (<768) — §4.1 XOR: tab bar OR rail, never both. */}
        <TabBar
          tabs={tabs}
          locale={locale}
          shell="staff"
          basePath={DASHBOARD_BASE_PATH}
          scrollSelector="main"
          forceVisible={moreOpen}
          onTabClick={(key) => {
            if (key === 'more') setMoreOpen(true);
          }}
        />

        <MoreSheet
          isOpen={moreOpen}
          onClose={() => setMoreOpen(false)}
          locale={locale}
          items={moreItems}
          onSignOut={handleLogout}
        />
      </div>
    </div>
  );
}
