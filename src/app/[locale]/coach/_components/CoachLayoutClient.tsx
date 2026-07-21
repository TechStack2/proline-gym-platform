'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { NativeHeader, PageTransition, DesktopRail, IdentityBar, MoreSheet } from '@/components/native';
import { TabBar } from '@/components/native/TabBar';
import { COACH_NAV, coachNav, COACH_BASE_PATH } from './CoachTabConfig';
import { createClient } from '@/lib/supabase/client';
import { LogOut } from 'lucide-react';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { PushPrompt } from '@/components/push/push-prompt';
import { OfflineIdentityStamp } from '@/components/pwa/offline-identity-stamp';
import { PortalContent } from '@/components/portal/portal-kit';

type Props = {
  children: React.ReactNode;
  locale: string;
  // §4.1 identity bar: the USER's gym (never the Host default's).
  gymName?: string;
  logoUrl?: string | null;
  /** §3: the More entry badges when trials are scheduled today. */
  trialsTodayCount?: number;
};

export function CoachLayoutClient({ children, locale, gymName, logoUrl, trialsTodayCount = 0 }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const supabase = createClient();
  const [moreOpen, setMoreOpen] = useState(false);

  const { tabs: baseTabs, moreItems: baseMoreItems, railItems: baseRailItems } = coachNav();
  // §3: trials fold into More, but a trial-day is signalled — the badge rides the
  // trials entry (rail + More sheet) and the More trigger itself on mobile.
  const badge = <T extends { key: string; badge?: number }>(e: T): T =>
    trialsTodayCount > 0 && (e.key === 'trials' || e.key === 'more') ? { ...e, badge: trialsTodayCount } : e;
  const tabs = baseTabs.map(badge);
  const moreItems = baseMoreItems.map(badge);
  const railItems = baseRailItems.map(badge);

  // DOUBLE-SHELL rule: ONE mounted NotificationBell (poll + realtime channel);
  // the chrome switches at md (§4.1), so the bell mounts in the matching chrome.
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

  const activeEntry = COACH_NAV.find((entry) => {
    const fullPath = `/${locale}${entry.path}`;
    return (
      pathname === fullPath ||
      (entry.path !== COACH_BASE_PATH && pathname.startsWith(fullPath))
    );
  });
  const headerTitle = t((activeEntry?.key ?? 'today') as never);

  return (
    // §4.1 layering law: ONE token drives the rail width AND the content offset.
    <div className="shell-coach h-screen bg-gray-50 [--rail-w:0px] md:[--rail-w:72px] lg:[--rail-w:232px]">
      <DesktopRail
        items={railItems}
        locale={locale}
        basePath={COACH_BASE_PATH}
        accent="shell"
        shellLabelKey="shellCoach"
        shell="coach"
      />

      <div className="flex h-full min-h-0 flex-col ms-[var(--rail-w)]">
        <IdentityBar
          locale={locale}
          gymName={gymName}
          logoUrl={logoUrl}
          roleLabel={tCommon('shellCoach')}
          bell={isDesktop === true ? <NotificationBell locale={locale} /> : null}
          onSignOut={handleLogout}
        />

        <div className="md:hidden">
          <NativeHeader
            title={headerTitle}
            locale={locale}
            variant="large"
            titleMobileOnly
            role="coach"
            shell="coach"
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

        <main className="flex-1 overflow-y-auto">
          <PushPrompt />
          <OfflineIdentityStamp gymName={gymName} locale={locale} />
          <PageTransition direction="forward" isActive={true} locale={locale}>
            <div key={pathname} data-testid="shell-content">
              <PortalContent>{children}</PortalContent>
            </div>
          </PageTransition>
        </main>

        {/* Mobile bottom bar (<768) — §4.1 XOR: tab bar OR rail, never both. */}
        <TabBar
          tabs={tabs}
          locale={locale}
          shell="coach"
          basePath={COACH_BASE_PATH}
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
