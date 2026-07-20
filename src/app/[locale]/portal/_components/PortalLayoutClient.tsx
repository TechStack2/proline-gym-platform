'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { NativeHeader, PageTransition, DesktopRail, IdentityBar, MoreSheet } from '@/components/native';
import { TabBar } from '@/components/native/TabBar';
import { PORTAL_NAV, portalNav, PORTAL_BASE_PATH } from './PortalTabConfig';
import { createClient } from '@/lib/supabase/client';
import { LogOut } from 'lucide-react';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { PushPrompt } from '@/components/push/push-prompt';
import { HeaderAvatar } from '@/components/shared/header-avatar';
import { PortalContent } from '@/components/portal/portal-kit';

type Props = {
  children: React.ReactNode;
  locale: string;
  // §4.1 identity bar: the USER's gym (never the Host default's).
  gymName?: string;
  logoUrl?: string | null;
};

export function PortalLayoutClient({ children, locale, gymName, logoUrl }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const supabase = createClient();
  const [moreOpen, setMoreOpen] = useState(false);
  const { tabs, moreItems, railItems } = portalNav();

  // DOUBLE-SHELL rule: exactly ONE NotificationBell may be MOUNTED (it polls +
  // holds a realtime channel; CSS-hiding does not unmount). The shell chrome
  // switches at md (768px — §4.1), so the bell mounts in the matching chrome.
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

  // Title resolves against the FULL nav config (folded entries keep their
  // titles when reached via More / the rail / a deep link).
  const activeEntry = PORTAL_NAV.find((entry) => {
    const fullPath = `/${locale}${entry.path}`;
    return (
      pathname === fullPath ||
      (entry.path !== PORTAL_BASE_PATH && pathname.startsWith(fullPath))
    );
  });
  const headerTitle = t((activeEntry?.key ?? 'home') as never);

  return (
    // §4.1 layering law: ONE token drives the rail width AND the content offset,
    // so they cannot disagree. 0 below md → 72px icon rail → 232px expanded.
    <div className="shell-portal h-screen bg-gray-50 [--rail-w:0px] md:[--rail-w:72px] lg:[--rail-w:232px]">
      <DesktopRail
        items={railItems}
        locale={locale}
        basePath={PORTAL_BASE_PATH}
        accent="brand"
        shellLabelKey="shellMember"
      />

      <div className="flex h-full min-h-0 flex-col ms-[var(--rail-w)]">
        {/* Desktop chrome (≥768): the §4.1 identity bar. */}
        <IdentityBar
          locale={locale}
          gymName={gymName}
          logoUrl={logoUrl}
          roleLabel={tCommon('shellMember')}
          bell={isDesktop === true ? <NotificationBell locale={locale} /> : null}
          onSignOut={handleLogout}
        />

        {/* Mobile chrome (<768): status-zone header per §2.1. */}
        <div className="md:hidden">
          <NativeHeader
            title={headerTitle}
            locale={locale}
            shell="portal"
            variant="large"
            titleMobileOnly
            rightActions={
              <div className="flex items-center gap-2">
                <HeaderAvatar />
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
          <PageTransition direction="forward" isActive={true} locale={locale}>
            {/* PERF-1 #5c: the fixed mobile TabBar clearance lives here (and in
                PortalContent) — the last row must never hide behind the bar. */}
            <div key={pathname} data-testid="shell-content" className="pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0">
              <PortalContent>{children}</PortalContent>
            </div>
          </PageTransition>
        </main>

        {/* Mobile bottom bar (<768) — §4.1 XOR: tab bar OR rail, never both. */}
        <TabBar
          tabs={tabs}
          locale={locale}
          shell="portal"
          basePath={PORTAL_BASE_PATH}
          scrollSelector="main"
          forceVisible={moreOpen}
          showRail={false}
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
