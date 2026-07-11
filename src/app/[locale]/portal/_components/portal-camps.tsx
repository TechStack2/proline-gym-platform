import { dateLocale } from '@/lib/utils/locale-format'
import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/utils'
import { Tent, Clock } from 'lucide-react'
import { CampRequestButton } from './camp-request-button'

/**
 * Portal camps (E1): PUBLISHED camps as cards (dates · ages · price · spots
 * left · Full badge) + request-for-this-member (the B3 "Acting for" pattern
 * when a guardian views a kid). No self-cancel — staff-mediated.
 * Server component: used on the member home AND the kid dashboard.
 */
export async function PortalCampsSection({ studentId, actingFor, locale }: {
  studentId: string
  /** Kid name when a guardian is acting for them (B3 banner), else null. */
  actingFor: string | null
  locale: string
}) {
  const isRTL = locale === 'ar'
  const t = await getTranslations('campsPortal')
  const supabase = await createClient()

  const { data: student } = await supabase
    .from('students').select('id, gym_id').eq('id', studentId).maybeSingle()
  if (!student) return null

  const today = new Date().toISOString().slice(0, 10)
  const { data: camps } = await supabase
    .from('camps')
    .select('id, name_ar, name_en, name_fr, start_date, end_date, min_age, max_age, price_usd, status')
    .eq('gym_id', student.gym_id)
    .eq('show_on_landing', true)
    .is('deleted_at', null)
    .in('status', ['open', 'full', 'in_progress'])
    .gte('end_date', today)
    .order('start_date')
  if (!camps || camps.length === 0) return null

  const { data: myRegs } = await supabase
    .from('camp_registrations')
    .select('camp_id, status')
    .eq('student_id', studentId)
    .neq('status', 'cancelled')
  const regBy = new Map((myRegs ?? []).map((r: any) => [r.camp_id, r.status]))

  const spots = new Map<string, number>()
  for (const c of camps as any[]) {
    const { data } = await supabase.rpc('get_camp_spots_left', { p_camp_id: c.id })
    spots.set(c.id, (data as number | null) ?? 0)
  }

  const lname = (c: any) => ((isRTL ? c.name_ar : locale === 'fr' ? c.name_fr : c.name_en) || c.name_en)
  const fmtD = (d: string) => new Date(d).toLocaleDateString(dateLocale(locale), { day: 'numeric', month: 'short' })

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm" data-testid="portal-camps">
      <h2 className={cn('mb-3 flex items-center gap-2 text-sm font-bold text-gray-900', isRTL && 'font-arabic')}>
        <Tent className="h-4 w-4 text-primary-700" /> {t('title')}
      </h2>
      <div className="space-y-2">
        {(camps as any[]).map((c) => {
          const full = c.status === 'full' || (spots.get(c.id) ?? 0) <= 0
          const myStatus = regBy.get(c.id) as string | undefined
          return (
            <div key={c.id} data-testid="portal-camp-card" data-name-en={c.name_en} data-full={full}
              className="rounded-xl border border-gray-100 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={cn('truncate text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{lname(c)}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1" dir="ltr"><Clock className="h-3 w-3" />{fmtD(c.start_date)} – {fmtD(c.end_date)}</span>
                    {c.min_age != null && <span>{t('ages', { min: c.min_age, max: c.max_age ?? '—' })}</span>}
                    <span className="font-semibold text-gray-700">${Number(c.price_usd).toFixed(0)}</span>
                  </p>
                </div>
                {full ? (
                  <span data-testid="portal-camp-full" className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{t('full')}</span>
                ) : (
                  <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">{t('spotsLeft', { count: spots.get(c.id) ?? 0 })}</span>
                )}
              </div>
              <div className="mt-2">
                {myStatus ? (
                  <span data-testid="portal-camp-status" data-status={myStatus}
                    className={cn('rounded-full px-2 py-0.5 text-xs font-medium',
                      myStatus === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>
                    {t(`status.${myStatus}` as any)}
                  </span>
                ) : !full ? (
                  <CampRequestButton campId={c.id} studentId={studentId} actingFor={actingFor} locale={locale} />
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
