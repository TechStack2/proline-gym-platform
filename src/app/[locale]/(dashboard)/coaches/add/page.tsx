import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { CoachForm } from '../components/coach-form'

export default async function AddCoachPage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const supabase = await createClient()
  const t = await getTranslations('coaches')

  const { data: disciplines } = await supabase
    .from('disciplines')
    .select('id, name_ar, name_en, name_fr')
    .order('sort_order')

  // Map to { id, name } shape for the form component
  const mappedDisciplines = (disciplines || []).map((d: any) => ({
    id: d.id,
    name: locale === 'ar' ? d.name_ar : locale === 'fr' ? d.name_fr : d.name_en,
  }))

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">{t('add_coach')}</h1>
      <CoachForm
        disciplines={mappedDisciplines}
        locale={locale}
      />
    </div>
  )
}
