/**
 * FD-2 horizon card aggregations — the Week ("plan & chase") and Month ("grow &
 * diagnose") lenses of Gym 360 Pro. ALL read-time over existing FIN-1/ML-1/D1/
 * GRW-1 data; ZERO new tables. Revenue/aging/churn/funnel reuse the FIN-1 owner +
 * win-back + GRW-1 helpers; this module adds only the new read shapes the Today
 * page's Week/Month card sets need (renewals-in-window, schedule fill, trials,
 * coach load, member movement, month extras).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { localizedName, one } from '@/lib/names'
import { getChurnByMonth, getWinbackQueue } from '@/lib/finances/winback'

const lname = (r: any, locale: string) =>
  ((locale === 'ar' ? r?.name_ar : locale === 'fr' ? r?.name_fr : r?.name_en) || r?.name_en || '')

// ── Week · schedule fill ────────────────────────────────────────────────
export type ScheduleFillRow = {
  classId: string; name: string; enrolled: number; capacity: number
  fillPct: number; sessions: number; underfilled: boolean
}

/** Each active class that RUNS this week (has an active schedule) with its
 *  enrolled/capacity fill %. Underfilled (<50%) sorts first → promote targets. */
export async function getScheduleFill(
  supabase: SupabaseClient, gymId: string, locale: string,
): Promise<ScheduleFillRow[]> {
  const { data: classes } = await supabase
    .from('classes')
    .select('id, name_ar, name_en, name_fr, max_capacity')
    .eq('gym_id', gymId).eq('is_active', true).is('deleted_at', null)
  const ids = ((classes ?? []) as any[]).map((c) => c.id)
  if (!ids.length) return []

  const [{ data: scheds }, { data: enrolls }] = await Promise.all([
    supabase.from('class_schedules').select('class_id').in('class_id', ids).eq('is_active', true),
    supabase.from('class_enrollments').select('class_id').in('class_id', ids).eq('is_active', true),
  ])
  const sessBy = new Map<string, number>()
  for (const s of (scheds ?? []) as any[]) sessBy.set(s.class_id, (sessBy.get(s.class_id) ?? 0) + 1)
  const enrBy = new Map<string, number>()
  for (const e of (enrolls ?? []) as any[]) enrBy.set(e.class_id, (enrBy.get(e.class_id) ?? 0) + 1)

  return ((classes ?? []) as any[])
    .filter((c) => (sessBy.get(c.id) ?? 0) > 0) // runs this week
    .map((c) => {
      const enrolled = enrBy.get(c.id) ?? 0
      const capacity = Number(c.max_capacity ?? 0)
      const fillPct = capacity > 0 ? Math.round((enrolled / capacity) * 100) : 0
      return {
        classId: c.id, name: lname(c, locale), enrolled, capacity, fillPct,
        sessions: sessBy.get(c.id) ?? 0, underfilled: capacity > 0 && fillPct < 50,
      }
    })
    .sort((a, b) => a.fillPct - b.fillPct)
}

// ── Week + Month · renewals due in a date window ─────────────────────────
export type RenewalRow = {
  kind: 'membership' | 'class'
  studentId: string; name: string; label: string; endDate: string; amountUsd: number
}

/** Memberships + class registrations whose period ends within [from,to]
 *  (inclusive, YYYY-MM-DD), with Σ projected revenue (plan price / monthly fee).
 *  Reused by the Week ("due this week") and Month ("rest of month") cards. */
export async function getRenewalsInWindow(
  supabase: SupabaseClient, gymId: string, locale: string, fromDate: string, toDate: string,
): Promise<{ rows: RenewalRow[]; projectedUsd: number }> {
  const [{ data: mems }, { data: regs }] = await Promise.all([
    supabase
      .from('student_memberships')
      .select(`id, end_date, status,
        students!inner (id, gym_id, profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)),
        membership_plans:plan_id (name_ar, name_en, name_fr, price_usd)`)
      .eq('students.gym_id', gymId).eq('status', 'active')
      .gte('end_date', fromDate).lte('end_date', toDate).order('end_date'),
    supabase
      .from('class_registrations')
      .select(`id, end_date, status, monthly_fee_usd,
        students:student_id (id, profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)),
        classes:class_id (name_ar, name_en, name_fr)`)
      .eq('gym_id', gymId).eq('status', 'active')
      .gte('end_date', fromDate).lte('end_date', toDate).order('end_date'),
  ])

  const rows: RenewalRow[] = []
  for (const m of (mems ?? []) as any[]) {
    const st = one(m.students); const plan = one(m.membership_plans)
    rows.push({
      kind: 'membership', studentId: st?.id, name: localizedName(one(st?.profiles), locale),
      label: lname(plan, locale), endDate: m.end_date, amountUsd: Number(plan?.price_usd ?? 0),
    })
  }
  for (const r of (regs ?? []) as any[]) {
    const st = one(r.students)
    rows.push({
      kind: 'class', studentId: st?.id, name: localizedName(one(st?.profiles), locale),
      label: lname(one(r.classes), locale), endDate: r.end_date, amountUsd: Number(r.monthly_fee_usd ?? 0),
    })
  }
  rows.sort((a, b) => (a.endDate < b.endDate ? -1 : 1))
  const projectedUsd = rows.reduce((s, r) => s + r.amountUsd, 0)
  return { rows, projectedUsd }
}

// ── Week · trials this week ──────────────────────────────────────────────
export type TrialRow = {
  trialId: string; leadId: string; leadName: string
  date: string; time: string | null; coachName: string
}

/** Scheduled trial classes landing in [from,to] (gym via the lead), with the
 *  assigned coach. Drills into the lead/trial. */
export async function getTrialsThisWeek(
  supabase: SupabaseClient, gymId: string, locale: string, fromDate: string, toDate: string,
): Promise<TrialRow[]> {
  const { data } = await supabase
    .from('trial_classes')
    .select(`id, scheduled_date, scheduled_time, status,
      leads!inner (id, gym_id, first_name, last_name),
      coaches:assigned_coach_id (profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr))`)
    .eq('leads.gym_id', gymId).eq('status', 'scheduled')
    .gte('scheduled_date', fromDate).lte('scheduled_date', toDate)
    .order('scheduled_date')

  return ((data ?? []) as any[]).map((t) => {
    const lead = one(t.leads)
    return {
      trialId: t.id, leadId: lead?.id,
      leadName: [lead?.first_name, lead?.last_name].filter(Boolean).join(' '),
      date: t.scheduled_date, time: t.scheduled_time,
      coachName: localizedName(one(one(t.coaches)?.profiles), locale),
    }
  })
}

// ── Week · coach load ────────────────────────────────────────────────────
export type CoachLoadRow = { coachId: string; name: string; classes: number; ptSessions: number; total: number }

/** Per-coach weekly load: active class sessions (schedules) + PT sessions in
 *  [fromISO,toISO]. A PLAIN read-only list (TEAM-1 wires the Coach-360 link). */
export async function getCoachLoad(
  supabase: SupabaseClient, gymId: string, locale: string, fromISO: string, toISO: string,
): Promise<CoachLoadRow[]> {
  const { data: coaches } = await supabase
    .from('coaches')
    .select('id, profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)')
    .eq('gym_id', gymId).eq('is_active', true)
  const ids = ((coaches ?? []) as any[]).map((c) => c.id)
  if (!ids.length) return []

  const [{ data: scheds }, { data: pts }] = await Promise.all([
    supabase.from('class_schedules')
      .select('id, classes:class_id!inner (coach_id, gym_id, is_active)')
      .eq('classes.gym_id', gymId).eq('classes.is_active', true).eq('is_active', true),
    supabase.from('pt_sessions')
      .select('coach_id, coaches:coach_id!inner (gym_id)')
      .eq('coaches.gym_id', gymId)
      .gte('scheduled_at', fromISO).lte('scheduled_at', toISO),
  ])

  const clsBy = new Map<string, number>()
  for (const s of (scheds ?? []) as any[]) {
    const cid = one(s.classes)?.coach_id
    if (cid) clsBy.set(cid, (clsBy.get(cid) ?? 0) + 1)
  }
  const ptBy = new Map<string, number>()
  for (const p of (pts ?? []) as any[]) ptBy.set(p.coach_id, (ptBy.get(p.coach_id) ?? 0) + 1)

  return ((coaches ?? []) as any[])
    .map((c) => {
      const classes = clsBy.get(c.id) ?? 0
      const ptSessions = ptBy.get(c.id) ?? 0
      return { coachId: c.id, name: localizedName(one(c.profiles), locale), classes, ptSessions, total: classes + ptSessions }
    })
    .sort((a, b) => b.total - a.total)
}

// ── Month · member movement (new vs churn + recovered + active trend) ────
export type MemberMovement = {
  activeNow: number; newMembers: number
  lapsed: number; cancelled: number; suspended: number; churn: number
  recovered: number; net: number
}

export async function getMemberMovement(
  supabase: SupabaseClient, gymId: string, locale: string, now = new Date(),
): Promise<MemberMovement> {
  const monthStartDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)

  const [{ count: newMembers }, { data: am }, { data: ar }, churnSeries, queue] = await Promise.all([
    supabase.from('student_memberships')
      .select('id, students!inner(gym_id)', { count: 'exact', head: true })
      .eq('students.gym_id', gymId).gte('start_date', monthStartDate),
    supabase.from('student_memberships')
      .select('student_id, students!inner(gym_id)').eq('students.gym_id', gymId).eq('status', 'active'),
    supabase.from('class_registrations')
      .select('student_id').eq('gym_id', gymId).eq('status', 'active'),
    getChurnByMonth(supabase, gymId, 1),
    getWinbackQueue(supabase, gymId, locale),
  ])

  const active = new Set<string>()
  for (const r of (am ?? []) as any[]) active.add(r.student_id)
  for (const r of (ar ?? []) as any[]) active.add(r.student_id)

  const cur = churnSeries[0] ?? { lapsed: 0, cancelled: 0, suspended: 0 }
  const churn = cur.lapsed + cur.cancelled + cur.suspended
  const recovered = queue.filter((w) => w.reactivated).length
  const nm = newMembers ?? 0
  return {
    activeNow: active.size, newMembers: nm,
    lapsed: cur.lapsed, cancelled: cur.cancelled, suspended: cur.suspended, churn,
    recovered, net: nm - churn,
  }
}

// ── Month · extras (PT sold MTD · camp signups MTD · avg class utilization) ──
export type MonthExtras = { ptSold: number; campSignups: number; avgUtilPct: number; classCount: number }

export async function getMonthExtras(
  supabase: SupabaseClient, gymId: string, locale: string, now = new Date(),
): Promise<MonthExtras> {
  const monthStartISO = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  const [{ count: ptSold }, { count: campSignups }, fill] = await Promise.all([
    supabase.from('pt_assignments')
      .select('id, students!inner(gym_id)', { count: 'exact', head: true })
      .eq('students.gym_id', gymId).gte('created_at', monthStartISO),
    supabase.from('camp_registrations')
      .select('id, camps!inner(gym_id)', { count: 'exact', head: true })
      .eq('camps.gym_id', gymId).eq('status', 'confirmed').gte('created_at', monthStartISO),
    getScheduleFill(supabase, gymId, locale),
  ])

  const avgUtilPct = fill.length ? Math.round(fill.reduce((s, r) => s + r.fillPct, 0) / fill.length) : 0
  return { ptSold: ptSold ?? 0, campSignups: campSignups ?? 0, avgUtilPct, classCount: fill.length }
}
