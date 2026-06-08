'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  Calendar,
  ClipboardList,
  DollarSign,
  Receipt,
  Dumbbell,
  Building,
  Tent,
  UserPlus,
  BarChart3,
  Settings,
  User,
} from 'lucide-react';

type Role = 'owner' | 'head_coach' | 'coach' | 'receptionist' | 'student' | 'parent' | 'external_coach';

type SidebarProps = {
  locale: string;
  role: Role;
};

type NavItem = { key: string; icon: typeof LayoutDashboard; path: string };

const ALL_NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { key: 'students', icon: Users, path: '/students' },
  { key: 'classes', icon: Dumbbell, path: '/classes' },
  { key: 'schedule', icon: Calendar, path: '/schedule' },
  { key: 'attendance', icon: ClipboardList, path: '/attendance' },
  { key: 'payments', icon: DollarSign, path: '/payments' },
  { key: 'invoices', icon: Receipt, path: '/invoices' },
  { key: 'ptSessions', icon: Dumbbell, path: '/pt' },
  { key: 'rentals', icon: Building, path: '/rentals' },
  { key: 'camps', icon: Tent, path: '/camps' },
  { key: 'leads', icon: UserPlus, path: '/leads' },
  { key: 'reports', icon: BarChart3, path: '/reports' },
  { key: 'settings', icon: Settings, path: '/settings' },
  { key: 'profile', icon: User, path: '/profile' },
];

// Which nav items each role can see
const ROLE_NAV: Record<Role, string[]> = {
  owner: ['dashboard','students','classes','schedule','attendance','payments','invoices','coaches','ptSessions','rentals','camps','leads','reports','settings','profile'],
  head_coach: ['dashboard','students','classes','schedule','attendance','coaches','ptSessions','reports','profile'],
  coach: [], // coach sees (coach) layout not (dashboard)
  receptionist: ['dashboard','students','payments','invoices','leads','camps','profile'],
  student: [], // student sees (portal) layout not (dashboard)
  parent: [],  // parent sees (portal) layout
  external_coach: [],
};

export function Sidebar({ locale, role }: SidebarProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const isRTL = locale === 'ar';

  const visibleKeys = ROLE_NAV[role] || [];
  const navItems = ALL_NAV_ITEMS.filter(item => visibleKeys.includes(item.key));

  return (
    <aside
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
            alt="Proline Gym"
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

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const fullPath = `/${locale}${item.path}`;
            const isActive = pathname.startsWith(fullPath);

            return (
              <li key={item.key}>
                <Link
                  href={fullPath}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  )}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span>{t(item.key as keyof typeof t extends infer T ? T : never)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t p-3">
        <div className="flex items-center gap-2 px-1">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-xs text-gray-400 capitalize">{role.replace('_', ' ')}</span>
        </div>
        <div className="mt-1 text-[10px] text-gray-300 text-center">
          PRO LINE Gym v0.1.0
        </div>
      </div>
    </aside>
  );
}
