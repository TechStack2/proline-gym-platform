'use client';

/**
 * THE single nav source of truth (Cycle 5 / V1 / IA-1).
 *
 * Both the desktop `Sidebar` and the mobile `DashboardTabConfig` consume this —
 * the previous two divergent configs disagreed (the desktop Coaches entry was
 * silently dead: ROLE_NAV listed 'coaches' with no matching item). The IA is
 * 7 journey-centric workspaces (cohesion-audit-admin-ia.md §3), not one tab per
 * table. Old routes (rentals/camps/reports/attendance/belts/disciplines/leads/
 * invoices/payments/dashboard) stay reachable by URL — they're just out of nav.
 */
import {
  Sun,
  Inbox,
  Users,
  Calendar,
  DollarSign,
  UserCog,
  Settings,
  User,
  type LucideIcon,
} from 'lucide-react';

export type DashboardRole =
  | 'owner'
  | 'head_coach'
  | 'coach'
  | 'receptionist'
  | 'student'
  | 'parent'
  | 'external_coach';

export type WorkspaceKey =
  | 'today'
  | 'inbox'
  | 'members'
  | 'schedule'
  | 'money'
  | 'team'
  | 'settings'
  | 'profile';

export type Workspace = {
  key: WorkspaceKey;
  icon: LucideIcon;
  path: string;
};

/** The 7 workspaces (+ profile). Order = display order. */
export const WORKSPACES: Workspace[] = [
  { key: 'today', icon: Sun, path: '/today' },
  { key: 'inbox', icon: Inbox, path: '/inbox' },
  { key: 'members', icon: Users, path: '/students' },
  { key: 'schedule', icon: Calendar, path: '/schedule' },
  { key: 'money', icon: DollarSign, path: '/money' },
  { key: 'team', icon: UserCog, path: '/coaches' },
  { key: 'settings', icon: Settings, path: '/settings' },
  { key: 'profile', icon: User, path: '/profile' },
];

/** Role-filtered workspace visibility (staff shells only; coach/portal have their own shells). */
export const ROLE_WORKSPACES: Record<DashboardRole, WorkspaceKey[]> = {
  owner: ['today', 'inbox', 'members', 'schedule', 'money', 'team', 'settings', 'profile'],
  head_coach: ['today', 'inbox', 'members', 'schedule', 'team', 'profile'],
  // TEAM-1 (locked fork #3): reception manages coach scheduling/availability/
  // assignments, so the Diary (schedule) + Team (Coach 360) workspaces are in
  // their nav. Deactivate stays owner/head_coach-only (gated in the action).
  receptionist: ['today', 'inbox', 'members', 'schedule', 'money', 'team', 'profile'],
  coach: [], // (coach) shell
  student: [], // (portal) shell
  parent: [], // (portal) shell
  external_coach: [],
};

/** Mobile primary tab order — the first 4 the role can see, then "More". */
export const MOBILE_PRIMARY_ORDER: WorkspaceKey[] = ['today', 'inbox', 'members', 'schedule', 'money'];

export function workspacesForRole(role: DashboardRole): Workspace[] {
  const allowed = ROLE_WORKSPACES[role] || [];
  return WORKSPACES.filter((w) => allowed.includes(w.key));
}

/** The staff landing route — /dashboard redirects here. */
export const DEFAULT_WORKSPACE_PATH = '/today';
