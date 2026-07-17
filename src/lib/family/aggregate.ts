import type { SupabaseClient } from '@supabase/supabase-js'
import { OPEN_INVOICE_STATUSES, outstandingUsd } from '@/lib/billing/reconcile'
import { localizedName, one } from '@/lib/names'
import { membershipState, type MembershipState } from '@/lib/lifecycle/status'

/**
 * GUARDIAN-360 / FAMILY-VIEW — one read-only aggregation shared by the STAFF
 * guardian detail (R1) and the PORTAL family home (R2). Both surfaces need the
 * same per-child glance (membership state, outstanding, next class, active
 * registrations, current billing-cycle end, win-back dates + the weekly
 * schedule); the only difference is the RLS the caller reads under (staff FOR
 * ALL vs. additive guardian SELECT). Every query is batched `.in(studentIds)`
 * and grouped in JS, so the cost is a handful of round-trips regardless of how
 * many children a guardian has. No new tables, RPCs or columns — pure view.
 */

export type FamilyScheduleSlot = { day: number; start: string; end: string | null; className: string }
export type FamilyNextClass = { dayDiff: number; start: string; className: string }

export type FamilySummary = {
  studentId: string
  name: string
  avatarUrl: string | null
  beltRank: string | null
  isActive: boolean
  /** phone / age / portal override — fed to the reused invite affordance (staff detail only). */
  phone: string | null
  age: number | null
  portalOverride: boolean | null
  joinDate: string | null
  /** most-recent attendance date — the win-back "last seen" (R3). */
  lastSeen: string | null
  outstanding: number
  openInvoiceCount: number
  membershipStateValue: MembershipState
  /** end_date of the active membership (null when none / not sold). */
  membershipEnd: string | null
  activeRegCount: number
  /** the nearest upcoming billing boundary — min(active membership end, active reg paid_until). */
  cycleEnd: string | null
  /** true when the member has lapsed or is deactivated — the win-back signal (R3). */
  lapsed: boolean
  nextClass: FamilyNextClass | null
  schedule: FamilyScheduleSlot[]
}

type GymPolicy = { renewal_lead_days?: number | null; dunning_grace_days?: number | null }

const URGENT_STATES = ['lapsed', 'overdue', 'expiring', 'frozen'] as const

/**
 * Batch every per-child read for a set of student ids and return one summary
 * per id (only ids the caller can actually SELECT come back — a non-linked kid
 * simply yields nothing under guardian RLS).
 */
export async function getFamilySummaries(
  supabase: SupabaseClient,
  studentIds: string[],
  locale: string,
  gymPolicy?: GymPolicy,
): Promise<Map<string, FamilySummary>> {
  const out = new Map<string, FamilySummary>()
  if (studentIds.length === 0) return out

  const isRTL = locale === 'ar'
  const lname = (row: any): string =>
    (isRTL ? row?.name_ar : locale === 'fr' ? row?.name_fr : row?.name_en) || row?.name_en || ''

  const [
    { data: students },
    { data: memberships },
    { data: invoices },
    { data: registrations },
    { data: enrollments },
    { data: attendance },
  ] = await Promise.all([
    supabase
      .from('students')
      .select('id, profile_id, join_date, is_active, current_belt_rank, gym_id, portal_login_override, profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, avatar_url, phone, date_of_birth)')
      .in('id', studentIds),
    supabase
      .from('student_memberships')
      .select('student_id, status, end_date, pause_end_date')
      .in('student_id', studentIds)
      .order('end_date', { ascending: false }),
    supabase
      .from('invoices')
      .select('id, student_id, total_usd, status')
      .in('student_id', studentIds)
      .in('status', [...OPEN_INVOICE_STATUSES]),
    supabase
      .from('class_registrations')
      .select('student_id, status, paid_until, end_date')
      .in('student_id', studentIds)
      .in('status', ['requested', 'active', 'waitlisted']),
    supabase
      .from('class_enrollments')
      .select('student_id, classes:class_id (name_ar, name_en, name_fr, is_active, class_schedules (day_of_week, start_time, end_time, is_active))')
      .in('student_id', studentIds)
      .eq('is_active', true),
    supabase
      .from('attendance_records')
      .select('student_id, attendance_date')
      .in('student_id', studentIds)
      .order('attendance_date', { ascending: false })
      .limit(400),
  ])

  // Payments for the open invoices (nets the outstanding per child).
  const invRows = (invoices ?? []) as any[]
  const invIds = invRows.map((i) => i.id)
  const { data: payments } = invIds.length
    ? await supabase.from('payments').select('invoice_id, amount_usd').in('invoice_id', invIds)
    : { data: [] as any[] }
  const paysByInv = new Map<string, any[]>()
  for (const p of (payments ?? []) as any[]) {
    const list = paysByInv.get(p.invoice_id) ?? []
    list.push(p)
    paysByInv.set(p.invoice_id, list)
  }

  // Gym policy for read-time membership states (renewal-lead / dunning-grace).
  let policy: GymPolicy = gymPolicy ?? {}
  if (!gymPolicy) {
    const gymId = (students ?? [])[0]?.gym_id
    if (gymId) {
      const { data: g } = await supabase
        .from('gyms').select('renewal_lead_days, dunning_grace_days').eq('id', gymId).maybeSingle()
      policy = (g as any) ?? {}
    }
  }

  // Index the batched rows by student.
  const byStudent = <T extends { student_id: string }>(rows: T[] | null | undefined) => {
    const m = new Map<string, T[]>()
    for (const r of rows ?? []) {
      const list = m.get(r.student_id) ?? []
      list.push(r)
      m.set(r.student_id, list)
    }
    return m
  }
  const memByStu = byStudent(memberships as any[])
  const invByStu = byStudent(invRows)
  const regByStu = byStudent(registrations as any[])
  const enrByStu = byStudent(enrollments as any[])
  const todayIso = new Date().toISOString().slice(0, 10)
  const todayDow = new Date().getDay()

  // last-seen = the first (most-recent) attendance per student (rows are desc).
  const lastSeenByStu = new Map<string, string>()
  for (const a of (attendance ?? []) as any[]) {
    if (!lastSeenByStu.has(a.student_id)) lastSeenByStu.set(a.student_id, a.attendance_date)
  }

  for (const s of (students ?? []) as any[]) {
    const prof = one(s.profiles)
    const mems = memByStu.get(s.id) ?? []
    const states = mems.map((m) => membershipState(m, policy))
    const msState = (URGENT_STATES.find((sv) => states.includes(sv)) ?? (mems.length ? 'active' : 'none')) as MembershipState
    const activeMem = mems.find((m) => m.status === 'active')
    const membershipEnd = activeMem?.end_date ?? null

    // Outstanding netted across this child's open invoices.
    const myInv = invByStu.get(s.id) ?? []
    const myPays = myInv.flatMap((i) => paysByInv.get(i.id) ?? [])
    const outstanding = outstandingUsd(myInv, myPays)

    const regs = regByStu.get(s.id) ?? []
    const activeRegCount = regs.length

    // Cycle end = nearest upcoming billing boundary (membership end ∪ active reg paid_until).
    const boundaries: string[] = []
    if (membershipEnd) boundaries.push(String(membershipEnd).slice(0, 10))
    for (const r of regs) {
      const pu = r.paid_until ?? r.end_date
      if (r.status === 'active' && pu) boundaries.push(String(pu).slice(0, 10))
    }
    const future = boundaries.filter((b) => b >= todayIso).sort()
    const cycleEnd = future[0] ?? (boundaries.sort()[boundaries.length - 1] ?? null)

    // Weekly schedule slots + next class from the child's active enrollments.
    const schedule: FamilyScheduleSlot[] = []
    for (const e of enrByStu.get(s.id) ?? []) {
      const cls = one(e.classes) as any
      if (!cls || cls.is_active === false) continue
      const nm = lname(cls)
      for (const sch of cls.class_schedules ?? []) {
        if (sch.is_active === false) continue
        schedule.push({
          day: sch.day_of_week,
          start: String(sch.start_time).slice(0, 5),
          end: sch.end_time ? String(sch.end_time).slice(0, 5) : null,
          className: nm,
        })
      }
    }
    schedule.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))
    let nextClass: FamilyNextClass | null = null
    for (const sl of schedule) {
      const diff = (sl.day - todayDow + 7) % 7
      if (!nextClass || diff < nextClass.dayDiff || (diff === nextClass.dayDiff && sl.start < nextClass.start)) {
        nextClass = { dayDiff: diff, start: sl.start, className: sl.className }
      }
    }

    const dob = prof?.date_of_birth
    const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 864e5)) : null

    out.set(s.id, {
      studentId: s.id,
      name: localizedName(prof, locale),
      avatarUrl: prof?.avatar_url ?? null,
      beltRank: s.current_belt_rank ?? null,
      isActive: s.is_active !== false,
      phone: prof?.phone ?? null,
      age,
      portalOverride: s.portal_login_override ?? null,
      joinDate: s.join_date ?? null,
      lastSeen: lastSeenByStu.get(s.id) ?? null,
      outstanding,
      openInvoiceCount: myInv.length,
      membershipStateValue: msState,
      membershipEnd,
      activeRegCount,
      cycleEnd,
      lapsed: msState === 'lapsed' || s.is_active === false,
      nextClass,
      schedule,
    })
  }

  return out
}

/** Sum of every child's netted outstanding — the combined family balance. */
export function familyOutstandingTotal(summaries: Iterable<FamilySummary>): number {
  let total = 0
  for (const s of summaries) total += s.outstanding
  return Math.round(total * 100) / 100
}
