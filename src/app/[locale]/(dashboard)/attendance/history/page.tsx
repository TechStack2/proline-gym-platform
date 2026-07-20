import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { AttendanceHistoryClient } from './attendance-history-client'
import { PageHeader } from '@/components/ui/page-header';

interface AttendanceHistoryPageProps {
  params: { locale: string }
  searchParams: { classId?: string; disciplineId?: string; dateFrom?: string; dateTo?: string }
}

// REAL MODEL (REP-1): attendance lives in `attendance_records` keyed by
// `attendance_date` + `class_id` (NOT the phantom `class_schedules.date` /
// `students.first_name` the old page queried — that was the DOA). Names live on
// profiles, class/discipline names are localized columns. Catalog `_read` RLS is
// all-authenticated, so every class/discipline read MUST be gym-scoped explicitly.
function localized(row: any, locale: string, base: string): string {
  if (!row) return ''
  if (locale === 'ar') return row[`${base}_ar`] || row[`${base}_en`] || ''
  if (locale === 'fr') return row[`${base}_fr`] || row[`${base}_en`] || ''
  return row[`${base}_en`] || ''
}

function startOfWeekISO(): string {
  const d = new Date()
  const day = d.getDay() // 0=Sun
  d.setDate(d.getDate() - day)
  return d.toISOString().split('T')[0]
}

export default async function AttendanceHistoryPage({ params: { locale }, searchParams }: AttendanceHistoryPageProps) {
  const t = await getTranslations('attendanceHistory')
  const supabase = await createClient()

  const today = new Date().toISOString().split('T')[0]
  const dateFrom = searchParams.dateFrom || startOfWeekISO()
  const dateTo = searchParams.dateTo || today
  const { classId, disciplineId } = searchParams

  // Resolve the staff member's gym (tenant scoping — catalog reads are all-authed).
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
    : { data: null }
  const gymId = profile?.gym_id ?? null

  // Active, gym-scoped class + discipline pickers (ADM-2 sweep conventions).
  const { data: disciplines } = await supabase
    .from('disciplines')
    .select('id, name_ar, name_en, name_fr')
    .eq('gym_id', gymId ?? '')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  const { data: classes } = await supabase
    .from('classes')
    .select('id, name_ar, name_en, name_fr, discipline_id')
    .eq('gym_id', gymId ?? '')
    .eq('is_active', true)
    .order('name_en', { ascending: true })

  const classList = classes ?? []

  // The set of class ids this query may read: the gym's active classes, narrowed
  // by the discipline filter when present. Scoping attendance through these ids
  // keeps the read tenant-clean even though attendance_records embeds catalog rows.
  const scopedClassIds = classList
    .filter((c) => !disciplineId || c.discipline_id === disciplineId)
    .map((c) => c.id)

  let records: any[] = []
  if (scopedClassIds.length > 0) {
    const { data } = await supabase
      .from('attendance_records')
      .select(`
        id, attendance_date, status, class_id, marked_by,
        classes:class_id ( id, name_ar, name_en, name_fr, discipline_id ),
        students:student_id (
          id,
          profiles:profile_id ( first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr )
        )
      `)
      .in('class_id', classId ? [classId] : scopedClassIds)
      .gte('attendance_date', dateFrom)
      .lte('attendance_date', dateTo)
      .order('attendance_date', { ascending: false })
      .limit(500)

    records = data ?? []
  }

  // Flatten to the row shape the client renders (localized names resolved here).
  const rows = records.map((r) => {
    const cls = Array.isArray(r.classes) ? r.classes[0] : r.classes
    const stu = Array.isArray(r.students) ? r.students[0] : r.students
    const prof = stu && (Array.isArray(stu.profiles) ? stu.profiles[0] : stu.profiles)
    const first = localized(prof, locale, 'first_name')
    const last = localized(prof, locale, 'last_name')
    return {
      id: r.id,
      date: r.attendance_date,
      status: r.status as string,
      className: localized(cls, locale, 'name') || '—',
      studentName: `${first} ${last}`.trim() || '—',
      markedBy: r.marked_by as string | null,
    }
  })

  // Per-day summary (present/absent/late/excused counts per date).
  const summaryMap = new Map<string, { present: number; absent: number; late: number; excused: number }>()
  for (const r of rows) {
    const s = summaryMap.get(r.date) ?? { present: 0, absent: 0, late: 0, excused: 0 }
    if (r.status in s) (s as any)[r.status] += 1
    summaryMap.set(r.date, s)
  }
  const daySummary = Array.from(summaryMap.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, counts]) => ({ date, ...counts }))

  return (
    <div className="space-y-6 p-6" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div>
        <PageHeader segment="attendance" />
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Suspense fallback={<div className="text-center py-8 text-muted-foreground">…</div>}>
        <AttendanceHistoryClient
          classes={classList.map((c) => ({ id: c.id, name: localized(c, locale, 'name'), disciplineId: c.discipline_id }))}
          disciplines={(disciplines ?? []).map((d) => ({ id: d.id, name: localized(d, locale, 'name') }))}
          rows={rows}
          daySummary={daySummary}
          selectedClassId={classId}
          selectedDisciplineId={disciplineId}
          dateFrom={dateFrom}
          dateTo={dateTo}
          locale={locale}
        />
      </Suspense>
    </div>
  )
}
