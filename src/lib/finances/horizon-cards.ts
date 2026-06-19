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
import { getWinbackQueue } from '@/lib/finances/winback'
import { productOf, type Product } from '@/lib/finances/owner'

const PROFILE_SEL =
  'profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)'

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
// DRILL-360: each headline is backed by its CONTRIBUTING ROWS so the card can
// reconcile (count of rows === the number shown). Counts are derived FROM the
// rows, never separately.
export type MemberRow = { studentId: string; name: string; detail?: string }
export type MemberMovement = {
  activeNow: number; newMembers: number; churn: number; recovered: number; net: number
  activeRows: MemberRow[]; newRows: MemberRow[]; churnedRows: MemberRow[]; recoveredRows: MemberRow[]
}

export async function getMemberMovement(
  supabase: SupabaseClient, gymId: string, locale: string, now = new Date(),
): Promise<MemberMovement> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)
  const nameOf = (st: any) => localizedName(one(st?.profiles), locale)

  const [{ data: newMem }, { data: am }, { data: ar }, queue] = await Promise.all([
    supabase.from('student_memberships')
      .select(`student_id, students!inner (id, gym_id, ${PROFILE_SEL})`)
      .eq('students.gym_id', gymId).gte('start_date', monthStart),
    supabase.from('student_memberships')
      .select(`student_id, students!inner (id, gym_id, ${PROFILE_SEL})`)
      .eq('students.gym_id', gymId).eq('status', 'active'),
    supabase.from('class_registrations')
      .select(`student_id, students:student_id (id, gym_id, ${PROFILE_SEL})`)
      .eq('gym_id', gymId).eq('status', 'active'),
    getWinbackQueue(supabase, gymId, locale),
  ])

  // active = distinct students with an active membership OR active class reg
  const activeMap = new Map<string, MemberRow>()
  for (const r of [...((am ?? []) as any[]), ...((ar ?? []) as any[])]) {
    const st = one(r.students)
    if (st?.id && !activeMap.has(st.id)) activeMap.set(st.id, { studentId: st.id, name: nameOf(st) })
  }
  // new = distinct students whose membership STARTED this month
  const newMap = new Map<string, MemberRow>()
  for (const r of (newMem ?? []) as any[]) {
    const st = one(r.students)
    if (st?.id && !newMap.has(st.id)) newMap.set(st.id, { studentId: st.id, name: nameOf(st) })
  }
  // churned this month (from the win-back queue's persisted churn timestamp);
  // recovered = those reactivated read-time. Counts derive from these rows.
  const churnedRows: MemberRow[] = queue
    .filter((w) => (w.churnedAt ?? '').slice(0, 10) >= monthStart)
    .map((w) => ({ studentId: w.studentId, name: w.name, detail: w.churnKind }))
  const recoveredRows: MemberRow[] = queue
    .filter((w) => w.reactivated)
    .map((w) => ({ studentId: w.studentId, name: w.name }))

  const activeRows = [...activeMap.values()]
  const newRows = [...newMap.values()]
  return {
    activeNow: activeRows.length, newMembers: newRows.length,
    churn: churnedRows.length, recovered: recoveredRows.length, net: newRows.length - churnedRows.length,
    activeRows, newRows, churnedRows, recoveredRows,
  }
}

// ── Month · revenue rows this month (per-product payment detail → drill) ──
export type RevenueRow = { product: Product; studentId: string; name: string; amount: number; date: string; invoiceId: string }

/** Every payment collected this month, tagged by its invoice's product — the
 *  rows behind the revenue-by-product headline (Σ amount per product). */
export async function getRevenueRowsThisMonth(
  supabase: SupabaseClient, gymId: string, locale: string, now = new Date(),
): Promise<RevenueRow[]> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const { data: pays } = await supabase
    .from('payments')
    .select(`amount_usd, payment_date, invoice_id,
      students:student_id (id, ${PROFILE_SEL}),
      invoices:invoice_id!inner (gym_id, invoice_type)`)
    .eq('invoices.gym_id', gymId).gte('payment_date', monthStart)
    .order('payment_date', { ascending: false }).limit(2000)

  return ((pays ?? []) as any[]).map((p) => {
    const inv = one(p.invoices); const st = one(p.students)
    return {
      product: productOf(inv?.invoice_type ?? 'other'),
      studentId: st?.id ?? '', name: localizedName(one(st?.profiles), locale),
      amount: Number(p.amount_usd ?? 0), date: String(p.payment_date).slice(0, 10), invoiceId: p.invoice_id,
    }
  })
}

// ── Month · converted leads this month (→ conversion drill) ──────────────
export type ConvertedLead = { leadId: string; name: string; source: string | null; studentId: string | null }

export async function getConvertedLeadsThisMonth(
  supabase: SupabaseClient, gymId: string, now = new Date(),
): Promise<ConvertedLead[]> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const { data } = await supabase
    .from('leads')
    .select('id, first_name, last_name, source, converted_student_id, converted_at')
    .eq('gym_id', gymId).eq('status', 'converted').gte('converted_at', monthStart)
    .order('converted_at', { ascending: false })
  return ((data ?? []) as any[]).map((l) => ({
    leadId: l.id, name: [l.first_name, l.last_name].filter(Boolean).join(' '),
    source: l.source, studentId: l.converted_student_id,
  }))
}

// ── Month · extras (PT sold MTD · camp signups MTD · avg class utilization) ──
// DRILL-360: returns the contributing PT-sale + camp-signup rows so each tile
// reconciles (count of rows === the number shown).
export type ExtraRow = { studentId: string; name: string; detail: string }
export type MonthExtras = {
  ptSold: number; campSignups: number; avgUtilPct: number; classCount: number
  ptRows: ExtraRow[]; campRows: ExtraRow[]
}

export async function getMonthExtras(
  supabase: SupabaseClient, gymId: string, locale: string, now = new Date(),
): Promise<MonthExtras> {
  const monthStartISO = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const ln = (r: any) => lname(r, locale)

  const [{ data: ptData }, { data: campData }, fill] = await Promise.all([
    supabase.from('pt_assignments')
      .select(`id, created_at, students!inner (id, gym_id, ${PROFILE_SEL}), pt_packages:package_id (name_ar, name_en, name_fr)`)
      .eq('students.gym_id', gymId).gte('created_at', monthStartISO).order('created_at', { ascending: false }),
    supabase.from('camp_registrations')
      .select(`id, created_at, students:student_id (id, ${PROFILE_SEL}), camps!inner (gym_id, name_ar, name_en, name_fr)`)
      .eq('camps.gym_id', gymId).eq('status', 'confirmed').gte('created_at', monthStartISO).order('created_at', { ascending: false }),
    getScheduleFill(supabase, gymId, locale),
  ])

  const ptRows: ExtraRow[] = ((ptData ?? []) as any[]).map((a) => {
    const st = one(a.students)
    return { studentId: st?.id ?? '', name: localizedName(one(st?.profiles), locale), detail: ln(one(a.pt_packages)) }
  })
  const campRows: ExtraRow[] = ((campData ?? []) as any[]).map((c) => {
    const st = one(c.students)
    return { studentId: st?.id ?? '', name: localizedName(one(st?.profiles), locale), detail: ln(one(c.camps)) }
  })

  const avgUtilPct = fill.length ? Math.round(fill.reduce((s, r) => s + r.fillPct, 0) / fill.length) : 0
  return { ptSold: ptRows.length, campSignups: campRows.length, avgUtilPct, classCount: fill.length, ptRows, campRows }
}
