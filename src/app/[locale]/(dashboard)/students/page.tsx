import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { StudentList } from './components/student-list'
import { StudentFilters } from './components/student-filters'
import { matchingProfileIds } from '@/lib/admin/profile-search'

export default async function StudentsPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string }
  searchParams: { search?: string; discipline?: string; belt?: string; status?: string }
}) {
  const supabase = await createClient()
  const t = await getTranslations('students')
  const isRTL = locale === 'ar'

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

  // Fetch students with profile data
  let query = supabase
    .from('students')
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
    .eq('gym_id', gymId)
    .order('created_at', { ascending: false })

  if (searchParams.search) {
    // Names/phone live on profiles — match there (gym-scoped), then filter
    // students by profile_id. (The legacy top-level .or() over embedded
    // profiles.* columns never matched anything.)
    const ids = await matchingProfileIds(supabase, gymId, searchParams.search)
    query = query.in('profile_id', ids)
  }
  if (searchParams.status) {
    query = query.eq('is_active', searchParams.status === 'active')
  }

  const { data: students, error } = await query

  // Fetch disciplines for filter
  const { data: disciplines } = await supabase
    .from('disciplines')
    .select(`id, name_${locale}`)
    .eq('gym_id', gymId)
    .order(`name_${locale}`)

  // Fetch belt ranks for filter
  const { data: beltRanks } = await supabase
    .from('belt_hierarchies')
    .select('id, name_ar, name_en, sort_order')
    .eq('gym_id', gymId)
    .order('sort_order')

  if (error) {
    console.error('Error fetching students:', error)
    return <div className="text-red-500">{t('error_loading')}</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className={cn("text-3xl font-bold", isRTL && "text-right")}>
          {t('title')}
        </h1>
        <Link href={`/${locale}/students/add`}>
          <Button>
            <Plus className="w-4 h-4 ml-2" />
            {t('add_student')}
          </Button>
        </Link>
      </div>

      <StudentFilters
        disciplines={(disciplines || []) as any}
        beltRanks={(beltRanks || []) as any}
        locale={locale}
        isRTL={isRTL}
      />

      <StudentList
        students={students || []}
        locale={locale}
        isRTL={isRTL}
      />
    </div>
  )
}
