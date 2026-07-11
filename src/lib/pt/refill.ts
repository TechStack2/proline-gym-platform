import type { SupabaseClient } from '@supabase/supabase-js'
import { localizedName, one } from '@/lib/names'

/**
 * PT renewal-due (PT-1, locked fork): COMPUTED AT READ TIME — no cron. A
 * package is due for renewal when sessions remaining ≤ the gym's
 * pt_refill_sessions_threshold OR validity ends within
 * pt_refill_days_threshold days. Shared by the Inbox section and the Today
 * card (and, later, whatever D3 dunning wants to reuse).
 */
export type RenewalDueRow = {
  assignmentId: string
  studentId: string
  studentName: string
  packageId: string
  packageName: string
  remaining: number
  total: number
  expiresAt: string | null
  daysLeft: number | null
}

export async function getRenewalsDue(
  supabase: SupabaseClient<any>,
  gymId: string,
  locale: string,
  // TODAY-DERISK: callers that already hold the gym row (e.g. TodayHorizon reads gyms
  // ONCE) pass the thresholds in to skip this helper's own gyms round-trip. Omitted →
  // the read happens here as before (Inbox and any other caller are unchanged).
  thresholds?: { sessions: number; days: number },
): Promise<RenewalDueRow[]> {
  let thrSessions: number
  let thrDays: number
  if (thresholds) {
    thrSessions = thresholds.sessions
    thrDays = thresholds.days
  } else {
    const { data: gym } = await supabase
      .from('gyms')
      .select('pt_refill_sessions_threshold, pt_refill_days_threshold')
      .eq('id', gymId)
      .single()
    thrSessions = gym?.pt_refill_sessions_threshold ?? 2
    thrDays = gym?.pt_refill_days_threshold ?? 7
  }

  const { data: rows } = await supabase
    .from('pt_assignments')
    .select(`id, package_id, sessions_total, sessions_remaining, expires_at,
      students!inner (id, gym_id, profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)),
      pt_packages:package_id (name_ar, name_en, name_fr)`)
    .eq('students.gym_id', gymId)
    .eq('status', 'active')
    .eq('is_active', true)
    .limit(200)

  const now = Date.now()
  const lname = (r: any) =>
    ((locale === 'ar' ? r?.name_ar : locale === 'fr' ? r?.name_fr : r?.name_en) || r?.name_en || '')

  return ((rows ?? []) as any[])
    .map((a) => {
      const daysLeft = a.expires_at ? Math.ceil((new Date(a.expires_at).getTime() - now) / 864e5) : null
      return {
        assignmentId: a.id,
        studentId: one(a.students)?.id as string,
        studentName: localizedName(one(one(a.students)?.profiles), locale),
        packageId: a.package_id as string,
        packageName: lname(one(a.pt_packages)),
        remaining: a.sessions_remaining ?? 0,
        total: a.sessions_total ?? 0,
        expiresAt: a.expires_at,
        daysLeft,
      }
    })
    .filter((r) =>
      // still usable (not yet expired-frozen) AND due: low credits OR closing window
      (r.daysLeft === null || r.daysLeft >= 0) &&
      (r.remaining <= thrSessions || (r.daysLeft !== null && r.daysLeft <= thrDays)),
    )
    .sort((a, b) => a.remaining - b.remaining)
}
