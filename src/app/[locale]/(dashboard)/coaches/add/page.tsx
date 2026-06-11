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

  // SSOT: the gym's active disciplines drive the specialty chips (raw rows —
  // the form needs all three localized names to store specialization_*).
  const { data: { user } } = await supabase.auth.getUser()
  const { data: me } = await supabase.from('profiles').select('gym_id').eq('id', user?.id ?? '').single()
  const { data: disciplines } = await supabase
    .from('disciplines')
    .select('id, name_ar, name_en, name_fr')
    .eq('gym_id', me?.gym_id ?? '')
    .eq('is_active', true)
    .order('sort_order')

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">{t('add_coach')}</h1>
      <CoachForm
        disciplines={(disciplines || []) as any}
        locale={locale}
      />
    </div>
  )
}
