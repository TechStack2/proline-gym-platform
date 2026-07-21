'use client';

/**
 * DS 2.0 §4.4 (W2b) — the STAFF shell's ONE nav source of truth.
 *
 * The role-filtered workspace list (components/layout/nav-config) is mapped into
 * `ShellNavEntry`s and split by the SAME `splitShellNav` portal + coach use: the
 * first 4 visible workspaces of the canonical mobile order are `mobilePrimary`
 * (the ruled 4+More stays), ALL entries feed the desktop rail, and the More
 * sheet lists exactly the fold. The old four hand-maintained carriers (desktop
 * Sidebar list, mobile tab list, More-sheet list, TITLE_KEYS) are now ONE config
 * + the §2.1 title map — an entry existing in one carrier and not another is
 * structurally unwritable.
 */
import {
  workspacesForRole,
  MOBILE_PRIMARY_ORDER,
  DEFAULT_WORKSPACE_PATH,
  type DashboardRole,
  type WorkspaceKey,
} from '@/components/layout/nav-config';
import { splitShellNav, type ShellNavEntry, type ShellNavSplit } from '@/lib/nav/shell-nav';

export type { DashboardRole };

export function staffNavEntries(role: DashboardRole): ShellNavEntry[] {
  const allowed = workspacesForRole(role);
  // Primary = the first 4 of the canonical mobile order the role can see.
  const primaryKeys: WorkspaceKey[] = MOBILE_PRIMARY_ORDER.filter((k) =>
    allowed.some((w) => w.key === k)
  ).slice(0, 4);
  return allowed.map((w) => ({
    key: w.key,
    icon: w.icon,
    path: w.path,
    mobilePrimary: primaryKeys.includes(w.key),
  }));
}

export function staffNav(role: DashboardRole): ShellNavSplit {
  return splitShellNav(staffNavEntries(role), 'staff');
}

export const DASHBOARD_BASE_PATH = DEFAULT_WORKSPACE_PATH;
