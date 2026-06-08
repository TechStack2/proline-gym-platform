import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DisciplineList } from './components/discipline-list'

export default async function DisciplinesPage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const supabase = await createClient()
  const t = await getTranslations('disciplines')
  const isRTL = locale === 'ar'

  const { data: disciplines, error } = await supabase
    .from('disciplines')
    .select(`
      *,
      belt_hierarchies (
        id,
        name_ar,
        name_en,
        sort_order
      )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching disciplines:', error)
    return <div className="text-red-500">{t('error_loading')}</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className={cn("text-3xl font-bold", isRTL && "text-right")}>
          {t('title')}
        </h1>
        <Link href={`/${locale}/disciplines/add`}>
          <Button>
            <Plus className="w-4 h-4 ml-2" />
            {t('add_discipline')}
          </Button>
        </Link>
      </div>

      <DisciplineList
        disciplines={disciplines || []}
        locale={locale}
        isRTL={isRTL}
      />
    </div>
  )
}
