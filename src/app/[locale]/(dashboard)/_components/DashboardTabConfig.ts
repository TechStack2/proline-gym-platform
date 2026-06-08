'use client';

import {
  LayoutDashboard,
  Users,
  Dumbbell,
  ClipboardList,
  Ellipsis,
  DollarSign,
  Receipt,
  Calendar,
  Building,
  Tent,
  UserPlus,
  BarChart3,
  Settings,
  User,
  type LucideIcon,
} from 'lucide-react';
import type { TabItem } from '@/components/native';

// Role type matching existing Sidebar.tsx
export type DashboardRole = 'owner' | 'head_coach' | 'coach' | 'receptionist' | 'student' | 'parent' | 'external_coach';

// ─── All possible dashboard items ─────────────────────────────────────

type DashboardItem = {
  key: string;
  icon: LucideIcon;
  path: string;
  label: string; // fallback label
};

const ALL_DASHBOARD_ITEMS: DashboardItem[] = [
  { key: 'dashboard', icon: LayoutDashboard, path: '/dashboard', label: 'Dashboard' },
  { key: 'students', icon: Users, path: '/students', label: 'Students' },
  { key: 'classes', icon: Dumbbell, path: '/classes', label: 'Classes' },
  { key: 'attendance', icon: ClipboardList, path: '/attendance', label: 'Attendance' },
  { key: 'schedule', icon: Calendar, path: '/schedule', label: 'Schedule' },
  { key: 'payments', icon: DollarSign, path: '/payments', label: 'Payments' },
  { key: 'invoices', icon: Receipt, path: '/invoices', label: 'Invoices' },
  { key: 'ptSessions', icon: Dumbbell, path: '/pt', label: 'PT Sessions' },
  { key: 'rentals', icon: Building, path: '/rentals', label: 'Rentals' },
  { key: 'camps', icon: Tent, path: '/camps', label: 'Camps' },
  { key: 'leads', icon: UserPlus, path: '/leads', label: 'Leads' },
  { key: 'coaches', icon: Users, path: '/coaches', label: 'Coaches' },
  { key: 'belts', icon: BarChart3, path: '/belts', label: 'Belts' },
  { key: 'reports', icon: BarChart3, path: '/reports', label: 'Reports' },
  { key: 'settings', icon: Settings, path: '/settings', label: 'Settings' },
  { key: 'profile', icon: User, path: '/profile', label: 'Profile' },
  { key: 'disciplines', icon: Dumbbell, path: '/disciplines', label: 'Disciplines' },
];

// ─── Role-filtered navigation ─────────────────────────────────────────

const ROLE_NAV: Record<DashboardRole, string[]> = {
  owner: ['dashboard', 'students', 'classes', 'schedule', 'attendance', 'payments', 'invoices', 'coaches', 'ptSessions', 'rentals', 'camps', 'leads', 'belts', 'disciplines', 'reports', 'settings', 'profile'],
  head_coach: ['dashboard', 'students', 'classes', 'schedule', 'attendance', 'coaches', 'ptSessions', 'reports', 'profile'],
  coach: [],
  receptionist: ['dashboard', 'students', 'payments', 'invoices', 'leads', 'camps', 'profile'],
  student: [],
  parent: [],
  external_coach: [],
};

// ─── Primary tabs (always 5, shown on bottom nav) ───────────────────

const PRIMARY_TAB_KEYS = ['dashboard', 'students', 'classes', 'attendance', 'more'] as const;

export function getDashboardTabs(role: DashboardRole): {
  primaryTabs: TabItem[];
  moreItems: DashboardItem[];
} {
  const allowedKeys = ROLE_NAV[role] || [];
  if (allowedKeys.length === 0) return { primaryTabs: [], moreItems: [] };

  const allowed = ALL_DASHBOARD_ITEMS.filter((item) => allowedKeys.includes(item.key));

  // First 4 primary: dashboard, students, classes, attendance
  const primary: TabItem[] = [];
  for (const key of PRIMARY_TAB_KEYS) {
    if (key === 'more') {
      primary.push({ key: 'more', icon: Ellipsis, path: '#more', label: 'More' });
    } else {
      const item = allowed.find((i) => i.key === key);
      if (item) {
        primary.push({ key: item.key, icon: item.icon, path: item.path, label: item.label });
      }
    }
  }

  // Everything else goes in "More"
  const primaryKeys = primary.map((t) => t.key);
  const moreItems = allowed.filter((item) => !primaryKeys.includes(item.key));

  return { primaryTabs: primary, moreItems };
}

export const DASHBOARD_BASE_PATH = '/dashboard';
