import { Sun, ClipboardCheck, Users, Dumbbell, User, CalendarClock } from 'lucide-react'
import { splitShellNav, type ShellNavEntry } from '@/lib/nav/shell-nav'

/**
 * DS 2.0 §3 (RULED 2026-07-20) + §4.4 — the coach shell's ONE nav source of truth.
 *
 * Coach 6 → 5: `Today · Attendance · Students · PT · More`.
 *  · Today renamed from the ambiguous "Schedule" (same /coach route).
 *  · Trials fold into More (episodic, not daily); More carries a count badge
 *    when trials are scheduled today, and Today keeps its trial-today card.
 *  · Attendance/Students/PT stay primary — the coach's daily working set.
 * The same array feeds the mobile bar (mobilePrimary + More) AND the desktop
 * rail (all entries).
 */
export const COACH_NAV: ShellNavEntry[] = [
  { key: 'today', icon: Sun, path: '/coach', mobilePrimary: true },
  { key: 'attendance', icon: ClipboardCheck, path: '/coach/attendance', mobilePrimary: true },
  { key: 'students', icon: Users, path: '/coach/students', mobilePrimary: true },
  { key: 'pt', icon: Dumbbell, path: '/coach/pt', mobilePrimary: true },
  { key: 'trials', icon: CalendarClock, path: '/coach/trials' },
  { key: 'profile', icon: User, path: '/coach/profile' },
]

export const coachNav = () => splitShellNav(COACH_NAV, 'coach')

export const COACH_BASE_PATH = '/coach'
