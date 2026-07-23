import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { beltRankLabel } from '@/lib/belts/label'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { fmtDate as fmtDateLoc, fmtWeekday } from '@/lib/fmt'
import { statusTintClass } from '@/lib/status-vocabulary'
import { Phone, Users, ChevronLeft, Award, CalendarDays, DollarSign, Wallet, Clock } from 'lucide-react'
import { NavChevron } from '@/components/ui/nav-chevron'
import { localizedName, one } from '@/lib/names'
import { getFamilySummaries, familyOutstandingTotal, type FamilySummary } from '@/lib/family/aggregate'
import { getFamilyBillingDetail, type ChildBillingDetail } from '@/lib/family/billing-detail'
import { Avatar } from '@/components/shared/avatar'
import { InviteButton } from '@/components/shared/invite-button'
import { MemberPortalAccess } from '../../[id]/member-portal-access'
import { FamilyCollect, type FamilyCollectRow } from './family-collect'
import { AttentionQueue, type QueueRow } from '@/components/member360/attention-queue'
import { LifecycleFacts, type LifecycleFact } from '@/components/member360/lifecycle-facts'
import { VARIANT_TINT } from '@/lib/status-vocabulary'
import { ATTENTION } from '@/lib/member360/attention'
import { daysPastDue } from '@/lib/finances/aging'
import { Ltr } from '@/components/ui/bdi'
import { WhatsAppShare } from '@/components/shared/whatsapp-share'
import { gymDisplayName } from '@/lib/whatsapp/identity'

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

// W3b (DA-25/32): colour comes from the status vocabulary (member domain) via
// statusTintClass — the local light-pinned STATE_CHIP map is dead.

// Hoisted (stable identity) — a per-dependent card with the reused action flows.
function ChildCard({ s, self, locale, t, ta, tb, isRTL, detail, gymName, winbackMsg }: {
  s: FamilySummary; self?: boolean; locale: string; t: Tr; ta: Tr; tb: Tr; isRTL: boolean
  detail?: ChildBillingDetail; gymName?: string; winbackMsg?: string
}) {
  const fmtDate = (d: string | null) => fmtDateLoc(d, locale, 'medium')
  const weekday = (diff: number) => diff === 0 ? t('today') : fmtWeekday(new Date(Date.now() + diff * 864e5).getDay(), locale, 'long')
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
              <span data-testid="guardian-child-membership" className={cn('rounded-full px-2 py-0.5 font-medium', statusTintClass('member', s.membershipStateValue))}>
                {t(`state.${s.membershipStateValue}`)}
              </span>
            </span>
          </span>
        </Link>
        {s.outstanding > 0.005 ? (
          <span data-testid="guardian-child-outstanding" data-amount={s.outstanding.toFixed(2)}
            className="tint-danger shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold" dir="ltr">${s.outstanding.toFixed(2)}</span>
        ) : (
          <span data-testid="guardian-child-outstanding" data-amount="0.00" className="shrink-0 text-xs text-gray-500">{t('settled')}</span>
        )}
      </div>

      {/* Win-back context (R3) — only when lapsed/inactive. */}
      {s.lapsed && (
        <p data-testid="guardian-child-lastseen" className="mt-2 flex flex-wrap items-center gap-x-3 rounded-lg bg-danger-500/10 px-3 py-1.5 text-xs text-danger-700">
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{s.lastSeen ? t('lastSeen', { date: fmtDate(s.lastSeen) }) : t('neverSeen')}</span>
          <span>· {t('joined', { date: fmtDate(s.joinDate) })}</span>
        </p>
      )}

      {/* §4.4 — the member lifecycle grid, compact: the SAME four-slot scan pattern
          (next class · cycle · next bill · last payment). A dependent with no
          registrations renders the empty-state row instead — absence is information. */}
      {(s.activeRegCount > 0 || s.membershipStateValue !== 'none') ? (
        <LifecycleFacts
          testid="guardian-child-lifecycle"
          facts={[
            { key: 'nextclass', label: t('nextClass'), value: <span data-testid="guardian-child-nextclass" dir="ltr">{nextClassLabel}</span> },
            { key: 'cycle', label: t('cycleEnd'), value: <span data-testid="guardian-child-cycle-end" dir="ltr">{s.cycleEnd ? fmtDate(s.cycleEnd) : '—'}</span> },
            {
              key: 'nextbill', label: ta('nextBill'),
              value: detail?.nextBill ? fmtDate(detail.nextBill.date) : '—',
              sub: detail?.nextBill?.amountUsd != null ? <Ltr>{`· $${detail.nextBill.amountUsd.toFixed(2)}`}</Ltr> : undefined,
              href: detail?.oldestInvoiceId ? `/${locale}/students/${s.studentId}?pay=${detail.oldestInvoiceId}` : undefined,
              testid: 'fact-next-bill',
            },
            {
              key: 'lastpay', label: ta('lastPayment'),
              value: detail?.lastPayment ? fmtDate(detail.lastPayment.date) : ta('noneYet'),
              sub: detail?.lastPayment ? <Ltr>{`· $${detail.lastPayment.amountUsd.toFixed(2)}`}</Ltr> : undefined,
              tone: detail?.lastPayment ? undefined : (s.outstanding > 0.005 ? 'warning' : undefined),
              testid: 'fact-last-payment',
            },
          ] satisfies LifecycleFact[]}
        />
      ) : (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-gray-500" data-testid="guardian-child-no-lifecycle">
          <span>{ta('noProducts')}</span>
          {s.phone || gymName ? (
            <WhatsAppShare phone={s.phone ?? ''} testid="guardian-child-winback-wa"
              message={winbackMsg ?? ''} label={ta('winback')} />
          ) : null}
        </div>
      )}
      {/* regs count keeps its historical hook, compact. */}
      <p className="mt-1 text-[10px] text-gray-400">
        {t('registrations')}: <span data-testid="guardian-child-regs" className="font-medium text-gray-600">{s.activeRegCount}</span>
      </p>

      {/* Actions per child — reuse existing Member-360 flows (no reimplementation). */}
      <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="guardian-child-actions">
        <Link href={`/${locale}/students/${s.studentId}?pay=${detail?.oldestInvoiceId ?? '1'}`} data-testid="guardian-child-pay"
          className="inline-flex items-center gap-1 rounded-lg bg-primary-700 px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-800">
          <DollarSign className="h-3.5 w-3.5" />{t('recordPayment')}
        </Link>
        <Link href={`/${locale}/students/${s.studentId}?register=1`} data-testid="guardian-child-register"
          className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
          <CalendarDays className="h-3.5 w-3.5" />{t('register')}
        </Link>
        <Link href={`/${locale}/students/${s.studentId}`} data-testid="guardian-child-open"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
          {t('viewMember')}<NavChevron className="h-3.5 w-3.5 text-primary-600" />
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

  // ══ MEMBER-360-ACTIONABLE §4 — the family altitude: STAFF-ONLY billing
  //    decomposition (separate read from the portal-shared summaries). ══
  const ta = (await getTranslations('member360.actionable')) as unknown as Tr
  const tAging = (await getTranslations('ownerFinances.aging')) as unknown as Tr
  const twa = (await getTranslations('whatsapp')) as unknown as Tr
  const detail = await getFamilyBillingDetail(supabase, allIds, locale)
  const { data: gymRow } = await supabase.from('gyms').select('name_ar, name_en, name_fr').eq('id', gymId).maybeSingle()
  const gymName = gymDisplayName(gymRow as any, locale)
  const fmtD = (d: string | null) => fmtDateLoc(d, locale, 'medium')

  // §4.1 strip #1 payload — every kid's open invoices, oldest-due-first family-wide.
  const collectRows: FamilyCollectRow[] = kidSummaries
    .flatMap((k) => (detail.get(k.studentId)?.openInvoices ?? []).map((inv) => ({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      childName: k.name,
      ageDays: inv.ageDays,
      bucketVariant: (inv.bucket === 'current' ? 'neutral' : inv.bucket === 'd1_30' ? 'warning' : 'danger') as FamilyCollectRow['bucketVariant'],
      bucketLabel: tAging(inv.bucket),
      balanceUsd: inv.balanceUsd,
      exchangeRate: inv.exchangeRate,
    })))
    .sort((a, b) => b.ageDays - a.ageDays)
  const familyOldestDays = collectRows.length ? collectRows[0].ageDays : 0

  // §4.1 strip #2 — the next family renewal (nearest upcoming child boundary).
  const todayIso = new Date().toISOString().slice(0, 10)
  const renewals = kidSummaries
    .filter((k) => k.cycleEnd)
    .map((k) => ({ name: k.name, date: String(k.cycleEnd).slice(0, 10) }))
    .sort((a, b) => a.date.localeCompare(b.date))
  const nextFamilyRenewal = renewals.find((r) => r.date >= todayIso) ?? renewals[0] ?? null

  // §4.1 strip #3 — family attendance: seen-within-window count + worst absentee.
  const seenCount = kidSummaries.filter((k) => k.lastSeen && daysPastDue(k.lastSeen) < ATTENTION.ABSENCE_WINBACK_DAYS).length
  const worstAbsent = kidSummaries
    .map((k) => ({ name: k.name, days: k.lastSeen ? daysPastDue(k.lastSeen) : null }))
    .sort((a, b) => (b.days ?? Number.MAX_SAFE_INTEGER) - (a.days ?? Number.MAX_SAFE_INTEGER))[0] ?? null

  // §4.3 — the family queue: same mechanical rules, child-tagged, 1-tap actions.
  const familyQueue: QueueRow[] = []
  for (const k of kidSummaries) {
    const d = detail.get(k.studentId)
    const overdueBoundary = k.cycleEnd && daysPastDue(k.cycleEnd) > 0 && (k.activeRegCount > 0 || k.membershipStateValue !== 'none')
    if (overdueBoundary) {
      familyQueue.push({
        key: `renew-${k.studentId}`, kind: 'renewal',
        chip: { label: k.name, variant: 'danger' },
        why: ta('queueRenewal', { label: '', date: fmtD(k.cycleEnd), days: daysPastDue(k.cycleEnd!) }),
        action: (
          <Link href={`/${locale}/students/${k.studentId}?pay=${d?.oldestInvoiceId ?? '1'}`} data-testid="family-queue-collect-renew"
            className="inline-flex items-center rounded-lg bg-primary-700 px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-800">
            {ta('collectRenew')}
          </Link>
        ),
      })
    }
    for (const inv of d?.openInvoices ?? []) {
      if (inv.ageDays <= ATTENTION.INVOICE_AGING_DAYS) continue
      familyQueue.push({
        key: `inv-${inv.id}`, kind: 'invoice',
        chip: { label: k.name, variant: 'warning' },
        why: <>{inv.invoiceNumber} · {ta('unpaidDays', { days: inv.ageDays })} · <Ltr>{`$${inv.balanceUsd.toFixed(2)}`}</Ltr></>,
        action: (
          <Link href={`/${locale}/students/${k.studentId}?pay=${inv.id}`} data-testid="family-queue-collect"
            className="inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
            {ta('collect')}
          </Link>
        ),
      })
    }
    const absentDays = k.lastSeen ? daysPastDue(k.lastSeen) : null
    const winback = (absentDays != null && absentDays >= ATTENTION.ABSENCE_WINBACK_DAYS) ||
      (absentDays == null && k.activeRegCount === 0 && k.membershipStateValue === 'none')
    if (winback) {
      familyQueue.push({
        key: `wb-${k.studentId}`, kind: 'winback',
        chip: { label: k.name, variant: 'info' },
        why: absentDays != null ? ta('queueWinback', { days: absentDays }) : ta('queueWinbackNever'),
        action: (gPhone || k.phone) ? (
          <WhatsAppShare phone={(k.phone ?? gPhone)!} testid="family-queue-winback-wa"
            message={twa('tmpl.winback', { name: k.name, gym: gymName })} label={ta('winback')} />
        ) : <span className="text-xs text-gray-400">{ta('winback')}</span>,
      })
    }
  }

  // §4.2 — the decomposition, owed-most first (settled rows calm at the end).
  const ledgerKids = [...kidSummaries].sort((a, b) => b.outstanding - a.outstanding)

  return (
    <div className="space-y-5" data-testid="guardian-detail" data-guardian-id={id}>
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
            {/* The family's door — invite the guardian to the portal (parent role). */}
            <InviteButton kind="parent" id={(guardian as any).profile_id} name={gName} locale={locale} phone={gPhone} />
          </div>
        </div>
      </div>

      {/* §4.1 — the family status strip: the family's three numbers. The balance
          stat IS the 1-tap door into the pre-scoped collect flow (§2.1); the other
          two drill to the dependents section. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="guardian-strip">
        <FamilyCollect
          rows={collectRows}
          familyBalance={familyOutstanding}
          oldestDays={familyOldestDays}
          locale={locale}
          statLabel={t('familyOutstanding')}
          oldestChip={familyOldestDays > 0 ? ta('oldestDays', { days: familyOldestDays }) : null}
        >
          <span data-testid="guardian-collect-family"
            className="inline-flex cursor-pointer items-center rounded-lg bg-primary-700 px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-800">
            {ta('collectFamily')}
          </span>
        </FamilyCollect>
        <Link href="#guardian-dependents" data-testid="guardian-strip-renewal"
          className="block rounded-2xl border bg-white px-4 py-3 shadow-elevation-1 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--shell-accent)]">
          <p className="text-[11px] uppercase tracking-wide text-gray-400">{ta('nextFamilyRenewal')}</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-gray-900">{nextFamilyRenewal ? fmtD(nextFamilyRenewal.date) : '—'}</p>
          {nextFamilyRenewal && (
            <p className="mt-1"><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', VARIANT_TINT.neutral)}>{nextFamilyRenewal.name}</span></p>
          )}
        </Link>
        <Link href="#guardian-dependents" data-testid="guardian-strip-attendance"
          className="block rounded-2xl border bg-white px-4 py-3 shadow-elevation-1 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--shell-accent)]">
          <p className="text-[11px] uppercase tracking-wide text-gray-400">{ta('familyAttendance')}</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-gray-900">{ta('nOfM', { n: seenCount, m: kidSummaries.length })}</p>
          {worstAbsent && (worstAbsent.days == null || worstAbsent.days >= ATTENTION.ABSENCE_WINBACK_DAYS) && (
            <p className="mt-1">
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', VARIANT_TINT.warning)}>
                {worstAbsent.days != null ? ta('absentDays', { name: worstAbsent.name, days: worstAbsent.days }) : ta('absentNever', { name: worstAbsent.name })}
              </span>
            </p>
          )}
        </Link>
      </div>

      {/* §4.2 — balance decomposition: who owes what, oldest first; the Driver
          column is the sentence staff say out loud. Settled renders calm-neutral. */}
      {kidSummaries.length > 0 && (
        <section className="rounded-2xl border bg-white p-4 shadow-sm" data-testid="guardian-ledger">
          <h2 className={cn('mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
            <DollarSign className="h-4 w-4 text-primary-600" />{ta('decompositionTitle')}
          </h2>
          <ul className="divide-y">
            {ledgerKids.map((k) => {
              const d = detail.get(k.studentId)
              const owes = k.outstanding > 0.005
              return (
                <li key={k.studentId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm" data-testid="family-ledger-row" data-student-id={k.studentId}>
                  <span className="min-w-[6rem] font-medium text-gray-800">{k.name}</span>
                  {owes ? (
                    <span className="font-semibold tabular-nums text-danger-600"><Ltr>{`$${k.outstanding.toFixed(2)}`}</Ltr></span>
                  ) : (
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', VARIANT_TINT.neutral)}>{t('settled')}</span>
                  )}
                  {owes && d && d.oldestDays > 0 && (
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', VARIANT_TINT[d.oldestDays > 30 ? 'danger' : 'warning'])}>
                      {ta('daysOld', { days: d.oldestDays })}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs text-gray-500">{owes ? d?.driver : ta('noOpenInvoices')}</span>
                  {owes && (
                    <Link href={`/${locale}/students/${k.studentId}?pay=${d?.oldestInvoiceId ?? '1'}`} data-testid="family-ledger-collect"
                      className="inline-flex items-center rounded-lg bg-primary-700 px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary-800">
                      {ta('collect')}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* §4.3 — the family needs-attention queue (child-tagged, absent when empty). */}
      <AttentionQueue rows={familyQueue} testid="guardian-attention" />

      {/* Dependents */}
      <section className="space-y-3 scroll-mt-4" id="guardian-dependents">
        <h2 className={cn('flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
          <Users className="h-4 w-4 text-primary-600" />{t('dependentsHeading')}
        </h2>
        {kidSummaries.length === 0 ? (
          <p className="rounded-2xl border bg-white p-6 text-center text-sm text-gray-400" data-testid="guardian-no-dependents">{t('noDependents')}</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {kidSummaries.map((s) => <ChildCard key={s.studentId} s={s} locale={locale} t={t} ta={ta} tb={tb} isRTL={isRTL} detail={detail.get(s.studentId)} gymName={gymName} winbackMsg={twa('tmpl.winback', { name: s.name, gym: gymName })} />)}
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
            <ChildCard s={ownSummary} self locale={locale} t={t} ta={ta} tb={tb} isRTL={isRTL} detail={detail.get(ownSummary.studentId)} gymName={gymName} />
          </div>
        </section>
      )}
    </div>
  )
}
