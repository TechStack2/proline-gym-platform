import { Grid, Calendar, Dumbbell, CreditCard, User, Award } from 'lucide-react'
import { splitShellNav, type ShellNavEntry } from '@/lib/nav/shell-nav'

/**
 * DS 2.0 §3 (RULED 2026-07-20) + §4.4 — the portal's ONE nav source of truth.
 *
 * Portal 7 → 5: `Home · Classes · Progress · Billing · More`.
 *  · Classes = catalog + weekly schedule MERGED (segmented Schedule | Browse
 *    inside /portal/classes; /portal/schedule redirects there).
 *  · PT and Profile fold into More; PT clients keep the state-aware PT card on
 *    Home (closer than the old cold tab).
 * The same array feeds the mobile bar (mobilePrimary + More) AND the desktop
 * rail (all entries) — an entry cannot exist in one form factor only.
 */
export const PORTAL_NAV: ShellNavEntry[] = [
  { key: 'home', icon: Grid, path: '/portal', mobilePrimary: true },
  { key: 'classes', icon: Calendar, path: '/portal/classes', mobilePrimary: true },
  { key: 'progress', icon: Award, path: '/portal/progress', mobilePrimary: true },
  { key: 'billing', icon: CreditCard, path: '/portal/billing', mobilePrimary: true },
  { key: 'pt', icon: Dumbbell, path: '/portal/pt' },
  { key: 'profile', icon: User, path: '/portal/profile' },
]

export const portalNav = () => splitShellNav(PORTAL_NAV, 'portal')

export const PORTAL_BASE_PATH = '/portal'
