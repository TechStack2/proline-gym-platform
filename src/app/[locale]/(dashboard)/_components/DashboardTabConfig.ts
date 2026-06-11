'use client';

/**
 * Mobile staff tabs (IA-1) — derived from the SAME shared nav-config as the
 * desktop Sidebar (single source of truth; desktop and mobile can no longer
 * diverge). Primary = the first 4 workspaces the role can see + "More"; the
 * rest (Money/Team/Settings/Profile for the owner) live in the More sheet.
 */
import { Ellipsis, type LucideIcon } from 'lucide-react';
import type { TabItem } from '@/components/native';
import {
  workspacesForRole,
  MOBILE_PRIMARY_ORDER,
  DEFAULT_WORKSPACE_PATH,
  type DashboardRole,
  type WorkspaceKey,
} from '@/components/layout/nav-config';

export type { DashboardRole };

export type DashboardItem = {
  key: string;
  icon: LucideIcon;
  path: string;
  label: string; // fallback label (i18n key preferred)
};

export function getDashboardTabs(role: DashboardRole): {
  primaryTabs: TabItem[];
  moreItems: DashboardItem[];
} {
  const allowed = workspacesForRole(role);
  if (allowed.length === 0) return { primaryTabs: [], moreItems: [] };

  // Primary = first 4 of the canonical mobile order the role can see.
  const primaryKeys: WorkspaceKey[] = MOBILE_PRIMARY_ORDER.filter((k) =>
    allowed.some((w) => w.key === k)
  ).slice(0, 4);

  const primary: TabItem[] = allowed
    .filter((w) => primaryKeys.includes(w.key))
    .map((w) => ({ key: w.key, icon: w.icon, path: w.path, label: w.key }));
  primary.push({ key: 'more', icon: Ellipsis, path: '#more', label: 'More' });

  const moreItems: DashboardItem[] = allowed
    .filter((w) => !primaryKeys.includes(w.key))
    .map((w) => ({ key: w.key, icon: w.icon, path: w.path, label: w.key }));

  return { primaryTabs: primary, moreItems };
}

export const DASHBOARD_BASE_PATH = DEFAULT_WORKSPACE_PATH;
