/**
 * FIN-1 win-back + churn — all READS over existing ML-1 state + the FIN-1
 * churn timestamps (000050). The queue is anchored on the churn TIMESTAMP
 * (lapsed_at / cancelled_at / suspended_at), which PERSISTS through an ML-1
 * reinstate — so "reactivated" is a clean read-time check (does the member
 * have an active membership/registration NOW?), and a reinstated member stays
 * visible in the queue but flips to the reactivated state with no bookkeeping.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type WinbackRow = {
  studentId: string
  name: string
  phone: string | null
  churnedAt: string // ISO — most recent churn event
  churnKind: 'lapsed' | 'cancelled' | 'suspended'
  reactivated: boolean
  lastOutcome: string | null
  lastNote: string | null
  nextActionDate: string | null
}

type Profile = {
  first_name_ar: string | null; first_name_en: string | null; first_name_fr: string | null
  last_name_ar: string | null; last_name_en: string | null; last_name_fr: string | null
  phone: string | null
}

function pickName(p: Profile | null | undefined, locale: string): string {
  if (!p) return ''
  const fn = locale === 'ar' ? p.first_name_ar : locale === 'fr' ? p.first_name_fr : p.first_name_en
  const ln = locale === 'ar' ? p.last_name_ar : locale === 'fr' ? p.last_name_fr : p.last_name_en
  return [fn || p.first_name_en, ln || p.last_name_en].filter(Boolean).join(' ')
}

/**
 * The win-back queue: every student who EVER churned (a persisted churn
 * timestamp), most-recent first, with their current read-time reactivation
 * state and their latest followup. Bounded to 50 rows.
 */
export async function getWinbackQueue(
  supabase: SupabaseClient, gymId: string, locale: string,
): Promise<WinbackRow[]> {
  // 1. Churned memberships (lapsed or cancelled) — gym via the student.
  const { data: churnMemRaw } = await supabase
    .from('student_memberships')
    .select('student_id, lapsed_at, cancelled_at, students!inner(gym_id)')
    .eq('students.gym_id', gymId)
    .or('lapsed_at.not.is.null,cancelled_at.not.is.null')

  // 2. Churned registrations (suspended or cancelled) — direct gym_id.
  const { data: churnRegRaw } = await supabase
    .from('class_registrations')
    .select('student_id, suspended_at, cancelled_at')
    .eq('gym_id', gymId)
    .or('suspended_at.not.is.null,cancelled_at.not.is.null')

  // Reduce to the most-recent churn event per student.
  const churn = new Map<string, { at: string; kind: WinbackRow['churnKind'] }>()
  const note = (sid: string, at: string | null, kind: WinbackRow['churnKind']) => {
    if (!at) return
    const cur = churn.get(sid)
    if (!cur || at > cur.at) churn.set(sid, { at, kind })
  }
  for (const m of (churnMemRaw ?? []) as any[]) {
    note(m.student_id, m.lapsed_at, 'lapsed')
    note(m.student_id, m.cancelled_at, 'cancelled')
  }
  for (const r of (churnRegRaw ?? []) as any[]) {
    note(r.student_id, r.suspended_at, 'suspended')
    note(r.student_id, r.cancelled_at, 'cancelled')
  }
  const studentIds = [...churn.keys()]
  if (studentIds.length === 0) return []

  // 3. Profiles, 4. current active rows (read-time reactivation), 5. followups.
  const [{ data: studs }, { data: activeMems }, { data: activeRegs }, { data: followups }] = await Promise.all([
    supabase.from('students')
      .select('id, profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone)')
      .in('id', studentIds),
    supabase.from('student_memberships').select('student_id').in('student_id', studentIds).eq('status', 'active'),
    supabase.from('class_registrations').select('student_id').in('student_id', studentIds).eq('status', 'active'),
    supabase.from('member_followups')
      .select('student_id, outcome, note, next_action_date, created_at')
      .eq('gym_id', gymId).in('student_id', studentIds).order('created_at', { ascending: false }),
  ])

  const activeSet = new Set<string>()
  for (const m of (activeMems ?? []) as any[]) activeSet.add(m.student_id)
  for (const r of (activeRegs ?? []) as any[]) activeSet.add(r.student_id)

  const latestFollowup = new Map<string, any>()
  for (const f of (followups ?? []) as any[]) {
    if (!latestFollowup.has(f.student_id)) latestFollowup.set(f.student_id, f) // first = newest (ordered desc)
  }

  const profById = new Map<string, Profile>()
  for (const s of (studs ?? []) as any[]) {
    profById.set(s.id, Array.isArray(s.profiles) ? s.profiles[0] : s.profiles)
  }

  return studentIds
    .map((sid) => {
      const c = churn.get(sid)!
      const f = latestFollowup.get(sid)
      const prof = profById.get(sid)
      return {
        studentId: sid,
        name: pickName(prof, locale),
        phone: prof?.phone ?? null,
        churnedAt: c.at,
        churnKind: c.kind,
        reactivated: activeSet.has(sid),
        lastOutcome: f?.outcome ?? null,
        lastNote: f?.note ?? null,
        nextActionDate: f?.next_action_date ?? null,
      }
    })
    .sort((a, b) => (a.churnedAt < b.churnedAt ? 1 : -1))
    .slice(0, 50)
}

export type ChurnMonth = { month: string; lapsed: number; cancelled: number; suspended: number }

/**
 * Churn per month for the last `months` (default 6): memberships lapsed/
 * cancelled + registrations suspended/cancelled, bucketed by the transition
 * timestamp. Pre-FIN-1 churned rows (NULL timestamp) are honestly excluded.
 */
export async function getChurnByMonth(
  supabase: SupabaseClient, gymId: string, months = 6,
): Promise<ChurnMonth[]> {
  const since = new Date()
  since.setUTCMonth(since.getUTCMonth() - (months - 1), 1)
  since.setUTCHours(0, 0, 0, 0)
  const sinceIso = since.toISOString()

  const [{ data: mems }, { data: regs }] = await Promise.all([
    supabase.from('student_memberships')
      .select('lapsed_at, cancelled_at, students!inner(gym_id)')
      .eq('students.gym_id', gymId)
      .or(`lapsed_at.gte.${sinceIso},cancelled_at.gte.${sinceIso}`),
    supabase.from('class_registrations')
      .select('suspended_at, cancelled_at')
      .eq('gym_id', gymId)
      .or(`suspended_at.gte.${sinceIso},cancelled_at.gte.${sinceIso}`),
  ])

  const buckets = new Map<string, ChurnMonth>()
  const key = (iso: string) => iso.slice(0, 7) // YYYY-MM
  const ensure = (mk: string) => {
    if (!buckets.has(mk)) buckets.set(mk, { month: mk, lapsed: 0, cancelled: 0, suspended: 0 })
    return buckets.get(mk)!
  }
  for (const m of (mems ?? []) as any[]) {
    if (m.lapsed_at && m.lapsed_at >= sinceIso) ensure(key(m.lapsed_at)).lapsed++
    if (m.cancelled_at && m.cancelled_at >= sinceIso) ensure(key(m.cancelled_at)).cancelled++
  }
  for (const r of (regs ?? []) as any[]) {
    if (r.suspended_at && r.suspended_at >= sinceIso) ensure(key(r.suspended_at)).suspended++
    if (r.cancelled_at && r.cancelled_at >= sinceIso) ensure(key(r.cancelled_at)).cancelled++
  }

  // Emit a continuous last-N-months series (zero-filled), newest first.
  const out: ChurnMonth[] = []
  for (let i = 0; i < months; i++) {
    const d = new Date()
    d.setUTCMonth(d.getUTCMonth() - i, 1)
    const mk = d.toISOString().slice(0, 7)
    out.push(buckets.get(mk) ?? { month: mk, lapsed: 0, cancelled: 0, suspended: 0 })
  }
  return out
}
