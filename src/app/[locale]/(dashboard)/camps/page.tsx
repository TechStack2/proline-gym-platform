import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/utils'
import { CampsBoard } from './camps-board'

type Props = { params: { locale: string } }

export const dynamic = 'force-dynamic'

/**
 * /camps (E1) — the camps workspace: list with live confirmed counts +
 * UX-1 wizard (create/edit) + ADM-1 publish toggle + archive-with-warning.
 * Replaces the AR-era camps-client (react-hook-form against a partial schema).
 */
export default async function CampsPage({ params: { locale } }: Props) {
  const supabase = await createClient()
  const t = await getTranslations('camps')
  const isRTL = locale === 'ar'

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
  const gymId = profile?.gym_id
  if (!gymId) return null

  const { data: camps } = await supabase
    .from('camps')
    .select('*')
    .eq('gym_id', gymId)
    .is('deleted_at', null)
    .order('start_date', { ascending: false })
    .limit(100)

  const ids = (camps ?? []).map((c: any) => c.id)
  const { data: regs } = ids.length
    ? await supabase.from('camp_registrations').select('camp_id, status').in('camp_id', ids)
    : { data: [] as any[] }
  const confirmedBy = new Map<string, number>()
  const pendingBy = new Map<string, number>()
  for (const r of (regs ?? []) as any[]) {
    if (r.status === 'confirmed') confirmedBy.set(r.camp_id, (confirmedBy.get(r.camp_id) ?? 0) + 1)
    if (r.status === 'pending') pendingBy.set(r.camp_id, (pendingBy.get(r.camp_id) ?? 0) + 1)
  }

  return (
    <div className={cn('space-y-6', isRTL && 'rtl text-right')}>
      <div>
        <h1 className={cn('hidden md:block text-2xl font-bold text-gray-900', isRTL && 'font-arabic')}>{t('title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('subtitle')}</p>
      </div>
      <CampsBoard
        camps={(camps ?? []) as any}
        confirmed={Object.fromEntries(confirmedBy)}
        pending={Object.fromEntries(pendingBy)}
        gymId={gymId}
        locale={locale}
      />
    </div>
  )
}
