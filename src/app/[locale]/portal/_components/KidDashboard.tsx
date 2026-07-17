import { dateLocale } from '@/lib/utils/locale-format'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { PortalCampsSection } from './portal-camps'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { one } from '@/lib/names'
import { Award, CalendarDays, ClipboardList, CreditCard, Flame, ChevronRight } from 'lucide-react'
import { Avatar } from '@/components/shared/avatar'
import { getWaiverContext } from '@/lib/waivers/server'
import { waiverTitle, waiverBody } from '@/lib/waivers/status'
import { WaiverSign, WaiverChip } from '@/components/shared/waiver-sign'
import { MembershipLifecycleActions } from './membership-lifecycle-actions'
import { ProfileSelfServe } from '../profile/profile-self-serve'

/**
 * Guardian's per-kid dashboard (B3). Rendered on /portal?kid=<studentId> for a
 * LINKED guardian — every read below rides the additive guardian RLS
 * (is_guardian_of), so a non-linked kid simply yields no rows. View + request
 * only: registrations (+ request a class for this kid via the B2 portal flow),
 * attendance recent + streak, belt progress, the kid's weekly schedule, and a
 * link into the household billing view. No self-cancel (staff-mediated, B2).
 */
export async function KidDashboard({
  locale, kid, kids, hasOwn, householdOutstanding = 0, householdOpenCount = 0,
}: {
  locale: string
  kid: { id: string; name: string }
  kids: { id: string; name: string; avatarUrl?: string | null }[]
  hasOwn: boolean
  // BILL-GUARDS R6: the family's netted outstanding across ALL linked kids.
  householdOutstanding?: number
  householdOpenCount?: number
}) {
  const isRTL = locale === 'ar'
  const t = await getTranslations('family')
  const th = await getTranslations('portalHome')
  const supabase = await createClient()

  const [
    { data: kidStudent },
    { data: registrations },
    { data: attendance },
    { count: attendance30 },
    { data: beltPromos },
    { data: enrollments },
  ] = await Promise.all([
    supabase.from('students').select('id, profile_id, current_belt_rank, is_active, gym_id, emergency_contact_name, emergency_contact_phone, medical_notes').eq('id', kid.id).maybeSingle(),
    supabase
      .from('class_registrations')
      .select('id, status, waitlist_position, monthly_fee_usd, classes:class_id (name_ar, name_en, name_fr)')
      .eq('student_id', kid.id)
      .in('status', ['requested', 'active', 'waitlisted'])
      .order('requested_at', { ascending: false }),
    supabase
      .from('attendance_records')
      .select('id, attendance_date, status, classes:class_id (name_ar, name_en, name_fr)')
      .eq('student_id', kid.id)
      .order('attendance_date', { ascending: false })
      .limit(8),
    supabase
      .from('attendance_records')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', kid.id)
      .gte('attendance_date', new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)),
    supabase
      .from('belt_promotions')
      .select('to_rank, promotion_date')
      .eq('student_id', kid.id)
      .order('promotion_date', { ascending: false })
      .limit(3),
    supabase
      .from('class_enrollments')
      .select('classes:class_id (name_ar, name_en, name_fr, is_active, class_schedules (day_of_week, start_time, end_time, is_active))')
      .eq('student_id', kid.id)
      .eq('is_active', true),
  ])

  const lname = (row: any) => ((isRTL ? row?.name_ar : locale === 'fr' ? row?.name_fr : row?.name_en) || row?.name_en || '')
  const fmtDate = (d: string) => new Date(d).toLocaleDateString(dateLocale(locale))

  // Streak: consecutive calendar weeks (back from this week) with ≥1 attendance.
  const { data: streakRows } = await supabase
    .from('attendance_records')
    .select('attendance_date')
    .eq('student_id', kid.id)
    .eq('status', 'present')
    .gte('attendance_date', new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10))
  const weekOf = (d: Date) => {
    const x = new Date(d)
    x.setDate(x.getDate() - x.getDay())
    return x.toISOString().slice(0, 10)
  }
  const weeks = new Set((streakRows ?? []).map((r: any) => weekOf(new Date(r.attendance_date))))
  let streak = 0
  const cursor = new Date()
  while (weeks.has(weekOf(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 7)
  }

  // F3: the kid's waiver status — the GUARDIAN signs from here (signed_by = guardian).
  const tw = await getTranslations({ locale, namespace: 'waiver' })
  const waiver = kidStudent?.gym_id ? await getWaiverContext(supabase, kid.id, kidStudent.gym_id) : null

  // MJ-3: the kid's membership lifecycle + pending requests (guardian self-serve).
  const [{ data: kidMemberships }, { data: kidGym }, { data: kidPending }, { data: kidProfile }] = await Promise.all([
    supabase.from('student_memberships').select('status, end_date, pause_end_date').eq('student_id', kid.id).order('end_date', { ascending: false }).limit(5),
    kidStudent?.gym_id
      ? supabase.from('gyms').select('renewal_lead_days, dunning_grace_days, freeze_min_chunk_days').eq('id', kidStudent.gym_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('member_requests').select('kind').eq('student_id', kid.id).eq('status', 'pending'),
    kidStudent?.profile_id
      ? supabase.from('profiles').select('date_of_birth, phone').eq('id', kidStudent.profile_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const { membershipState } = await import('@/lib/lifecycle/status')
  const kidStates = ((kidMemberships ?? []) as any[]).map((m) => membershipState(m, kidGym ?? {}))
  const kidMsState = (['lapsed', 'overdue', 'expiring', 'frozen'] as const).find((sv) => kidStates.includes(sv)) ?? 'active'
  const kidPendRenewal = ((kidPending ?? []) as any[]).some((r) => r.kind === 'renewal')
  const kidPendFreeze = ((kidPending ?? []) as any[]).some((r) => r.kind === 'freeze')
  const kidPendChange = ((kidPending ?? []) as any[]).some((r) => r.kind === 'profile_change')

  const dayNames = isRTL
    ? ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
    : locale === 'fr'
      ? ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const regBadge: Record<string, string> = {
    active: 'bg-green-100 text-green-700', requested: 'bg-yellow-100 text-yellow-700',
    waitlisted: 'bg-orange-100 text-orange-700',
  }

  return (
    <div className={cn('p-4 space-y-5', isRTL && 'rtl')} data-testid="kid-dashboard" data-kid-id={kid.id}>
      {/* BILL-GUARDS R6: the family's HOUSEHOLD outstanding across all kids, surfaced
          on the guardian home without a click. Empty (nothing owed) = NO card. */}
      {householdOutstanding > 0.005 && (
        <Link href={`/${locale}/portal/billing`} data-testid="portal-outstanding-balance" data-amount={householdOutstanding.toFixed(2)}
          className="flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 p-4 transition-colors hover:bg-red-100">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600"><CreditCard className="h-5 w-5" aria-hidden /></div>
            <div>
              <p className={cn('text-sm font-semibold text-red-800', isRTL && 'font-arabic')}>{th('outstandingTitle')}</p>
              <p className={cn('text-xs text-red-600', isRTL && 'font-arabic')}>{th('outstandingCount', { count: householdOpenCount })}</p>
            </div>
          </div>
          <span className="text-lg font-bold text-red-800" dir="ltr">${householdOutstanding.toFixed(2)}</span>
        </Link>
      )}
      {/* Switcher */}
      <div className="flex flex-wrap gap-2" data-testid="kid-switcher">
        {/* GUARDIAN-360: a family overview exists when there are 2+ kids or the
            guardian is also a member — offer a way back to it. */}
        {(kids.length >= 2 || hasOwn) && (
          <Link href={`/${locale}/portal`} data-testid="family-chip"
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-gray-300">
            {t('family')}
          </Link>
        )}
        {hasOwn && (
          <Link href={`/${locale}/portal?me=1`} data-testid="kid-chip-me"
            className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 hover:border-gray-300">
            {t('me')}
          </Link>
        )}
        {kids.map((k) => (
          k.id === kid.id ? (
            <span key={k.id} data-testid="kid-chip" data-kid-id={k.id} data-active="true"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary-700 px-3 py-1.5 text-sm font-semibold text-primary-foreground">
              <Avatar url={k.avatarUrl} name={k.name} size="xs" />
              {k.name}
            </span>
          ) : (
            <Link key={k.id} href={`/${locale}/portal?kid=${k.id}`} data-testid="kid-chip" data-kid-id={k.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-gray-300">
              <Avatar url={k.avatarUrl} name={k.name} size="xs" />
              {k.name}
            </Link>
          )
        ))}
      </div>

      <div>
        <h1 className={cn('text-xl font-bold text-gray-900', isRTL && 'font-arabic')} data-testid="kid-name">{kid.name}</h1>
        <p className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1 capitalize"><Award className="h-3 w-3" />{(kidStudent?.current_belt_rank || '—').replace(/_/g, ' ')}</span>
          <span className="inline-flex items-center gap-1"><ClipboardList className="h-3 w-3" />{t('last30', { count: attendance30 ?? 0 })}</span>
          <span className="inline-flex items-center gap-1"><Flame className="h-3 w-3 text-orange-500" />{t('streak', { count: streak })}</span>
        </p>
      </div>

      {/* MJ-3: the kid's membership lifecycle — guardian requests renewal/freeze. */}
      {(kidMemberships ?? []).length > 0 && (
        <div className="rounded-2xl bg-white p-4 shadow-sm" data-testid="kid-membership">
          <div className="mb-2 flex items-center justify-between">
            <h3 className={cn('flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
              <CreditCard className="h-4 w-4 text-primary-700" /> {t('membership')}
            </h3>
            <span data-testid="kid-membership-state" className={cn('rounded-full px-2 py-0.5 text-xs font-medium',
              kidMsState === 'active' ? 'bg-green-100 text-green-700' : kidMsState === 'frozen' ? 'bg-blue-100 text-blue-700' : kidMsState === 'expiring' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700')}>
              {t(`msState.${kidMsState}`)}
            </span>
          </div>
          <MembershipLifecycleActions
            locale={locale}
            studentId={kid.id}
            state={kidMsState}
            pendingRenewal={kidPendRenewal}
            pendingFreeze={kidPendFreeze}
            freezeMinDays={(kidGym as any)?.freeze_min_chunk_days ?? 7}
          />
        </div>
      )}

      {/* Registrations + request-for-kid */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h3 className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t('registrations')}</h3>
          <Link href={`/${locale}/portal/classes?kid=${kid.id}`} data-testid="kid-request-class"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline">
            {t('requestClass')} <ChevronRight className={cn('h-3 w-3', isRTL && 'rotate-180')} />
          </Link>
        </div>
        {(registrations ?? []).length === 0 ? (
          <p className="py-3 text-center text-sm text-gray-400">{t('noRegistrations')}</p>
        ) : (
          <ul className="space-y-2">
            {(registrations ?? []).map((r: any) => (
              <li key={r.id} className="flex items-center justify-between text-sm" data-testid="kid-reg-row" data-status={r.status}>
                <span className="font-medium text-gray-800">{lname(one(r.classes))}</span>
                <span className="text-xs text-gray-500">
                  {r.monthly_fee_usd != null ? `$${Number(r.monthly_fee_usd).toFixed(0)}/${t('mo')}` : ''}
                  {r.status === 'waitlisted' && r.waitlist_position ? ` · #${r.waitlist_position}` : ''}
                </span>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', regBadge[r.status] || 'bg-gray-100 text-gray-500')}>{r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* F3: the kid's waiver — guardian signs for the minor (signed_by = guardian) */}
      {waiver && waiver.state !== 'none' && (
        <div className="rounded-2xl bg-white p-4 shadow-sm" data-testid="kid-waiver" data-state={waiver.state}>
          <div className="flex items-center justify-between">
            <h3 className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{tw('myWaiver')}</h3>
            <WaiverChip state={waiver.state} version={waiver.signedVersion} testid="kid-waiver-chip" />
          </div>
          {waiver.template && (waiver.state === 'unsigned' || waiver.state === 'outdated') && (
            <div className="mt-3">
              <WaiverSign
                studentId={kid.id}
                title={waiverTitle(waiver.template, locale)}
                body={waiverBody(waiver.template, locale)}
                locale={locale}
                outdated={waiver.state === 'outdated'}
                label={waiver.state === 'outdated' ? tw('resign') : tw('signForKid')}
                testidPrefix="kid-waiver"
              />
            </div>
          )}
        </div>
      )}

      {/* Weekly schedule (the kid's enrolled classes) */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h3 className={cn('mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
          <CalendarDays className="h-4 w-4 text-primary-600" /> {t('schedule')}
        </h3>
        {(() => {
          const slots: { day: number; start: string; name: string }[] = []
          for (const e of (enrollments ?? []) as any[]) {
            const cls = one(e.classes)
            if (!cls || cls.is_active === false) continue
            for (const sch of cls.class_schedules ?? []) {
              if (sch.is_active === false) continue
              slots.push({ day: sch.day_of_week, start: String(sch.start_time).slice(0, 5), name: lname(cls) })
            }
          }
          slots.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))
          return slots.length === 0 ? (
            <p className="py-3 text-center text-sm text-gray-400">{t('noSchedule')}</p>
          ) : (
            <ul className="space-y-1.5">
              {slots.map((sl, i) => (
                <li key={i} className="flex items-center justify-between text-sm text-gray-700">
                  <span className="font-medium">{sl.name}</span>
                  <span className="text-xs text-gray-500" dir="ltr">{dayNames[sl.day]} · {sl.start}</span>
                </li>
              ))}
            </ul>
          )
        })()}
      </div>

      {/* Recent attendance */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h3 className={cn('mb-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t('recentAttendance')}</h3>
        {(attendance ?? []).length === 0 ? (
          <p className="py-3 text-center text-sm text-gray-400">{t('noAttendance')}</p>
        ) : (
          <ul className="space-y-1.5">
            {(attendance ?? []).map((a: any) => (
              <li key={a.id} className="flex items-center justify-between text-xs text-gray-600">
                <span>{fmtDate(a.attendance_date)} · {lname(one(a.classes))}</span>
                <span className="capitalize">{a.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Belt progress */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h3 className={cn('mb-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t('beltProgress')}</h3>
        {(beltPromos ?? []).length === 0 ? (
          <p className="py-3 text-center text-sm text-gray-400">{t('noPromotions')}</p>
        ) : (
          <ul className="space-y-1.5">
            {(beltPromos ?? []).map((b: any, i: number) => (
              <li key={i} className="flex items-center justify-between text-xs text-gray-600">
                <span className="capitalize font-medium">{String(b.to_rank).replace(/_/g, ' ')}</span>
                <span>{fmtDate(b.promotion_date)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* E1: published camps — guardian requests FOR this kid */}
      <PortalCampsSection studentId={kid.id} actingFor={kid.name} locale={locale} />

      {/* MJ-3: guardian requests a safety/contact change for this kid (request-only). */}
      <ProfileSelfServe
        locale={locale}
        mode="guardian"
        studentId={kid.id}
        credentialed={false}
        pendingChange={kidPendChange}
        initial={{
          contactEmail: null,
          prefLocale: null,
          dob: (kidProfile as any)?.date_of_birth ?? null,
          phone: (kidProfile as any)?.phone ?? null,
          emergencyName: (kidStudent as any)?.emergency_contact_name ?? null,
          emergencyPhone: (kidStudent as any)?.emergency_contact_phone ?? null,
          medical: (kidStudent as any)?.medical_notes ?? null,
        }}
      />

      {/* Household billing link */}
      <Link href={`/${locale}/portal/billing`} data-testid="kid-billing-link"
        className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm hover:bg-gray-50">
        <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <CreditCard className="h-4 w-4 text-primary-700" /> {t('householdBilling')}
        </span>
        <ChevronRight className={cn('h-4 w-4 text-gray-400', isRTL && 'rotate-180')} />
      </Link>
    </div>
  )
}
