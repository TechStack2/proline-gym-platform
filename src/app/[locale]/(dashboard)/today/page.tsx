import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { localizedName, one } from '@/lib/names'
import { getDailyTally } from '@/lib/billing/daily-tally'
import { METHOD_LABEL, balanceUsd } from '@/lib/billing/reconcile'
import { ActionCard, ActionRow } from '@/components/dashboard/action-card'
import { getRenewalsDue } from '@/lib/pt/refill'
import {
  UserPlus, Users, DollarSign, ClipboardList, Dumbbell, CalendarDays,
  Inbox as InboxIcon, AlarmClock, Phone, ChevronRight, RefreshCw,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

type Props = { params: { locale: string } }

/**
 * /today — Today 2.0 (FD-1): the front-desk ACTION QUEUE. The IA-1 status page
 * became a stack of ActionCards (see components/dashboard/action-card.tsx for
 * the docking contract): Now/Next classes · Inbox · Expiring memberships ·
 * Money today · PT today. Every row drills into an existing verified flow;
 * cards with nothing to act on collapse to one ✓ line. Recomposition only.
 */
export default async function TodayPage({ params: { locale } }: Props) {
  const isRTL = locale === 'ar'
  const t = await getTranslations('today')
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
  const gymId = profile?.gym_id
  if (!gymId) return null

  const now = new Date()
  const dow = now.getDay() // 0=Sunday … 6=Saturday (class_schedules convention)
  const dayStart = now.toISOString().slice(0, 10)
  const in7d = new Date(now.getTime() + 7 * 864e5).toISOString().slice(0, 10)
  const hhmmNow = now.toTimeString().slice(0, 5)

  const [
    { data: schedules },
    { count: regRequests },
    { count: ptRequests },
    { data: expiring },
    { data: dueToday },
    { data: overdueRaw },
    { data: ptSessions },
  ] = await Promise.all([
    // ── 1. Now/Next: today's recurring classes, gym-scoped + active ──
    supabase
      .from('class_schedules')
      .select(`id, day_of_week, start_time, end_time, is_active,
        classes:class_id (id, gym_id, is_active, name_ar, name_en, name_fr, max_capacity, color,
          disciplines:discipline_id (name_ar, name_en, name_fr))`)
      .eq('day_of_week', dow)
      .eq('is_active', true)
      .order('start_time'),
    // ── 2. Inbox: actionable counts (same predicates as /inbox) ──
    supabase.from('class_registrations').select('id', { count: 'exact', head: true })
      .eq('gym_id', gymId).eq('status', 'requested'),
    supabase.from('pt_assignments').select('id, students!inner(gym_id)', { count: 'exact', head: true })
      .eq('students.gym_id', gymId).eq('status', 'requested'),
    // ── 3. Expiring memberships: ending today → +7d (active, gym via student) ──
    supabase
      .from('student_memberships')
      .select(`id, end_date, status,
        students!inner (id, gym_id, profiles:profile_id (first_name_ar, first_name_en, first_name_fr,
          last_name_ar, last_name_en, last_name_fr, phone)),
        membership_plans:plan_id (name_ar, name_en, name_fr)`)
      .eq('students.gym_id', gymId)
      .eq('status', 'active')
      .gte('end_date', dayStart)
      .lte('end_date', in7d)
      .order('end_date'),
    // ── 4. Money: invoices due today (open) + overdue ──
    supabase
      .from('invoices')
      .select(`id, invoice_number, total_usd, status, due_date,
        students (profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr))`)
      .eq('gym_id', gymId)
      .eq('due_date', dayStart)
      .in('status', ['pending', 'partial'])
      .order('created_at'),
    supabase
      .from('invoices')
      .select('id, total_usd')
      .eq('gym_id', gymId)
      .lt('due_date', dayStart)
      .in('status', ['pending', 'partial', 'overdue'])
      .limit(200),
    // ── 5. PT today (C1) ──
    supabase
      .from('pt_sessions')
      .select(`id, scheduled_at, duration_minutes, status,
        coaches:coach_id (gym_id, profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)),
        students:student_id (profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr))`)
      .gte('scheduled_at', `${dayStart}T00:00:00`)
      .lt('scheduled_at', `${dayStart}T23:59:59`)
      .order('scheduled_at'),
  ])

  const todayClasses = (schedules ?? [])
    .map((s: any) => ({ ...s, cls: one(s.classes) }))
    .filter((s: any) => s.cls && s.cls.gym_id === gymId && s.cls.is_active)

  const classIds = [...new Set(todayClasses.map((s: any) => s.cls.id))]
  const { data: enrollments } = classIds.length
    ? await supabase.from('class_enrollments').select('class_id').in('class_id', classIds).eq('is_active', true)
    : { data: [] as { class_id: string }[] }
  const enrolledBy = new Map<string, number>()
  for (const e of enrollments ?? []) enrolledBy.set(e.class_id, (enrolledBy.get(e.class_id) ?? 0) + 1)

  // Reconcile open balances for the Money card (D1 canon: Σ payments.amount_usd).
  const dueIds = (dueToday ?? []).map((i: any) => i.id)
  const overIds = (overdueRaw ?? []).map((i: any) => i.id)
  const allOpenIds = [...dueIds, ...overIds]
  const { data: pays } = allOpenIds.length
    ? await supabase.from('payments').select('invoice_id, amount_usd').in('invoice_id', allOpenIds)
    : { data: [] as { invoice_id: string; amount_usd: number | null }[] }
  const paidBy = new Map<string, number>()
  for (const p of pays ?? []) paidBy.set(p.invoice_id!, (paidBy.get(p.invoice_id!) ?? 0) + Number(p.amount_usd ?? 0))
  const bal = (inv: any) => balanceUsd(inv.total_usd, [{ amount_usd: paidBy.get(inv.id) ?? 0 }])
  const overdueOpen = (overdueRaw ?? []).filter((i: any) => bal(i) > 0)
  const overdueUsd = overdueOpen.reduce((s: number, i: any) => s + bal(i), 0)

  const todayPt = (ptSessions ?? []).filter((s: any) => one(s.coaches)?.gym_id === gymId)
  const tally = await getDailyTally(supabase, dayStart)
  const renewals = await getRenewalsDue(supabase, gymId, locale)
  const inboxCount = (regRequests ?? 0) + (ptRequests ?? 0)

  const hhmm = (v: string | null) => (v || '').slice(0, 5)
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(isRTL ? 'ar-LB' : 'en-US', { hour: '2-digit', minute: '2-digit' })
  const fmtDate = (d: string) => new Date(d).toLocaleDateString(isRTL ? 'ar-LB' : 'en-US')
  const clsName = (c: any) => (isRTL ? c.name_ar : locale === 'fr' ? c.name_fr : c.name_en) || c.name_en
  const lname = (row: any) => ((isRTL ? row?.name_ar : locale === 'fr' ? row?.name_fr : row?.name_en) || row?.name_en || '')
  const localName = (rel: any) => localizedName(one(rel)?.profiles, locale)

  // Now/Next status per class row (in-progress vs first upcoming).
  const nextIdx = todayClasses.findIndex((s: any) => hhmm(s.start_time) > hhmmNow)
  const rowPhase = (s: any, i: number) =>
    hhmm(s.start_time) <= hhmmNow && hhmmNow < hhmm(s.end_time) ? 'now' : i === nextIdx ? 'next' : null

  const quickActions = [
    { key: 'newLead', icon: UserPlus, href: `/${locale}/students?tab=prospects`, testid: 'quick-new-lead' },
    { key: 'newMember', icon: Users, href: `/${locale}/students/add`, testid: 'quick-new-member' },
    { key: 'recordPayment', icon: DollarSign, href: `/${locale}/payments/new`, testid: 'quick-record-payment' },
  ] as const

  const tel = (phone: string | null | undefined, testid: string) => phone ? (
    <a href={`tel:${phone}`} data-testid={testid} dir="ltr"
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100">
      <Phone className="h-3.5 w-3.5" /> {t('cards.call')}
    </a>
  ) : null

  return (
    <div className={cn('space-y-4 p-4 md:p-0', isRTL && 'rtl text-right')}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className={cn('text-2xl font-bold text-gray-900', isRTL && 'font-arabic')}>{t('title')}</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {now.toLocaleDateString(isRTL ? 'ar-LB' : locale === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <Link href={`/${locale}/schedule?view=day`} data-testid="open-diary-link"
          className="text-sm font-medium text-primary-600 hover:underline">
          {t('openDiary')}
        </Link>
      </div>

      {/* Quick actions (kept) */}
      <div className="grid grid-cols-3 gap-3">
        {quickActions.map((a) => {
          const Icon = a.icon
          return (
            <Link key={a.key} href={a.href} data-testid={a.testid}
              className="flex flex-col items-center gap-2 rounded-2xl border bg-white p-4 text-center shadow-sm transition-colors hover:bg-primary-50">
              <Icon className="h-6 w-6 text-primary-600" />
              <span className="text-xs font-medium text-gray-700">{t(`quick.${a.key}`)}</span>
            </Link>
          )
        })}
      </div>

      {/* ── Card 1: Now / Next ── */}
      <ActionCard icon={CalendarDays} title={t('classes')} count={todayClasses.length}
        emptyText={t('cards.noneToday')} testid="classes" isRTL={isRTL}>
        <div data-testid="today-classes" className="space-y-2">
          {todayClasses.map((s: any, i: number) => {
            const disc = one(s.cls.disciplines)
            const phase = rowPhase(s, i)
            return (
              <div key={s.id} data-testid="today-class-row"
                className={cn('flex items-center justify-between gap-3 rounded-xl border bg-gray-50/60 px-3 py-2.5 hover:bg-gray-50',
                  phase === 'now' && 'border-[#cd1419]/40 ring-1 ring-[#cd1419]/30')}>
                <Link href={`/${locale}/attendance`} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: s.cls.color || '#cd1419' }} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {clsName(s.cls)}
                      {phase && (
                        <span className={cn('ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase',
                          phase === 'now' ? 'bg-[#cd1419] text-white' : 'bg-gray-900 text-white')}>
                          {t(`cards.${phase}`)}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500" dir="ltr">
                      {hhmm(s.start_time)}–{hhmm(s.end_time)}
                      {disc ? ` · ${lname(disc)}` : ''}
                      {` · ${enrolledBy.get(s.cls.id) ?? 0}/${s.cls.max_capacity}`}
                    </p>
                  </div>
                </Link>
                <Link href={`/${locale}/attendance`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100">
                  <ClipboardList className="h-3.5 w-3.5" /> {t('markAttendance')}
                </Link>
              </div>
            )
          })}
        </div>
      </ActionCard>

      {/* ── Card 2: Inbox ── */}
      <ActionCard icon={InboxIcon} title={t('cards.inbox')} count={inboxCount}
        emptyText={t('cards.inboxZero')} testid="inbox" isRTL={isRTL}>
        {(regRequests ?? 0) > 0 && (
          <ActionRow href={`/${locale}/inbox`} testid="inbox-card-row"
            action={<ChevronRight className={cn('h-4 w-4 shrink-0 text-gray-400', isRTL && 'rotate-180')} />}>
            <p className="text-sm text-gray-800">{t('cards.regRequests', { count: regRequests ?? 0 })}</p>
          </ActionRow>
        )}
        {(ptRequests ?? 0) > 0 && (
          <ActionRow href={`/${locale}/inbox`} testid="inbox-card-row"
            action={<ChevronRight className={cn('h-4 w-4 shrink-0 text-gray-400', isRTL && 'rotate-180')} />}>
            <p className="text-sm text-gray-800">{t('cards.ptRequests', { count: ptRequests ?? 0 })}</p>
          </ActionRow>
        )}
      </ActionCard>

      {/* ── Card 3: Expiring memberships (ML-1 docks "renew" here; tel: until then) ── */}
      <ActionCard icon={AlarmClock} title={t('cards.expiring')} count={(expiring ?? []).length}
        emptyText={t('cards.noneExpiring')} testid="expiring" isRTL={isRTL}>
        {(expiring ?? []).map((m: any) => {
          const st = one(m.students)
          const prof = one(st?.profiles)
          const today = m.end_date === dayStart
          return (
            <ActionRow key={m.id} href={`/${locale}/students/${st?.id}`} testid="expiring-row"
              action={tel(prof?.phone, 'expiring-call')}>
              <p className="truncate text-sm font-semibold text-gray-900">{localizedName(prof, locale)}</p>
              <p className="text-xs text-gray-500">
                {lname(one(m.membership_plans))} ·{' '}
                <span className={cn(today && 'font-bold text-[#cd1419]')}>
                  {today ? t('cards.endsToday') : t('cards.endsOn', { date: fmtDate(m.end_date) })}
                </span>
              </p>
            </ActionRow>
          )
        })}
      </ActionCard>

      {/* ── Card 4: Money today (due now + overdue + the day's drawer) ── */}
      <ActionCard icon={DollarSign} title={t('cards.money')} count={(dueToday ?? []).length + overdueOpen.length}
        badge={`${(dueToday ?? []).length} · ${overdueOpen.length}`}
        emptyText={t('cards.noneDue')} testid="money" isRTL={isRTL}
        footer={
          <div className="mt-3 border-t pt-2">
            <p className="mb-1 text-xs font-medium text-gray-500">{t('collections')}</p>
            <div className="flex flex-wrap gap-2 text-sm" data-testid="today-tally">
              {tally.size === 0 ? (
                <span className="text-gray-400">{t('noPayments')}</span>
              ) : (
                [...tally.entries()].map(([method, v]) => (
                  <span key={method} className="rounded-full bg-muted px-3 py-1">
                    {(isRTL ? METHOD_LABEL[method]?.ar : METHOD_LABEL[method]?.en) || method}: ${v.usd.toFixed(2)}
                    {v.lbp ? ` · ${v.lbp.toLocaleString()} LBP` : ''}
                  </span>
                ))
              )}
            </div>
          </div>
        }>
        {(dueToday ?? []).map((inv: any) => (
          <ActionRow key={inv.id} href={`/${locale}/money?tab=invoices`} testid="money-due-row"
            action={
              <Link href={`/${locale}/invoices/${inv.id}`} data-testid="money-record-payment"
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#cd1419] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#a81014]">
                <DollarSign className="h-3.5 w-3.5" /> {t('cards.recordPayment')}
              </Link>
            }>
            <p className="truncate text-sm font-semibold text-gray-900">{localName(inv.students)}</p>
            <p className="text-xs text-gray-500">
              <span className="font-mono">{inv.invoice_number}</span> · {t('cards.dueToday')} · ${bal(inv).toFixed(2)}
            </p>
          </ActionRow>
        ))}
        {overdueOpen.length > 0 && (
          <ActionRow href={`/${locale}/money?tab=invoices&status=pending`} testid="money-overdue-row"
            action={<ChevronRight className={cn('h-4 w-4 shrink-0 text-gray-400', isRTL && 'rotate-180')} />}>
            <p className="text-sm font-medium text-red-700">
              {t('cards.overdue', { count: overdueOpen.length })} · ${overdueUsd.toFixed(2)}
            </p>
          </ActionRow>
        )}
      </ActionCard>

      {/* ── Card 5: PT today ── */}
      <ActionCard icon={Dumbbell} title={t('ptSessions')} count={todayPt.length}
        emptyText={t('cards.nonePt')} testid="pt" isRTL={isRTL}>
        <div data-testid="today-pt" className="space-y-2">
          {todayPt.map((s: any) => (
            <ActionRow key={s.id} href={`/${locale}/pt`} testid="today-pt-row"
              action={<span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium capitalize text-gray-600">{s.status}</span>}>
              <p className="text-sm font-semibold text-gray-900">{localName(s.students)}</p>
              <p className="text-xs text-gray-500">{fmtTime(s.scheduled_at)} · {localName(s.coaches)}</p>
            </ActionRow>
          ))}
        </div>
      </ActionCard>

      {/* ── Card 6: PT refill (PT-1 — first external proof of the FD-1 docking
          contract: this card is the fetch above + these 14 JSX lines). ── */}
      <ActionCard icon={RefreshCw} title={t('cards.ptRefill')} count={renewals.length}
        emptyText={t('cards.noneRefill')} testid="pt-refill" isRTL={isRTL}>
        {renewals.map((r) => (
          <ActionRow key={r.assignmentId} href={`/${locale}/students/${r.studentId}`} testid="refill-row"
            action={
              <Link href={`/${locale}/students/${r.studentId}?sellpt=${r.packageId}`} data-testid="refill-resell"
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#cd1419] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#a81014]">
                <RefreshCw className="h-3.5 w-3.5" /> {t('cards.resell')}
              </Link>
            }>
            <p className="truncate text-sm font-semibold text-gray-900">{r.studentName}</p>
            <p className="text-xs text-gray-500">
              {r.packageName} · {r.remaining}/{r.total}
              {r.daysLeft !== null ? ` · ${t('cards.daysLeft', { days: r.daysLeft })}` : ''}
            </p>
          </ActionRow>
        ))}
      </ActionCard>
    </div>
  )
}
