/**
 * MEMBER-ENRICH (read-time) — the at-a-glance member info surfaced on the member
 * list cards and the class roster: the disciplines + active classes a student
 * trains, plus their membership status. ONE batched gym-scoped read (the
 * `class → disciplines` join the surfaces lacked, over BOTH the attendance
 * roster `class_enrollments` and the B2 `class_registrations` flow, since a
 * member can be "in" a class via either path + memberships), keyed by student
 * id. Zero schema.
 *
 * EXTENSION POINT: more per-member fields are coming (operator feedback). Add
 * them HERE — extend `MemberInfo`, select the extra column(s) in these reads,
 * and render one more chip in the card/roster info area. No new per-field
 * plumbing or extra round-trips.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type MembershipStatus = 'active' | 'expiring' | 'lapsed' | 'none'

export type MemberInfo = {
  disciplines: string[]      // distinct discipline names of the student's active classes
  classes: string[]          // the student's active class names
  membershipStatus: MembershipStatus
}

const lname = (r: any, locale: string) =>
  ((locale === 'ar' ? r?.name_ar : locale === 'fr' ? r?.name_fr : r?.name_en) || r?.name_en || '')

const blank = (): MemberInfo => ({ disciplines: [], classes: [], membershipStatus: 'none' })

/** Map<studentId, MemberInfo> for the given (already gym-scoped) student ids. */
export async function getMemberEnrichment(
  supabase: SupabaseClient, gymId: string, studentIds: string[], locale: string, now = new Date(),
): Promise<Record<string, MemberInfo>> {
  const out: Record<string, MemberInfo> = {}
  if (!studentIds.length) return out
  for (const id of studentIds) out[id] = blank()

  const today = now.toISOString().slice(0, 10)
  const in7 = new Date(now.getTime() + 7 * 864e5).toISOString().slice(0, 10)

  // the join the surfaces lacked: class → discipline, over both membership paths.
  // (class_enrollments has no gym_id — student_ids are already gym-scoped + RLS.)
  const CLASS_JOIN = 'student_id, classes:class_id (name_ar, name_en, name_fr, disciplines:discipline_id (name_ar, name_en, name_fr))'
  const [{ data: enrolls }, { data: regs }, { data: mems }] = await Promise.all([
    supabase.from('class_enrollments').select(CLASS_JOIN)
      .in('student_id', studentIds).eq('is_active', true),
    supabase.from('class_registrations').select(`status, ${CLASS_JOIN}`)
      .eq('gym_id', gymId).in('student_id', studentIds).eq('status', 'active'),
    supabase.from('student_memberships')
      .select('student_id, status, end_date')
      .in('student_id', studentIds),
  ])

  for (const r of [...((enrolls ?? []) as any[]), ...((regs ?? []) as any[])]) {
    const info = out[r.student_id]; if (!info) continue
    const cls = Array.isArray(r.classes) ? r.classes[0] : r.classes
    const clsName = lname(cls, locale)
    if (clsName && !info.classes.includes(clsName)) info.classes.push(clsName)
    const disc = lname(Array.isArray(cls?.disciplines) ? cls.disciplines[0] : cls?.disciplines, locale)
    if (disc && !info.disciplines.includes(disc)) info.disciplines.push(disc)
  }

  // membership status: strongest of the student's memberships
  const flags: Record<string, { activeFar: boolean; activeSoon: boolean; lapsed: boolean }> = {}
  for (const m of (mems ?? []) as any[]) {
    const f = (flags[m.student_id] ??= { activeFar: false, activeSoon: false, lapsed: false })
    if (m.status === 'active') {
      if (m.end_date && m.end_date >= today && m.end_date <= in7) f.activeSoon = true
      else if (!m.end_date || m.end_date > in7) f.activeFar = true
      else f.lapsed = true // active but already past end (read-time lapsed)
    } else if (m.status === 'lapsed' || m.status === 'expired') {
      f.lapsed = true
    }
  }
  for (const id of studentIds) {
    const f = flags[id]
    out[id].membershipStatus = !f ? 'none'
      : f.activeFar ? 'active' : f.activeSoon ? 'expiring' : f.lapsed ? 'lapsed' : 'none'
  }

  return out
}
