import { dateLocale } from '@/lib/utils/locale-format'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { localizedName, one } from '@/lib/names'
import { STATUS_BADGE, statusLabel } from '@/lib/billing/reconcile'
import { Tent, Users, Phone, ClipboardList, FileText } from 'lucide-react'
import { CampAttendance } from './camp-attendance'

type Props = { params: { locale: string; id: string }; searchParams: { tab?: string; date?: string } }

export const dynamic = 'force-dynamic'

/**
 * Camp detail (E1): roster with payment-state badges (the deposit story —
 * pending/partial/paid straight off the linked invoice) + kid/guardian
 * tap-to-call + the per-day attendance tab over camp_attendance
 * (UNIQUE(camp_id, student_id, attendance_date) — verified real columns).
 */
export default async function CampDetailPage({ params: { locale, id }, searchParams }: Props) {
  const isRTL = locale === 'ar'
  const t = await getTranslations('camps')
  const supabase = await createClient()

  const { data: camp } = await supabase
    .from('camps').select('*').eq('id', id).is('deleted_at', null).maybeSingle()
  if (!camp) notFound()

  const { data: regs } = await supabase
    .from('camp_registrations')
    .select(`id, status, price_usd, registration_date, invoice_id,
      students:student_id (id, profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone, date_of_birth)),
      guardians:guardian_id (id, profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone))`)
    .eq('camp_id', id)
    .neq('status', 'cancelled')
    .order('registration_date')

  const invIds = (regs ?? []).map((r: any) => r.invoice_id).filter(Boolean)
  const { data: invoices } = invIds.length
    ? await supabase.from('invoices').select('id, invoice_number, status, total_usd').in('id', invIds)
    : { data: [] as any[] }
  const invBy = new Map((invoices ?? []).map((i: any) => [i.id, i]))

  const confirmed = (regs ?? []).filter((r: any) => r.status === 'confirmed')
  const lname = (c: any) => ((isRTL ? c?.name_ar : locale === 'fr' ? c?.name_fr : c?.name_en) || c?.name_en || '')
  const fmtD = (d: string) => new Date(d).toLocaleDateString(dateLocale(locale), { day: 'numeric', month: 'short' })
  const tab = searchParams.tab === 'attendance' ? 'attendance' : 'roster'

  // Attendance data for the selected day (default: today clamped into range).
  const today = new Date().toISOString().slice(0, 10)
  const day = searchParams.date
    ?? (today < camp.start_date ? camp.start_date : today > camp.end_date ? camp.end_date : today)
  const { data: marks } = await supabase
    .from('camp_attendance')
    .select('id, student_id, status')
    .eq('camp_id', id)
    .eq('attendance_date', day)
  const markBy = new Map((marks ?? []).map((m: any) => [m.student_id, m.status]))

  // Camp days (cap at 31 for rendering).
  const days: string[] = []
  for (let d = new Date(camp.start_date); days.length < 31 && d.toISOString().slice(0, 10) <= camp.end_date; d.setDate(d.getDate() + 1)) {
    days.push(d.toISOString().slice(0, 10))
  }

  return (
    <div className={cn('space-y-4 p-4 md:p-0', isRTL && 'rtl text-right')} data-testid="camp-detail">
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#cd1419]/10">
              <Tent className="h-5 w-5 text-[#cd1419]" />
            </span>
            <div>
              <h1 className={cn('text-xl font-bold text-gray-900', isRTL && 'font-arabic')} data-testid="camp-name">{lname(camp)}</h1>
              <p className="text-xs text-gray-500" dir="ltr">
                {fmtD(camp.start_date)} – {fmtD(camp.end_date)}
                {camp.min_age != null ? ` · ${t('ages', { min: camp.min_age, max: camp.max_age ?? '—' })}` : ''}
                {` · $${Number(camp.price_usd).toFixed(0)}`}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm font-bold text-gray-800" data-testid="camp-capacity-chip">
            <Users className="h-4 w-4" /> {confirmed.length}/{camp.max_capacity}
          </span>
        </div>
        <div className="mt-3 inline-flex rounded-xl border bg-gray-50 p-1">
          <Link href={`/${locale}/camps/${id}`} data-testid="camp-tab-roster"
            className={cn('rounded-lg px-4 py-1.5 text-sm font-medium', tab === 'roster' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500')}>
            {t('roster')}
          </Link>
          <Link href={`/${locale}/camps/${id}?tab=attendance`} data-testid="camp-tab-attendance"
            className={cn('rounded-lg px-4 py-1.5 text-sm font-medium', tab === 'attendance' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500')}>
            <ClipboardList className="mr-1 inline h-3.5 w-3.5" />{t('attendance')}
          </Link>
        </div>
      </div>

      {tab === 'roster' ? (
        <section className="rounded-2xl border bg-white p-4 shadow-sm" data-testid="camp-roster">
          {(regs ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">{t('noRegs')}</p>
          ) : (
            <ul className="divide-y">
              {(regs ?? []).map((r: any) => {
                const kid = one(r.students)
                const kidProf = one(kid?.profiles)
                const guardProf = one(one(r.guardians)?.profiles)
                const inv: any = r.invoice_id ? invBy.get(r.invoice_id) : null
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                    data-testid="camp-reg-row" data-status={r.status}>
                    <div className="min-w-0">
                      <Link href={`/${locale}/students/${kid?.id}`} className="text-sm font-semibold text-gray-900 hover:underline">
                        {localizedName(kidProf, locale)}
                      </Link>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                        {r.price_usd != null && <span data-testid="camp-reg-price">${Number(r.price_usd).toFixed(0)}</span>}
                        {guardProf && (
                          <span className="inline-flex items-center gap-1">
                            · {localizedName(guardProf, locale)}
                            {guardProf.phone && (
                              <a href={`tel:${guardProf.phone}`} data-testid="camp-guardian-call" dir="ltr"
                                className="inline-flex items-center gap-0.5 text-primary-600 hover:underline">
                                <Phone className="h-3 w-3" />{guardProf.phone}
                              </a>
                            )}
                          </span>
                        )}
                        {!guardProf && kidProf?.phone && (
                          <a href={`tel:${kidProf.phone}`} data-testid="camp-kid-call" dir="ltr"
                            className="inline-flex items-center gap-0.5 text-primary-600 hover:underline">
                            <Phone className="h-3 w-3" />{kidProf.phone}
                          </a>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.status === 'pending' ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">{t('regPending')}</span>
                      ) : inv ? (
                        <Link href={`/${locale}/invoices/${inv.id}`} data-testid="camp-pay-badge" data-paystate={inv.status}
                          className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium hover:underline', STATUS_BADGE[inv.status])}>
                          <FileText className="h-3 w-3" /> {statusLabel(inv.status, locale)}
                        </Link>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">—</span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ) : (
        <CampAttendance
          campId={id}
          day={day}
          days={days}
          kids={confirmed.map((r: any) => ({
            studentId: one(r.students)?.id as string,
            name: localizedName(one(one(r.students)?.profiles), locale),
            status: (markBy.get(one(r.students)?.id) as string) ?? null,
          }))}
          locale={locale}
        />
      )}
    </div>
  )
}
