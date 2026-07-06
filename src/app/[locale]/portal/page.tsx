import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { dateLocale } from '@/lib/utils/locale-format'
import { PortalCampsSection } from './_components/portal-camps'
import { cn } from '@/lib/utils'
import { Users, CreditCard, Award, TrendingUp, CalendarDays, ArrowRight, ClipboardList, Dumbbell, Wallet } from 'lucide-react'
import Link from 'next/link'
import { Avatar as KidAvatar } from '@/components/shared/avatar'
import { PortalCard, PortalCardTitle } from '@/components/portal/portal-kit'
import { ActionCard } from '@/components/dashboard/action-card'
import { DrillDetails, type DrillRow } from '@/components/dashboard/drill-details'
import { getWaiverContext } from '@/lib/waivers/server'
import { waiverTitle, waiverBody } from '@/lib/waivers/status'
import { WaiverSign, WaiverChip } from '@/components/shared/waiver-sign'
import { getEnabledProducts } from '@/lib/gym/products'
import { outstandingUsd, paidByInvoice, balanceUsd, OPEN_INVOICE_STATUSES } from '@/lib/billing/reconcile'

type Props = { params: { locale: string }; searchParams?: { kid?: string } }

export default async function PortalHomePage({ params: { locale }, searchParams }: Props) {
  // AX-1: copy through next-intl (the isRTL?ar:en bypasses dropped fr and
  // hid this page from the locale audit); dates via the dateLocale convention.
  const t = await getTranslations({ locale, namespace: 'portalHome' })
  const isRTL = locale === 'ar'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name_en, first_name_ar, first_name_fr, last_name_en, last_name_ar, last_name_fr')
    .eq('id', user.id)
    .single()

  const firstName = isRTL ? profile?.first_name_ar : (locale === 'fr' ? profile?.first_name_fr : profile?.first_name_en)

  const { data: student } = await supabase
    .from('students')
    .select('id, profile_id, join_date, gym_id')
    .eq('profile_id', user.id)
    .maybeSingle()

  // ── B3: guardian detection + kid-switcher ──────────────────────────────────
  const { data: guardianRow } = await supabase
    .from('guardians')
    .select('id')
    .eq('profile_id', user.id)
    .maybeSingle()
  let kids: { id: string; name: string }[] = []
  if (guardianRow) {
    const { data: kidLinks } = await supabase
      .from('guardian_students')
      .select('students:student_id (id, profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, avatar_url))')
      .eq('guardian_id', guardianRow.id)
    const { localizedName: ln, one: o } = await import('@/lib/names')
    kids = (kidLinks ?? [])
      .map((l: any) => {
        const st = o(l.students)
        return st ? { id: st.id as string, name: ln(o(st.profiles), locale), avatarUrl: o(st.profiles)?.avatar_url ?? null } : null
      })
      .filter(Boolean) as { id: string; name: string; avatarUrl?: string | null }[]
  }
  const selectedKid = kids.find((k) => k.id === searchParams?.kid) ?? null

  // Guardian with no own membership and no kid selected → default to the first kid.
  if (!selectedKid && !student && kids.length > 0) {
    const { redirect } = await import('next/navigation')
    redirect(`/${locale}/portal?kid=${kids[0].id}`)
  }

  if (selectedKid) {
    const KidDashboard = (await import('./_components/KidDashboard')).KidDashboard
    return (
      <KidDashboard
        locale={locale}
        kid={selectedKid}
        kids={kids}
        hasOwn={!!student}
      />
    )
  }

  const { data: membership } = await supabase
    .from('student_memberships')
    .select('status, end_date, plan_id, membership_plans:plan_id (name_en, name_ar, name_fr)')
    .eq('student_id', student?.id)
    .eq('status', 'active')
    .maybeSingle()

  // ML-1: the lifecycle banner reflects the most URGENT membership row.
  const { data: lcRows } = await supabase
    .from('student_memberships')
    .select('status, end_date, pause_end_date')
    .eq('student_id', student?.id)
    .order('end_date', { ascending: false })
    .limit(5)
  const { data: lcGym } = await supabase
    .from('gyms').select('renewal_lead_days, dunning_grace_days').limit(1).single()
  const { membershipState } = await import('@/lib/lifecycle/status')
  const lcStates = ((lcRows ?? []) as any[]).map((m) => membershipState(m, lcGym ?? {}))
  const msState = (['lapsed', 'overdue', 'expiring', 'frozen'] as const).find((sv) => lcStates.includes(sv)) ?? 'active'

  const { data: belt } = await supabase
    .from('belt_promotions')
    .select('to_rank, discipline_id, disciplines:discipline_id (name_en, name_ar, name_fr)')
    .eq('student_id', student?.id)
    .order('promotion_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { count: enrolledCount } = await supabase
    .from('class_enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', student?.id)
    .eq('is_active', true)

  const { data: recentAttendance } = await supabase
    .from('attendance_records')
    .select('attendance_date, status, classes:class_id (name_en, name_ar, name_fr)')
    .eq('student_id', student?.id)
    .order('attendance_date', { ascending: false })
    .limit(5)

  // PORTAL-BALANCE: the home tile computes through the SAME shared helper as
  // portal/billing (one source of truth). The old inline version omitted
  // 'partial' invoices AND summed raw totals without netting payments — a
  // part-paid member saw "$0 / settled" here but a real balance on billing.
  const { data: pendingInvoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, total_usd, status, created_at')
    .eq('student_id', student?.id)
    .in('status', [...OPEN_INVOICE_STATUSES])
    .order('created_at', { ascending: false })

  const openInvoices = (pendingInvoices ?? []) as any[]
  const { data: invoicePayments } = openInvoices.length
    ? await supabase
        .from('payments')
        .select('invoice_id, amount_usd')
        .in('invoice_id', openInvoices.map((i) => i.id))
    : { data: [] as any[] }
  const balanceDue = outstandingUsd(openInvoices, invoicePayments)
  const paidHome = paidByInvoice(invoicePayments)
  const invNetBalance = (inv: any) => balanceUsd(inv.total_usd, [{ amount_usd: paidHome.get(inv.id) ?? 0 }])

  // ── IA-2 self-view: PT remaining + next class / next PT (own rows via RLS) ──
  const { data: ptActive } = await supabase
    .from('pt_assignments')
    .select('sessions_remaining, sessions_total, status, is_active')
    .eq('student_id', student?.id)
    .eq('status', 'active')
    .eq('is_active', true)
  const ptRemaining = (ptActive ?? []).reduce((s, a: any) => s + (a.sessions_remaining ?? 0), 0)
  const ptTotal = (ptActive ?? []).reduce((s, a: any) => s + (a.sessions_total ?? 0), 0)

  const { data: nextPt } = await supabase
    .from('pt_sessions')
    .select('scheduled_at, status')
    .eq('student_id', student?.id)
    .eq('status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data: myEnrollments } = await supabase
    .from('class_enrollments')
    .select('classes:class_id (name_ar, name_en, name_fr, is_active, class_schedules (day_of_week, start_time, is_active))')
    .eq('student_id', student?.id)
    .eq('is_active', true)

  // Next class occurrence: smallest (dayDiff, start_time) across active schedules.
  const todayDow = new Date().getDay()
  let nextClass: { name: string; dayDiff: number; start: string } | null = null
  for (const e of (myEnrollments ?? []) as any[]) {
    const cls = Array.isArray(e.classes) ? e.classes[0] : e.classes
    if (!cls || cls.is_active === false) continue
    const cname = isRTL ? cls.name_ar || cls.name_en : (locale === 'fr' ? cls.name_fr || cls.name_en : cls.name_en)
    for (const sch of cls.class_schedules ?? []) {
      if (sch.is_active === false) continue
      const diff = (sch.day_of_week - todayDow + 7) % 7
      if (!nextClass || diff < nextClass.dayDiff || (diff === nextClass.dayDiff && sch.start_time < nextClass.start)) {
        nextClass = { name: cname, dayDiff: diff, start: sch.start_time }
      }
    }
  }
  const weekday = (diff: number) =>
    new Date(Date.now() + diff * 864e5).toLocaleDateString(dateLocale(locale), { weekday: 'long' })
  const nextClassLabel = nextClass
    ? `${nextClass.dayDiff === 0 ? t('today') : weekday(nextClass.dayDiff)} ${nextClass.start.slice(0, 5)} · ${nextClass.name}`
    : null
  const mplans: any = (membership as any)?.membership_plans
  const mplan = Array.isArray(mplans) ? mplans[0] : mplans
  const membershipNameVal = mplan ? (isRTL ? mplan.name_ar : (locale === 'fr' ? mplan.name_fr : mplan.name_en)) : null
  const beltLabelVal = belt?.to_rank ? (belt.to_rank as string).replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : null
  const disc: any = (belt as any)?.disciplines
  const discObj = Array.isArray(disc) ? disc[0] : disc
  const disciplineNameVal = discObj ? (isRTL ? discObj.name_ar : (locale === 'fr' ? discObj.name_fr : discObj.name_en)) : ''

  // F3: the member's own waiver status + sign CTA (read in-gym under RLS).
  const tw = await getTranslations({ locale, namespace: 'waiver' })
  const waiver = student?.gym_id ? await getWaiverContext(supabase, student.id, student.gym_id) : null

  const getCName = (cls: any) => {
    const cdata: any = Array.isArray(cls?.classes) ? cls.classes[0] : cls?.classes
    if (!cdata) return 'Unknown'
    return isRTL ? cdata.name_ar || cdata.name_en : (locale === 'fr' ? cdata.name_fr || cdata.name_en : cdata.name_en)
  }

  const statusLabels: Record<string,string> = {
    present: t('att.present'), absent: t('att.absent'),
    late: t('att.late'), excused: t('att.excused'),
  }
  const statusColors: Record<string,string> = {
    present: 'bg-green-100 text-green-700', absent: 'bg-red-100 text-red-700',
    late: 'bg-yellow-100 text-yellow-700', excused: 'bg-blue-100 text-blue-700'
  }

  // NO-MEMBERSHIP: hide the member's membership surfaces (banner, scan tile, card)
  // on gyms that don't sell membership.
  const enabledProducts = await getEnabledProducts(supabase, student?.gym_id)

  return (
    <div className={cn('p-4 space-y-6', isRTL && 'rtl')}>
    {/* ML-1: lifecycle banner — renew at the desk (no self-service) */}
    {enabledProducts.membership && ['expiring', 'overdue', 'lapsed', 'frozen'].includes(msState) && (
      <div data-testid="portal-lifecycle-banner" data-state={msState}
        className={cn('rounded-2xl p-3 text-sm font-medium',
          msState === 'frozen' ? 'bg-blue-50 text-blue-700' : msState === 'expiring' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700')}>
        {msState === 'frozen' ? t('banner.frozen') : msState === 'expiring' ? t('banner.expiring') : t('banner.lapsed')}
      </div>
    )}
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-gray-900">
          {t('welcome')}{firstName ? `, ${firstName}` : ''} 👋
        </h1>
        <p className="text-sm text-gray-500 mt-1">{t('summary')}</p>
      </div>

      {kids.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="kid-switcher">
          <span data-testid="kid-chip-me"
            className="rounded-full bg-[#cd1419] px-4 py-1.5 text-sm font-semibold text-primary-foreground">
            {t('me')}
          </span>
          {kids.map((k: any) => (
            <Link key={k.id} href={`/${locale}/portal?kid=${k.id}`} data-testid="kid-chip" data-kid-id={k.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-gray-300">
              <KidAvatar url={k.avatarUrl} name={k.name} />
              {k.name}
            </Link>
          ))}
        </div>
      )}
      {/* Scan bar — quick glance (mirrors Coach-360) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: t('classes'), value: enrolledCount || 0, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          // NO-MEMBERSHIP: the membership tile only shows when the gym sells it.
          ...(enabledProducts.membership ? [{ label: t('membership'), value: membership?.status === 'active' ? t('active') : t('expired'), icon: CreditCard, color: membership?.status === 'active' ? 'text-green-600' : 'text-red-600', bg: membership?.status === 'active' ? 'bg-green-50' : 'bg-red-50' }] : []),
          { label: t('belt'), value: beltLabelVal || '—', icon: Award, color: 'text-violet-600', bg: 'bg-violet-50' },
          { label: t('balance'), value: balanceDue > 0 ? `$${balanceDue.toFixed(2)}` : t('none'), icon: TrendingUp, color: balanceDue > 0 ? 'text-red-600' : 'text-emerald-600', bg: balanceDue > 0 ? 'bg-red-50' : 'bg-emerald-50' },
        ].map((s, i) => {
          const Icon = s.icon
          return (
            <PortalCard key={i} className="text-center">
              <div className={cn('mx-auto mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full', s.bg)}>
                <Icon className={cn('h-5 w-5', s.color)} />
              </div>
              <p className="truncate text-lg font-bold text-gray-900">{s.value}</p>
              <p className="mt-0.5 truncate text-xs text-gray-500">{s.label}</p>
            </PortalCard>
          )
        })}
      </div>

      {/* MEMBER-360 — the member's own drillable world. The `self-view` wrapper
          keeps the IA-2 testids (self-membership/self-pt-remaining/self-next-class)
          as descendants, and the myStatus heading keeps the AX-1 /ar known string. */}
      <section data-testid="self-view" className="space-y-4">
        <h2 className={cn('flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
          <TrendingUp className="h-4 w-4 text-[#cd1419]" />{t('myStatus')}
        </h2>

        {/* 1 · Membership → drills to billing (renewal) — NO-MEMBERSHIP: hidden off */}
        {enabledProducts.membership && (
        <PortalCard data-testid="card-membership">
          <PortalCardTitle icon={CreditCard}
            right={<Link href={`/${locale}/portal/billing`} data-testid="membership-open" className="text-xs font-medium text-[#cd1419]">{t('view')}</Link>}>
            {t('membership')}
          </PortalCardTitle>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800">{membership?.status === 'active' ? (membershipNameVal || t('active')) : t('noMembership')}</p>
              {membership && <p className="text-xs text-gray-500">{t('expires')}: {new Date(membership.end_date).toLocaleDateString(dateLocale(locale))}</p>}
            </div>
            <span data-testid="self-membership" className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold', membership?.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
              {membership?.status === 'active' ? t('active') : t('noMembership')}
            </span>
          </div>
        </PortalCard>
        )}

        {/* 2 · Billing → open-invoice rows reconcile to the balance → billing */}
        <ActionCard
          icon={Wallet} title={t('billing')} count={openInvoices.length}
          badge={balanceDue > 0 ? `$${balanceDue.toFixed(2)}` : t('allSettled')}
          emptyText={t('allSettled')} testid="billing" isRTL={isRTL}
          footer={<Link href={`/${locale}/portal/billing`} data-testid="billing-open" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#cd1419]">{t('billing')}<ArrowRight className={cn('h-3.5 w-3.5', isRTL && 'rotate-180')} /></Link>}
        >
          <DrillDetails
            testid="billing-drill" rowTestid="billing-row" isRTL={isRTL}
            summary={<span className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-gray-700">{t('outstanding')}</span>
              <span data-testid="billing-balance" className="font-bold text-gray-900">${balanceDue.toFixed(2)}</span>
            </span>}
            rows={openInvoices.map((inv): DrillRow => ({
              href: `/${locale}/portal/billing`,
              left: inv.invoice_number || t('invoice'),
              // PORTAL-BALANCE: each row shows its NET remaining balance (a
              // part-paid invoice's row must reconcile to the summary above).
              right: <span className="font-medium">${invNetBalance(inv).toFixed(2)}</span>,
              value: invNetBalance(inv),
            }))}
          />
        </ActionCard>

        {/* 3 · PT → sessions remaining + next session → pt */}
        <PortalCard data-testid="card-pt">
          <PortalCardTitle icon={Dumbbell}
            right={<Link href={`/${locale}/portal/pt`} data-testid="pt-open" className="text-xs font-medium text-[#cd1419]">{t('view')}</Link>}>
            PT
          </PortalCardTitle>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">{t('ptRemaining')}</span>
            <span data-testid="self-pt-remaining" className="font-bold text-gray-900">{ptTotal > 0 ? `${ptRemaining}/${ptTotal}` : '—'}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="text-gray-500">{t('nextPt')}</span>
            <span data-testid="self-next-pt" className="text-xs font-medium text-gray-700" dir="ltr">{nextPt ? new Date(nextPt.scheduled_at).toLocaleString(dateLocale(locale), { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
          </div>
        </PortalCard>

        {/* 4 · Belt progress → progress */}
        <PortalCard data-testid="card-belt">
          <PortalCardTitle icon={Award}
            right={<Link href={`/${locale}/portal/progress`} data-testid="belt-open" className="text-xs font-medium text-[#cd1419]">{t('view')}</Link>}>
            {t('belt')}
          </PortalCardTitle>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-900"><Award className="h-5 w-5 text-yellow-400" /></div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-700">{beltLabelVal ? `${beltLabelVal}${disciplineNameVal ? ` — ${disciplineNameVal}` : ''}` : t('none')}</p>
              <p className="text-xs text-gray-500">{t('gymName')}</p>
            </div>
          </div>
        </PortalCard>

        {/* 5 · Classes + attendance → classes/schedule (keeps the PORTAL-FND
            recent-attendance ActionCard + DrillDetails; rows reconcile to count) */}
        {(() => {
          const att = (recentAttendance ?? []) as any[]
          const attendanceRows: DrillRow[] = att.map((ra) => ({
            href: `/${locale}/portal/schedule`,
            left: getCName(ra),
            right: (
              <span className={cn('inline-flex rounded-full px-2 py-0.5 text-2xs font-medium', statusColors[ra.status] || 'bg-gray-100 text-gray-700')}>
                {statusLabels[ra.status] || ra.status}
              </span>
            ),
          }))
          return (
            <ActionCard
              icon={CalendarDays}
              title={t('recentAttendance')}
              count={attendanceRows.length}
              emptyText={t('noAttendance')}
              testid="portal-recent-attendance"
              isRTL={isRTL}
              footer={
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs" data-testid="classes-footer">
                  <span className="text-gray-500">{t('enrolledClasses')}: <span className="font-medium text-gray-700">{enrolledCount || 0}</span> · {t('nextClass')}: <span data-testid="self-next-class" className="font-medium text-gray-700" dir="ltr">{nextClassLabel || '—'}</span></span>
                  <Link href={`/${locale}/portal/classes`} data-testid="classes-open" className="inline-flex items-center gap-1 font-medium text-[#cd1419]">{t('classes')}<ArrowRight className={cn('h-3.5 w-3.5', isRTL && 'rotate-180')} /></Link>
                </div>
              }
            >
              <DrillDetails
                testid="portal-attendance-drill"
                rowTestid="portal-attendance-row"
                isRTL={isRTL}
                summary={
                  <span className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-gray-700">{getCName(att[0])}</span>
                    <span className="text-xs text-gray-500">
                      {att[0] ? new Date(att[0].attendance_date).toLocaleDateString(dateLocale(locale)) : ''}
                    </span>
                  </span>
                }
                rows={attendanceRows}
              />
            </ActionCard>
          )
        })()}
      </section>

      {/* F3: waiver status + sign CTA when unsigned/outdated (preserved) */}
      {waiver && waiver.state !== 'none' && (
        <PortalCard data-testid="portal-waiver" data-state={waiver.state}>
          <PortalCardTitle
            icon={ClipboardList}
            right={<WaiverChip state={waiver.state} version={waiver.signedVersion} testid="portal-waiver-chip" />}
          >
            {tw('myWaiver')}
          </PortalCardTitle>
          {waiver.template && (waiver.state === 'unsigned' || waiver.state === 'outdated') && student && (
            <div className="mt-3">
              <WaiverSign
                studentId={student.id}
                title={waiverTitle(waiver.template, locale)}
                body={waiverBody(waiver.template, locale)}
                locale={locale}
                outdated={waiver.state === 'outdated'}
                label={waiver.state === 'outdated' ? tw('resign') : tw('signNow')}
                testidPrefix="portal-waiver"
              />
            </div>
          )}
        </PortalCard>
      )}

      {/* E1: published camps — member-self request */}
      {student && <PortalCampsSection studentId={student.id} actingFor={null} locale={locale} />}
    </div>
  )
}
