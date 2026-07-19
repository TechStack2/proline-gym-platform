import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { beltRankLabel } from '@/lib/belts/label'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { dateLocale } from '@/lib/utils/locale-format'
import { Phone, Users, ChevronLeft, Award, CalendarDays, DollarSign, Wallet, ArrowRight, Clock } from 'lucide-react'
import { localizedName, one } from '@/lib/names'
import { getFamilySummaries, familyOutstandingTotal, type FamilySummary } from '@/lib/family/aggregate'
import { Avatar } from '@/components/shared/avatar'
import { InviteButton } from '@/components/shared/invite-button'
import { MemberPortalAccess } from '../../[id]/member-portal-access'

/**
 * GUARDIAN-360 R1 — the staff guardian detail. One page for the whole family:
 * contact, every dependent's at-a-glance state (membership / balance / next class
 * / belt), the combined family balance, per-child jump-to-Member-360, and the
 * existing action flows reachable per child (register + record payment via the
 * Member-360 deep-links `?register=1` / `?pay=1`; portal invite via the reused
 * MemberPortalAccess). A guardian who is ALSO a member gets their OWN card too
 * (dual-hat). Read-only VIEW — no billing writes, no new model.
 */
export const dynamic = 'force-dynamic'

type Tr = (key: string, values?: Record<string, string | number>) => string

const STATE_CHIP: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  expiring: 'bg-amber-100 text-amber-700',
  overdue: 'bg-orange-100 text-orange-700',
  lapsed: 'bg-red-100 text-red-700',
  frozen: 'bg-blue-100 text-blue-700',
  none: 'bg-gray-100 text-gray-500',
}

// Hoisted (stable identity) — a per-dependent card with the reused action flows.
function ChildCard({ s, self, locale, t, tb, isRTL }: {
  s: FamilySummary; self?: boolean; locale: string; t: Tr; tb: Tr; isRTL: boolean
}) {
  const fmtDate = (d: string | null) => (d ? new Date(String(d).slice(0, 10) + 'T00:00:00Z').toLocaleDateString(dateLocale(locale), { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—')
  const weekday = (diff: number) => diff === 0 ? t('today') : new Date(Date.now() + diff * 864e5).toLocaleDateString(dateLocale(locale), { weekday: 'long' })
  const nextClassLabel = s.nextClass ? `${weekday(s.nextClass.dayDiff)} ${s.nextClass.start} · ${s.nextClass.className}` : t('noNextClass')
  const beltLabel = s.beltRank ? beltRankLabel(s.beltRank, tb) : null
  return (
    <div data-testid={self ? 'guardian-self-card' : 'guardian-child-card'} data-student-id={s.studentId} data-lapsed={s.lapsed ? 'true' : undefined}
      className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/${locale}/students/${s.studentId}`} data-testid="guardian-child-360"
          className="flex min-w-0 items-center gap-3 hover:opacity-80">
          <Avatar url={s.avatarUrl} name={s.name} />
          <span className="min-w-0">
            <span className={cn('block truncate font-semibold text-gray-900', isRTL && 'font-arabic')}>
              {s.name}{self && <span className="ms-2 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-medium text-primary-700">{t('alsoMember')}</span>}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
              {beltLabel && <span className="inline-flex items-center gap-1 capitalize"><Award className="h-3 w-3" />{beltLabel}</span>}
              <span data-testid="guardian-child-membership" className={cn('rounded-full px-2 py-0.5 font-medium', STATE_CHIP[s.membershipStateValue])}>
                {t(`state.${s.membershipStateValue}`)}
              </span>
            </span>
          </span>
        </Link>
        {s.outstanding > 0.005 ? (
          <span data-testid="guardian-child-outstanding" data-amount={s.outstanding.toFixed(2)}
            className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700" dir="ltr">${s.outstanding.toFixed(2)}</span>
        ) : (
          <span data-testid="guardian-child-outstanding" data-amount="0.00" className="shrink-0 text-xs text-emerald-600">{t('settled')}</span>
        )}
      </div>

      {/* Win-back context (R3) — only when lapsed/inactive. */}
      {s.lapsed && (
        <p data-testid="guardian-child-lastseen" className="mt-2 flex flex-wrap items-center gap-x-3 rounded-lg bg-red-50/60 px-3 py-1.5 text-xs text-red-700">
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{s.lastSeen ? t('lastSeen', { date: fmtDate(s.lastSeen) }) : t('neverSeen')}</span>
          <span>· {t('joined', { date: fmtDate(s.joinDate) })}</span>
        </p>
      )}

      {/* Glance: next class · cycle end · registrations. */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-lg bg-gray-50 px-2.5 py-1.5">
          <p className="text-gray-400">{t('nextClass')}</p>
          <p data-testid="guardian-child-nextclass" className="mt-0.5 font-medium text-gray-800" dir="ltr">{nextClassLabel}</p>
        </div>
        <div className="rounded-lg bg-gray-50 px-2.5 py-1.5">
          <p className="text-gray-400">{t('cycleEnd')}</p>
          <p data-testid="guardian-child-cycle-end" className="mt-0.5 font-medium text-gray-800" dir="ltr">{s.cycleEnd ? fmtDate(s.cycleEnd) : '—'}</p>
        </div>
        <div className="rounded-lg bg-gray-50 px-2.5 py-1.5">
          <p className="text-gray-400">{t('registrations')}</p>
          <p data-testid="guardian-child-regs" className="mt-0.5 font-medium text-gray-800">{s.activeRegCount}</p>
        </div>
      </div>

      {/* Actions per child — reuse existing Member-360 flows (no reimplementation). */}
      <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="guardian-child-actions">
        <Link href={`/${locale}/students/${s.studentId}?pay=1`} data-testid="guardian-child-pay"
          className="inline-flex items-center gap-1 rounded-lg bg-primary-700 px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-800">
          <DollarSign className="h-3.5 w-3.5" />{t('recordPayment')}
        </Link>
        <Link href={`/${locale}/students/${s.studentId}?register=1`} data-testid="guardian-child-register"
          className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
          <CalendarDays className="h-3.5 w-3.5" />{t('register')}
        </Link>
        <Link href={`/${locale}/students/${s.studentId}`} data-testid="guardian-child-open"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
          {t('viewMember')}<ArrowRight className={cn('h-3.5 w-3.5', isRTL && 'rotate-180')} />
        </Link>
      </div>
      {/* Portal invite/access per child — the reused eligibility+invite affordance. */}
      <div className="mt-3 border-t pt-3">
        <MemberPortalAccess studentId={s.studentId} name={s.name} locale={locale} phone={s.phone} override={s.portalOverride} age={s.age} />
      </div>
    </div>
  )
}

export default async function GuardianDetailPage({
  params: { locale, id },
}: {
  params: { locale: string; id: string }
}) {
  const supabase = await createClient()
  const t = (await getTranslations('guardians')) as unknown as Tr
  const tb = (await getTranslations('beltRanks')) as unknown as Tr
  const isRTL = locale === 'ar'

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
  const gymId = profile?.gym_id
  if (!gymId) return null

  const { data: guardian } = await supabase
    .from('guardians')
    .select('id, profile_id, gym_id, relationship_ar, relationship_en, relationship_fr, profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone, avatar_url)')
    .eq('id', id)
    .eq('gym_id', gymId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!guardian) notFound()

  const gProfile = one((guardian as any).profiles)
  const gName = localizedName(gProfile, locale)
  const gPhone = gProfile?.phone ?? null
  const relationship = (isRTL ? (guardian as any).relationship_ar : locale === 'fr' ? (guardian as any).relationship_fr : (guardian as any).relationship_en) || ''

  // Dependents + (dual-hat) the guardian's OWN student record.
  const [{ data: kidLinks }, { data: ownStudent }] = await Promise.all([
    supabase.from('guardian_students').select('student_id').eq('guardian_id', id),
    supabase.from('students').select('id').eq('profile_id', (guardian as any).profile_id).maybeSingle(),
  ])
  const kidIds = (kidLinks ?? []).map((l: any) => l.student_id)
  const ownId = (ownStudent as any)?.id ?? null
  const allIds = [...new Set([...kidIds, ...(ownId ? [ownId] : [])])]
  const summaries = await getFamilySummaries(supabase, allIds, locale)

  const kidSummaries = kidIds.map((k: string) => summaries.get(k)).filter(Boolean) as FamilySummary[]
  const ownSummary = ownId ? summaries.get(ownId) ?? null : null
  const familyOutstanding = familyOutstandingTotal(kidSummaries)

  return (
    <div className={cn('space-y-5', isRTL && 'rtl text-right')} data-testid="guardian-detail" data-guardian-id={id}>
      <Link href={`/${locale}/students/guardians`} data-testid="guardian-back"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-800">
        <ChevronLeft className={cn('h-4 w-4', isRTL && 'rotate-180')} />{t('backToList')}
      </Link>

      {/* Header — guardian contact + the guardian's own portal login + family balance. */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar url={gProfile?.avatar_url} name={gName} size="lg" />
            <div>
              <h1 className={cn('text-2xl font-bold text-gray-900', isRTL && 'font-arabic')} data-testid="guardian-name">{gName}</h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                {gPhone && <span dir="ltr" className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{gPhone}</span>}
                {relationship && <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{relationship}</span>}
                <span data-testid="guardian-dependents-count">{t('dependents', { count: kidIds.length })}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {/* Family balance — the combined outstanding across all dependents. */}
            <div data-testid="guardian-family-outstanding" data-amount={familyOutstanding.toFixed(2)}
              className={cn('rounded-xl px-4 py-2 text-right', familyOutstanding > 0.005 ? 'bg-red-50' : 'bg-emerald-50')}>
              <p className={cn('text-[11px] font-medium', familyOutstanding > 0.005 ? 'text-red-600' : 'text-emerald-600')}>{t('familyOutstanding')}</p>
              <p className={cn('text-lg font-bold', familyOutstanding > 0.005 ? 'text-red-800' : 'text-emerald-700')} dir="ltr">
                {familyOutstanding > 0.005 ? `$${familyOutstanding.toFixed(2)}` : t('settled')}
              </p>
            </div>
            {/* The family's door — invite the guardian to the portal (parent role). */}
            <InviteButton kind="parent" id={(guardian as any).profile_id} name={gName} locale={locale} phone={gPhone} />
          </div>
        </div>
      </div>

      {/* Dependents */}
      <section className="space-y-3">
        <h2 className={cn('flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
          <Users className="h-4 w-4 text-primary-600" />{t('dependentsHeading')}
        </h2>
        {kidSummaries.length === 0 ? (
          <p className="rounded-2xl border bg-white p-6 text-center text-sm text-gray-400" data-testid="guardian-no-dependents">{t('noDependents')}</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {kidSummaries.map((s) => <ChildCard key={s.studentId} s={s} locale={locale} t={t} tb={tb} isRTL={isRTL} />)}
          </div>
        )}
      </section>

      {/* Dual-hat — the guardian's OWN membership alongside their children's. */}
      {ownSummary && (
        <section className="space-y-3">
          <h2 className={cn('flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
            <Wallet className="h-4 w-4 text-primary-600" />{t('ownHeading')}
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            <ChildCard s={ownSummary} self locale={locale} t={t} tb={tb} isRTL={isRTL} />
          </div>
        </section>
      )}
    </div>
  )
}
