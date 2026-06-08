import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { StudentForm } from '../components/student-form'

export default async function AddStudentPage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const supabase = await createClient()
  const t = await getTranslations('students')

  // ── Auth + gym_id for multi-tenant isolation ──────────
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('gym_id')
    .eq('id', user.id)
    .single()

  const gymId = profile?.gym_id
  if (!gymId) return null

  // Fetch disciplines — select all locale variants, map in JS
  const { data: disciplines } = await supabase
    .from('disciplines')
    .select('id, name_ar, name_en, name_fr')
    .eq('gym_id', gymId)
    .order('sort_order')

  const mappedDisciplines = (disciplines || []).map((d: any) => ({
    id: d.id,
    name: locale === 'ar' ? d.name_ar : locale === 'fr' ? d.name_fr : d.name_en,
  }))

  // Fetch belt ranks
  const { data: beltRanks } = await supabase
    .from('belt_hierarchies')
    .select('id, name_ar, name_en, sort_order')
    .eq('gym_id', gymId)
    .order('sort_order')

  const { data: guardians } = await supabase
    .from('guardians')
    .select(`
      id,
      profiles!inner (
        id,
        first_name_ar,
        first_name_en,
        first_name_fr,
        last_name_ar,
        last_name_en,
        last_name_fr,
        phone
      )
    `)
    .eq('gym_id', gymId)
    .order('created_at', { ascending: false })

  const mappedGuardians = (guardians || []).map((g: any) => ({
    id: g.id,
    name_ar: [g.profiles?.first_name_ar, g.profiles?.last_name_ar].filter(Boolean).join(' ') || '',
    name_en: [g.profiles?.first_name_en, g.profiles?.last_name_en].filter(Boolean).join(' ') || '',
    name_fr: [g.profiles?.first_name_fr, g.profiles?.last_name_fr].filter(Boolean).join(' ') || '',
    phone: g.profiles?.phone || '',
  }))

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">{t('add_student')}</h1>
      <StudentForm
        disciplines={mappedDisciplines}
        beltRanks={beltRanks || []}
        guardians={mappedGuardians}
        locale={locale}
        gymId={gymId}
      />
    </div>
  )
}
