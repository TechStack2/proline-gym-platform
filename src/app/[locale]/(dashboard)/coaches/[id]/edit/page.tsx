import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { CoachForm } from '../../components/coach-form'
import { one } from '@/lib/names'

export const dynamic = 'force-dynamic'

/** ADM-1: edit a coach — same repaired form, prefilled (profiles + coaches). */
export default async function EditCoachPage({
  params: { locale, id },
}: {
  params: { locale: string; id: string }
}) {
  const supabase = await createClient()
  const t = await getTranslations('coaches')

  const { data: coach } = await supabase
    .from('coaches')
    .select(`id, gym_id, specialization_ar, specialization_en, specialization_fr, bio_ar, bio_en, bio_fr,
      profiles!inner (id, first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone, avatar_url)`)
    .eq('id', id)
    .maybeSingle()
  if (!coach) notFound()

  const { data: disciplines } = await supabase
    .from('disciplines')
    .select('id, name_ar, name_en, name_fr')
    .eq('gym_id', coach.gym_id)
    .eq('is_active', true)
    .order('sort_order')

  const profile: any = one((coach as any).profiles)

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">{t('admin.edit')}</h1>
      <CoachForm
        disciplines={(disciplines || []) as any}
        locale={locale}
        initialData={{
          coachId: coach.id,
          profileId: profile.id,
          gymId: coach.gym_id,
          avatarUrl: profile.avatar_url,
          first_name_ar: profile.first_name_ar,
          first_name_en: profile.first_name_en,
          first_name_fr: profile.first_name_fr,
          last_name_ar: profile.last_name_ar,
          last_name_en: profile.last_name_en,
          last_name_fr: profile.last_name_fr,
          phone: profile.phone,
          specialization_ar: (coach as any).specialization_ar,
          specialization_en: (coach as any).specialization_en,
          specialization_fr: (coach as any).specialization_fr,
          bio_ar: (coach as any).bio_ar,
          bio_en: (coach as any).bio_en,
          bio_fr: (coach as any).bio_fr,
        }}
      />
    </div>
  )
}
