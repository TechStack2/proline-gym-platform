'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { workspacesForRole, type DashboardRole } from './nav-config';
import { useInboxCount } from '@/hooks/use-inbox-count';
import { ThemeToggle } from '@/components/shared/ThemeToggle';

type SidebarProps = {
  locale: string;
  role: DashboardRole;
};

/**
 * Desktop staff sidebar (IA-1): renders the 7 journey-centric workspaces from
 * the SHARED nav-config (same source as the mobile tabs — no more divergence;
 * the silently-dead Coaches entry is gone with the dead config). Profile sits
 * at the bottom; the Inbox entry carries the live actionable-count badge.
 */
const ROLE_LABELS: Record<string, { en: string; ar: string; fr: string }> = {
  owner: { en: 'Owner', ar: 'مالك', fr: 'Propriétaire' },
  head_coach: { en: 'Head Coach', ar: 'مدرب رئيسي', fr: 'Entraîneur en chef' },
  coach: { en: 'Coach', ar: 'مدرب', fr: 'Entraîneur' },
  receptionist: { en: 'Reception', ar: 'استقبال', fr: 'Réception' },
};

export function Sidebar({ locale, role }: SidebarProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const isRTL = locale === 'ar';
  const inboxCount = useInboxCount();

  const all = workspacesForRole(role);
  const navItems = all.filter((w) => w.key !== 'profile');
  const profileItem = all.find((w) => w.key === 'profile');

  const renderItem = (item: (typeof all)[number]) => {
    const Icon = item.icon;
    const fullPath = `/${locale}${item.path}`;
    const isActive = pathname.startsWith(fullPath);

    return (
      <li key={item.key}>
        <Link
          href={fullPath}
          data-testid={`nav-${item.key}`}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            isActive
              ? 'bg-primary-50 text-primary-700'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          )}
        >
          <Icon className="h-5 w-5 flex-shrink-0" />
          <span className="flex-1">{t(item.key)}</span>
          {item.key === 'inbox' && inboxCount > 0 && (
            <span
              data-testid="inbox-badge"
              className="min-w-[20px] rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[11px] font-bold leading-none text-white"
            >
              {inboxCount > 99 ? '99+' : inboxCount}
            </span>
          )}
        </Link>
      </li>
    );
  };

  return (
    <aside
      data-testid="desktop-sidebar"
      className={cn(
        'fixed inset-y-0 z-50 hidden w-64 flex-col border-r bg-white lg:flex',
        isRTL ? 'right-0 border-l' : 'left-0 border-r'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b px-4">
        <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg">
          <Image
            src="/logo.jpg"
            alt=""
            width={36}
            height={36}
            className="h-full w-full object-cover"
            priority
          />
        </div>
        <div className={cn('font-bold text-lg', isRTL ? 'font-arabic' : '')}>
          PRO LINE Gym
        </div>
      </div>

      {/* Navigation — the 7 workspaces */}
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">{navItems.map(renderItem)}</ul>
      </nav>

      {/* Footer — profile + role */}
      <div className="border-t p-3">
        {profileItem && <ul>{renderItem(profileItem)}</ul>}
        <div className="mt-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-xs text-gray-400 capitalize">{ROLE_LABELS[role]?.[locale as 'en' | 'ar' | 'fr'] ?? role.replace('_', ' ')}</span>
          </div>
          {/* DS-2: theme toggle for the desktop staff shell (the mobile shells carry it in NativeHeader). */}
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
