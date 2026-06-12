import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { getRenewalsDue } from '@/lib/pt/refill'
import { RefreshCw } from 'lucide-react'
import { localizedName, one } from '@/lib/names'
import { InboxQueues, type RegRequestRow, type PtRequestRow, type PromotionRow } from './inbox-queues'

export const dynamic = 'force-dynamic'

type Props = { params: { locale: string } }

/**
 * /inbox — the unified actionable queue (IA-1). Work used to arrive invisibly
 * (registration requests buried under each class, PT requests under /pt,
 * waitlist promotions firing silently); staff had to poll tabs. This composes
 * the EXISTING queues + EXISTING actions in one place — no new business logic:
 *  - class-registration requests → B2 approve(+discount)/reject actions
 *  - PT requests → 22R approve(→invoice)/reject actions
 *  - recent waitlist auto-promotions (informational; from the existing audit
 *    trail, so staff see what the system did)
 * Trial bookings have NO pending-approval state in the lead journey (trials are
 * created already-scheduled), so per the prompt that section is omitted rather
 * than inventing a workflow.
 */
export default async function InboxPage({ params: { locale } }: Props) {
  const isRTL = locale === 'ar'
  const t = await getTranslations('inbox')
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const clsName = (c: any) => ((isRTL ? c?.name_ar : locale === 'fr' ? c?.name_fr : c?.name_en) || c?.name_en || '')

  // ── Queue 1: pending class registrations (B2) ──
  const { data: regsRaw } = await supabase
    .from('class_registrations')
    .select(`id, class_id, requested_at, monthly_fee_usd,
      classes:class_id (name_ar, name_en, name_fr),
      students:student_id (profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr))`)
    .eq('status', 'requested')
    .order('requested_at', { ascending: true })

  const regRequests: RegRequestRow[] = (regsRaw ?? []).map((r: any) => ({
    id: r.id,
    classId: r.class_id,
    className: clsName(one(r.classes)),
    studentName: localizedName(one(r.students)?.profiles, locale),
    feeUsd: r.monthly_fee_usd != null ? Number(r.monthly_fee_usd) : null,
    requestedAt: r.requested_at,
  }))

  // ── Queue 2: pending PT requests (22R) ──
  const { data: ptRaw } = await supabase
    .from('pt_assignments')
    .select(`id, requested_at, sessions_total,
      pt_packages:package_id (name_ar, name_en, name_fr, price_usd),
      students:student_id (profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr))`)
    .eq('status', 'requested')
    .order('requested_at', { ascending: true })

  const ptRequests: PtRequestRow[] = (ptRaw ?? []).map((r: any) => ({
    id: r.id,
    packageName: clsName(one(r.pt_packages)),
    priceUsd: one(r.pt_packages)?.price_usd != null ? Number(one(r.pt_packages)!.price_usd) : null,
    sessions: r.sessions_total,
    studentName: localizedName(one(r.students)?.profiles, locale),
    requestedAt: r.requested_at,
  }))

  // ── Feed: recent waitlist auto-promotions (informational, last 7 days) ──
  // Source = the existing audit trail written by the B2 promote path. RLS limits
  // audit reads to owner/head_coach — receptionists simply see an empty feed.
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString()
  const { data: promoLogs } = await supabase
    .from('audit_logs')
    .select('record_id, created_at, new_data')
    .eq('table_name', 'class_registrations')
    .eq('new_data->>action', 'waitlist_promoted')
    .gte('created_at', weekAgo)
    .order('created_at', { ascending: false })
    .limit(10)

  let promotions: PromotionRow[] = []
  const promoIds = [...new Set((promoLogs ?? []).map((l: any) => l.record_id).filter(Boolean))]
  if (promoIds.length) {
    const { data: promoRegs } = await supabase
      .from('class_registrations')
      .select(`id, classes:class_id (name_ar, name_en, name_fr),
        students:student_id (profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr))`)
      .in('id', promoIds)
    const byId = new Map((promoRegs ?? []).map((r: any) => [r.id, r]))
    promotions = (promoLogs ?? [])
      .map((l: any) => {
        const reg = byId.get(l.record_id)
        if (!reg) return null
        return {
          id: `${l.record_id}-${l.created_at}`,
          className: clsName(one(reg.classes)),
          studentName: localizedName(one(reg.students)?.profiles, locale),
          at: l.created_at,
        }
      })
      .filter(Boolean) as PromotionRow[]
  }

  // ── E1: pending camp requests (approve → register_camp / decline) ──
  const { data: campReqRaw } = await supabase
    .from('camp_registrations')
    .select(`id, camp_id, student_id, registration_date,
      camps:camp_id (name_ar, name_en, name_fr),
      students:student_id (profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr))`)
    .eq('status', 'pending')
    .order('registration_date')
  const campRequests = ((campReqRaw ?? []) as any[]).map((r) => ({
    id: r.id,
    campId: r.camp_id,
    studentId: r.student_id,
    campName: clsName(one(r.camps)),
    studentName: localizedName(one(r.students)?.profiles, locale),
    requestedAt: r.registration_date,
  }))

  // ── PT-1: renewals due (read-time thresholds — see lib/pt/refill) ──
  const { data: me } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
  const renewals = me?.gym_id ? await getRenewalsDue(supabase, me.gym_id, locale) : []

  const actionable = regRequests.length + ptRequests.length

  return (
    <div className={cn('space-y-6 p-4 md:p-0', isRTL && 'rtl text-right')}>
      <div>
        <h1 className={cn('text-2xl font-bold text-gray-900', isRTL && 'font-arabic')}>{t('title')}</h1>
        <p className="mt-0.5 text-sm text-gray-500" data-testid="inbox-actionable-count">
          {actionable > 0 ? t('pendingCount', { count: actionable }) : t('inboxZero')}
        </p>
      </div>

      <InboxQueues
        locale={locale}
        regRequests={regRequests}
        ptRequests={ptRequests}
        campRequests={campRequests}
        promotions={promotions}
      />

      {/* ── PT renewals due (PT-1): one-tap re-sell opens the Member-360 sell
          modal pre-filled with the same type (?sellpt=). Read-time, no cron. ── */}
      <section data-testid="inbox-renewals">
        <h2 className={cn('mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
          <RefreshCw className="h-4 w-4 text-primary-600" /> {t('renewalsTitle')}
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', renewals.length > 0 ? 'bg-[#cd1419] text-white' : 'bg-gray-100 text-gray-500')}>
            {renewals.length}
          </span>
        </h2>
        {renewals.length === 0 ? (
          <p className="rounded-2xl border bg-white p-4 text-center text-sm text-gray-400 shadow-sm">{t('renewalsZero')}</p>
        ) : (
          <div className="space-y-2">
            {renewals.map((r) => (
              <div key={r.assignmentId} data-testid="inbox-renewal-row"
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-4 shadow-sm">
                <div className="min-w-0">
                  <Link href={`/${locale}/students/${r.studentId}`} className="text-sm font-semibold text-gray-900 hover:underline">
                    {r.studentName}
                  </Link>
                  <p className="text-xs text-gray-500">
                    {r.packageName} · {r.remaining}/{r.total}
                    {r.daysLeft !== null ? ` · ${t('renewalDays', { days: r.daysLeft })}` : ''}
                  </p>
                </div>
                <Link href={`/${locale}/students/${r.studentId}?sellpt=${r.packageId}`} data-testid="inbox-renewal-resell"
                  className="inline-flex items-center gap-1 rounded-lg bg-[#cd1419] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#a81014]">
                  <RefreshCw className="h-3.5 w-3.5" /> {t('resell')}
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
