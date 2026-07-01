import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { AddStudentWizard } from '../components/add-student-wizard'
import { getEnabledProducts } from '@/lib/gym/products'

/**
 * Add student (UX-2): the prototype StudentForm page became the FormWizard
 * (identity → guardian-for-minors → optional plan → review). Same write path
 * (create_student); the prototype StudentForm is deleted (no other consumer).
 */
export default async function AddStudentPage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
  const gymId = profile?.gym_id
  if (!gymId) return null

  const { data: plans } = await supabase
    .from('membership_plans')
    .select('id, name_ar, name_en, name_fr, price_usd, duration_days')
    .eq('gym_id', gymId)
    .eq('is_active', true)
    .order('price_usd')

  const lname = (r: any) => ((locale === 'ar' ? r?.name_ar : locale === 'fr' ? r?.name_fr : r?.name_en) || r?.name_en || '')

  // NO-MEMBERSHIP: drop the wizard's optional Plan step when membership is off.
  const products = await getEnabledProducts(supabase, gymId)

  return (
    <AddStudentWizard
      gymId={gymId}
      plans={(plans ?? []).map((p: any) => ({
        id: p.id, name: lname(p), price: Number(p.price_usd), durationDays: p.duration_days,
      }))}
      locale={locale}
      membershipEnabled={products.membership}
    />
  )
}
