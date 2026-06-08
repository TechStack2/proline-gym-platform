import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CoachList } from './components/coach-list'
import { CoachFilters } from './components/coach-filters'

export default async function CoachesPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string }
  searchParams: { search?: string; status?: string }
}) {
  const supabase = await createClient()
  const t = await getTranslations('coaches')
  const isRTL = locale === 'ar'

  let query = supabase
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
    .order('created_at', { ascending: false })

  if (searchParams.search) {
    const searchTerm = `%${searchParams.search}%`
    query = query.or(
      `profiles.first_name_ar.ilike.${searchTerm},profiles.first_name_en.ilike.${searchTerm},profiles.phone.ilike.${searchTerm}`
    )
  }
  if (searchParams.status) {
    query = query.eq('is_active', searchParams.status === 'active')
  }

  const { data: coaches, error } = await query

  if (error) {
    console.error('Error fetching coaches:', error)
    return <div className="text-red-500">{t('error_loading')}</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className={cn("text-3xl font-bold", isRTL && "text-right")}>
          {t('title')}
        </h1>
        <Link href={`/${locale}/coaches/add`}>
          <Button>
            <Plus className="w-4 h-4 ml-2" />
            {t('add_coach')}
          </Button>
        </Link>
      </div>

      <CoachFilters locale={locale} isRTL={isRTL} />

      <CoachList
        coaches={coaches || []}
        locale={locale}
        isRTL={isRTL}
      />
    </div>
  )
}
