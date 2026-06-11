import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { CoachDetail } from '../components/coach-detail'

export default async function CoachDetailPage({
  params: { locale, id },
}: {
  params: { locale: string; id: string }
}) {
  const supabase = await createClient()
  const t = await getTranslations('coaches')

  const { data: coach, error } = await supabase
    .from('coaches')
    .select(`
      *,
      profiles!inner (
        id,
        first_name_ar,
        first_name_en,
        first_name_fr,
        last_name_ar,
        last_name_en,
        last_name_fr,
        phone,
        avatar_url
      )
    `)
    .eq('id', id)
    .single()

  if (error || !coach) {
    notFound()
  }

  // Fetch coach's classes (schedules live on class_schedules; classes has no
  // start_time/name — use the embed + localized name_*).
  const { data: classes } = await supabase
    .from('classes')
    .select('id, name_ar, name_en, name_fr, status, schedules:class_schedules(id, day_of_week, start_time, end_time)')
    .eq('coach_id', id)
    .order('created_at', { ascending: true })

  // ADM-1 deactivate warning inputs: live obligations on this coach.
  const [{ count: activeClassCount }, { count: activePtCount }] = await Promise.all([
    supabase.from('classes').select('id', { count: 'exact', head: true })
      .eq('coach_id', id).eq('is_active', true),
    supabase.from('pt_assignments').select('id', { count: 'exact', head: true })
      .eq('coach_id', id).eq('status', 'active').eq('is_active', true),
  ])

  return (
    <CoachDetail
      coach={coach}
      classes={classes || []}
      locale={locale}
      activeClassCount={activeClassCount ?? 0}
      activePtCount={activePtCount ?? 0}
    />
  )
}
