import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { ReportsClient } from './_components/reports-client'
import { PageHeader } from '@/components/ui/page-header';

type Props = {
  params: { locale: string }
  searchParams: { dateFrom?: string; dateTo?: string }
}

// REP-1 honest reporting: every figure is computed from the REAL attendance
// model (attendance_records.attendance_date + class_id) against gym-scoped
// catalog rows — no invented analytics, no export. "Session" = one (class, date)
// with marked attendance; "attended" = present OR late; "fill rate" = attended /
// (sessions × capacity). Divisions are guarded so the UI never renders NaN.
function localized(row: any, locale: string, base: string): string {
  if (!row) return ''
  if (locale === 'ar') return row[`${base}_ar`] || row[`${base}_en`] || ''
  if (locale === 'fr') return row[`${base}_fr`] || row[`${base}_en`] || ''
  return row[`${base}_en`] || ''
}

export default async function ReportsPage({ params: { locale }, searchParams }: Props) {
  const t = await getTranslations('reports')
  const supabase = await createClient()
  const isRTL = locale === 'ar'

  const today = new Date().toISOString().split('T')[0]
  const dateFrom = searchParams.dateFrom || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  const dateTo = searchParams.dateTo || today

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
    : { data: null }
  const gymId = profile?.gym_id ?? null

  // Gym's active classes (+ discipline + capacity). Catalog _read RLS is
  // all-authenticated → gym-scope explicitly.
  const { data: classesRaw } = await supabase
    .from('classes')
    .select('id, name_ar, name_en, name_fr, max_capacity, discipline_id, disciplines:discipline_id ( id, name_ar, name_en, name_fr )')
    .eq('gym_id', gymId ?? '')
    .eq('is_active', true)

  const classes = (classesRaw ?? []).map((c: any) => {
    const disc = Array.isArray(c.disciplines) ? c.disciplines[0] : c.disciplines
    return {
      id: c.id as string,
      name: localized(c, locale, 'name') || '—',
      capacity: (c.max_capacity as number) || 0,
      disciplineId: c.discipline_id as string,
      disciplineName: localized(disc, locale, 'name') || '—',
    }
  })
  const classIds = classes.map((c) => c.id)
  const classById = new Map(classes.map((c) => [c.id, c]))

  // Attendance in range, scoped to the gym's classes.
  let records: any[] = []
  if (classIds.length > 0) {
    const { data } = await supabase
      .from('attendance_records')
      .select(`
        attendance_date, status, class_id, student_id,
        students:student_id ( id, profiles:profile_id ( first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr ) )
      `)
      .in('class_id', classIds)
      .gte('attendance_date', dateFrom)
      .lte('attendance_date', dateTo)
      .limit(5000)
    records = data ?? []
  }

  const attended = (s: string) => s === 'present' || s === 'late'

  // ── By class ── sessions = distinct dates; attended = present+late.
  const byClassAcc = new Map<string, { sessions: Set<string>; attended: number }>()
  for (const r of records) {
    const acc = byClassAcc.get(r.class_id) ?? { sessions: new Set<string>(), attended: 0 }
    acc.sessions.add(r.attendance_date)
    if (attended(r.status)) acc.attended += 1
    byClassAcc.set(r.class_id, acc)
  }
  const byClass = Array.from(byClassAcc.entries())
    .map(([cid, acc]) => {
      const c = classById.get(cid)
      const sessions = acc.sessions.size
      const avgAttendance = sessions > 0 ? acc.attended / sessions : 0
      const capacity = c?.capacity ?? 0
      const fillRate = sessions > 0 && capacity > 0 ? Math.round((acc.attended / (sessions * capacity)) * 100) : 0
      return {
        classId: cid,
        className: c?.name ?? '—',
        disciplineName: c?.disciplineName ?? '—',
        sessions,
        avgAttendance: Math.round(avgAttendance * 10) / 10,
        capacity,
        fillRate,
      }
    })
    .sort((a, b) => b.sessions - a.sessions || b.avgAttendance - a.avgAttendance)

  // ── By discipline ── aggregate class figures, weighting fill rate by capacity·sessions.
  const byDiscAcc = new Map<string, { name: string; classes: Set<string>; sessions: number; attended: number; capSlots: number }>()
  for (const row of byClass) {
    const c = classById.get(row.classId)
    if (!c) continue
    const acc = byDiscAcc.get(c.disciplineId) ?? { name: c.disciplineName, classes: new Set<string>(), sessions: 0, attended: 0, capSlots: 0 }
    acc.classes.add(c.id)
    acc.sessions += row.sessions
    acc.attended += Math.round(row.avgAttendance * row.sessions)
    acc.capSlots += row.sessions * row.capacity
    byDiscAcc.set(c.disciplineId, acc)
  }
  const byDiscipline = Array.from(byDiscAcc.values())
    .map((acc) => ({
      disciplineName: acc.name,
      classes: acc.classes.size,
      sessions: acc.sessions,
      avgAttendance: acc.sessions > 0 ? Math.round((acc.attended / acc.sessions) * 10) / 10 : 0,
      fillRate: acc.capSlots > 0 ? Math.round((acc.attended / acc.capSlots) * 100) : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions)

  // ── Per-student ── attended + absent counts; leaders (most attended), at-risk (≥3 absent).
  const byStudent = new Map<string, { name: string; present: number; absent: number }>()
  for (const r of records) {
    const stu = Array.isArray(r.students) ? r.students[0] : r.students
    const prof = stu && (Array.isArray(stu.profiles) ? stu.profiles[0] : stu.profiles)
    const name = `${localized(prof, locale, 'first_name')} ${localized(prof, locale, 'last_name')}`.trim() || '—'
    const acc = byStudent.get(r.student_id) ?? { name, present: 0, absent: 0 }
    if (attended(r.status)) acc.present += 1
    if (r.status === 'absent') acc.absent += 1
    byStudent.set(r.student_id, acc)
  }
  const studentsAll = Array.from(byStudent.values())
  const leaders = studentsAll
    .filter((s) => s.present > 0)
    .map((s) => ({ ...s, rate: s.present + s.absent > 0 ? Math.round((s.present / (s.present + s.absent)) * 100) : 0 }))
    .sort((a, b) => b.present - a.present)
    .slice(0, 10)
  const atRisk = studentsAll
    .filter((s) => s.absent >= 3)
    .map((s) => ({ ...s, rate: s.present + s.absent > 0 ? Math.round((s.present / (s.present + s.absent)) * 100) : 0 }))
    .sort((a, b) => b.absent - a.absent)
    .slice(0, 10)

  return (
    <div className="space-y-6">
      <div>
        <PageHeader segment="reports" />
        <p className="mt-1 text-sm text-gray-500">{t('subtitle')}</p>
      </div>

      <Suspense fallback={<div className="animate-pulse h-96 bg-gray-100 rounded-2xl" />}>
        <ReportsClient
          locale={locale}
          dateFrom={dateFrom}
          dateTo={dateTo}
          byClass={byClass}
          byDiscipline={byDiscipline}
          leaders={leaders}
          atRisk={atRisk}
        />
      </Suspense>
    </div>
  )
}
