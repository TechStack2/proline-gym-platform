import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { localizedName, one } from '@/lib/names'
import { balanceUsd, STATUS_BADGE, statusLabel, METHOD_LABEL } from '@/lib/billing/reconcile'
import {
  User, Phone, Award, CreditCard, CalendarDays, Dumbbell, ClipboardList,
  DollarSign, ChevronRight, Users,
} from 'lucide-react'
import { GuardianPanel, type GuardianRow } from './guardian-panel'
import { AvatarUpload } from '@/components/shared/avatar-upload'
import { PromotePanel } from './promote-panel'
import { MemberActions, type OpenInvoice, type PickableClass } from './member-actions'

export const dynamic = 'force-dynamic'

type Props = { params: { locale: string; id: string }; searchParams: { pay?: string } }

/**
 * Member-360 (IA-2) — THE member file. Replaces the husk that passed
 * memberships={[]} / beltProgressions={[]} hardcoded (and ordered attendance by
 * a non-existent `date` column, so even that panel rendered empty). Every panel
 * below reads live data through existing tables/RLS; every action is a link
 * into an existing verified flow. B3 (household), D2 (freeze/upgrade) and D3
 * (dunning) land on this surface next — panels keep a clean actions area.
 */
export default async function Member360Page({ params: { locale, id }, searchParams }: Props) {
  const isRTL = locale === 'ar'
  const t = await getTranslations('member360')
  const supabase = await createClient()

  const { data: student } = await supabase
    .from('students')
    .select(`*, profiles!inner (id, first_name_ar, first_name_en, first_name_fr,
      last_name_ar, last_name_en, last_name_fr, phone, gender, date_of_birth, avatar_url)`)
    .eq('id', id)
    .maybeSingle()
  if (!student) notFound()

  const [
    { data: guardianLinks },
    { data: memberships },
    { data: registrations },
    { data: ptAssignments },
    { data: ptSessions },
    { data: invoices },
    { data: payments },
    { data: attendance },
    { count: attendance30 },
    { data: beltPromotions },
  ] = await Promise.all([
    supabase
      .from('guardian_students')
      .select(`id, guardians:guardian_id (id, relationship_ar, relationship_en, relationship_fr,
        profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone))`)
      .eq('student_id', id),
    supabase
      .from('student_memberships')
      .select('id, start_date, end_date, status, membership_plans:plan_id (name_ar, name_en, name_fr, price_usd)')
      .eq('student_id', id)
      .order('start_date', { ascending: false })
      .limit(5),
    supabase
      .from('class_registrations')
      .select('id, status, waitlist_position, monthly_fee_usd, discount_pct, discount_amount_usd, start_date, end_date, requested_at, classes:class_id (name_ar, name_en, name_fr)')
      .eq('student_id', id)
      .order('requested_at', { ascending: false })
      .limit(10),
    supabase
      .from('pt_assignments')
      .select('id, status, sessions_total, sessions_used, sessions_remaining, purchased_at, expires_at, is_active, pt_packages:package_id (name_ar, name_en, name_fr, validity_days)')
      .eq('student_id', id)
      .order('purchased_at', { ascending: false })
      .limit(5),
    supabase
      .from('pt_sessions')
      .select('id, scheduled_at, status')
      .eq('student_id', id)
      .order('scheduled_at', { ascending: false })
      .limit(5),
    supabase
      .from('invoices')
      .select(`id, invoice_number, invoice_type, total_usd, status, due_date, created_at, payer_profile_id,
        payer:profiles!invoices_payer_profile_id_fkey (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)`)
      .eq('student_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('payments')
      .select('id, invoice_id, amount_usd, amount_lbp, payment_method, payment_date, reference_number')
      .eq('student_id', id)
      .order('payment_date', { ascending: false })
      .limit(10),
    supabase
      .from('attendance_records')
      .select('id, attendance_date, status, classes:class_id (name_ar, name_en, name_fr)')
      .eq('student_id', id)
      .order('attendance_date', { ascending: false })
      .limit(10),
    supabase
      .from('attendance_records')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', id)
      .gte('attendance_date', new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)),
    supabase
      .from('belt_promotions')
      .select('id, from_rank, to_rank, promotion_date, disciplines:discipline_id (name_ar, name_en, name_fr)')
      .eq('student_id', id)
      .order('promotion_date', { ascending: false })
      .limit(10),
  ])

  // Reconcile invoice balances from this member's payments (D1 canon: Σ amount_usd).
  const paidByInvoice = new Map<string, number>()
  for (const p of (payments ?? []) as any[]) {
    if (p.invoice_id) paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount_usd ?? 0))
  }

  // B3: structured guardian rows for the panel + the household view when this
  // member is themselves a guardian (their kids + invoices they're payer on).
  const guardianRows: GuardianRow[] = (guardianLinks ?? []).map((g: any) => {
    const guard = one(g.guardians)
    const rel = (isRTL ? guard?.relationship_ar : locale === 'fr' ? guard?.relationship_fr : guard?.relationship_en) || null
    return {
      linkId: g.id,
      guardianId: guard?.id,
      name: localizedName(one(guard?.profiles), locale),
      phone: one(guard?.profiles)?.phone ?? null,
      relationship: rel,
    }
  })

  const profileId = (student as any).profile_id
  const { data: ownGuardian } = await supabase
    .from('guardians').select('id').eq('profile_id', profileId).maybeSingle()
  let householdKids: { id: string; name: string }[] = []
  let payerInvoices: any[] = []
  if (ownGuardian) {
    const { data: kidLinks } = await supabase
      .from('guardian_students')
      .select('students:student_id (id, profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr))')
      .eq('guardian_id', ownGuardian.id)
    householdKids = (kidLinks ?? [])
      .map((l: any) => { const st = one(l.students); return st ? { id: st.id, name: localizedName(one(st.profiles), locale) } : null })
      .filter(Boolean) as { id: string; name: string }[]
    const { data: pInv } = await supabase
      .from('invoices')
      .select(`id, invoice_number, total_usd, status, created_at, student_id,
        students (profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr))`)
      .eq('payer_profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(15)
    payerInvoices = pInv ?? []
  }

  // ADM-2: promote-from-the-member-file inputs — active disciplines, their
  // ladders, and active coaches (the RPC requires a coach).
  const gymIdForPromote = (student as any).gym_id
  const [{ data: promoDisciplines }, { data: promoCoachRows }] = await Promise.all([
    supabase.from('disciplines').select('id, name_ar, name_en, name_fr')
      .eq('gym_id', gymIdForPromote).eq('is_active', true).order('sort_order'),
    supabase.from('coaches')
      .select('id, profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)')
      .eq('gym_id', gymIdForPromote).eq('is_active', true).is('deleted_at', null),
  ])
  const promoDiscIds = (promoDisciplines ?? []).map((d: any) => d.id)
  const { data: promoHierarchies } = promoDiscIds.length
    ? await supabase.from('belt_hierarchies')
        .select('id, discipline_id, rank, name_ar, name_en, name_fr, sort_order')
        .in('discipline_id', promoDiscIds)
        .order('sort_order')
    : { data: [] as any[] }
  const promoteCoaches = (promoCoachRows ?? []).map((c: any) => ({ id: c.id, name: localizedName(one(c.profiles), locale) })).filter((c) => c.name)

  // FD-1: member-contextual action inputs — active classes (register modal) and
  // the member's OPEN invoices with exact balances (record-payment modal; the
  // page-level payments fetch is limit-10, so reconcile these separately).
  const { data: pickableClasses } = await supabase
    .from('classes')
    .select('id, name_ar, name_en, name_fr, monthly_fee_usd, max_capacity')
    .eq('gym_id', gymIdForPromote)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name_en')
  // Fetched DIRECTLY (not derived from the limit-10 display list — an older
  // open invoice, e.g. one due today, must not fall out of the modal). Oldest
  // due first = the pre-selection.
  const { data: openInvRows } = await supabase
    .from('invoices')
    .select('id, invoice_number, total_usd, status, due_date, exchange_rate')
    .eq('student_id', id)
    .in('status', ['pending', 'partial', 'overdue'])
    .order('due_date', { ascending: true, nullsFirst: false })
  const { data: openPays } = (openInvRows ?? []).length
    ? await supabase.from('payments').select('invoice_id, amount_usd').in('invoice_id', (openInvRows ?? []).map((i: any) => i.id))
    : { data: [] as any[] }
  const openPaidBy = new Map<string, number>()
  for (const p of openPays ?? []) openPaidBy.set(p.invoice_id, (openPaidBy.get(p.invoice_id) ?? 0) + Number(p.amount_usd ?? 0))
  const openInvoices: OpenInvoice[] = ((openInvRows ?? []) as any[])
    .map((i) => ({
      id: i.id,
      invoice_number: i.invoice_number,
      balance_usd: balanceUsd(i.total_usd, [{ amount_usd: openPaidBy.get(i.id) ?? 0 }]),
      exchange_rate: i.exchange_rate ?? null,
    }))
    .filter((i) => i.balance_usd > 0)

  const prof: any = one((student as any).profiles)
  const name = localizedName(prof, locale)
  const age = prof?.date_of_birth ? Math.floor((Date.now() - new Date(prof.date_of_birth).getTime()) / (365.25 * 864e5)) : null
  const lname = (row: any) => ((isRTL ? row?.name_ar : locale === 'fr' ? row?.name_fr : row?.name_en) || row?.name_en || '')
  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString(isRTL ? 'ar-LB' : 'en-US') : '—')
  const beltLabel = (r: string | null) => (r ? r.replace(/_/g, ' ') : '—')
  const ptActive = (ptAssignments ?? []).filter((a: any) => a.is_active && a.status === 'active')
  const ptRemaining = ptActive.reduce((s: number, a: any) => s + (a.sessions_remaining ?? 0), 0)

  const regBadge: Record<string, string> = {
    active: 'bg-green-100 text-green-700', requested: 'bg-yellow-100 text-yellow-700',
    waitlisted: 'bg-orange-100 text-orange-700', cancelled: 'bg-gray-100 text-gray-500',
    rejected: 'bg-red-100 text-red-600', expired: 'bg-gray-100 text-gray-500',
  }

  const Panel = ({ icon: Icon, title, testid, id: anchorId, children }: { icon: any; title: string; testid: string; id?: string; children: React.ReactNode }) => (
    <section id={anchorId} className="scroll-mt-4 rounded-2xl border bg-white p-4 shadow-sm" data-testid={testid}>
      <h2 className={cn('mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
        <Icon className="h-4 w-4 text-primary-600" /> {title}
      </h2>
      {children}
    </section>
  )
  const Empty = ({ text }: { text: string }) => <p className="py-3 text-center text-sm text-gray-400">{text}</p>

  return (
    <div className={cn('space-y-4 p-4 md:p-0', isRTL && 'rtl text-right')} data-testid="member-360">
      {/* ── Header: identity + belt + guardians ── */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <AvatarUpload
              gymId={(student as any).gym_id}
              profileId={prof?.id}
              name={name}
              currentUrl={prof?.avatar_url}
              size="lg"
              locale={locale}
            />
            <div>
              <h1 className={cn('text-xl font-bold text-gray-900', isRTL && 'font-arabic')} data-testid="member-name">{name}</h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                {prof?.phone && <span dir="ltr" className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{prof.phone}</span>}
                {age != null && <span>{t('age', { age })}</span>}
                <span className="inline-flex items-center gap-1 capitalize"><Award className="h-3 w-3" />{beltLabel(student.current_belt_rank)}</span>
                <span className={cn('rounded-full px-2 py-0.5 font-medium', student.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                  {student.is_active ? t('active') : t('inactive')}
                </span>
              </p>
              {(guardianLinks ?? []).length > 0 && (
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500" data-testid="member-guardians">
                  <Users className="h-3 w-3" />
                  {(guardianLinks ?? []).map((g: any) => {
                    const guard = one(g.guardians)
                    const rel = (isRTL ? guard?.relationship_ar : locale === 'fr' ? guard?.relationship_fr : guard?.relationship_en) || ''
                    return <span key={guard?.id}>{localizedName(one(guard?.profiles), locale)}{rel ? ` (${rel})` : ''}</span>
                  })}
                </p>
              )}
            </div>
          </div>
          {/* FD-1: member-contextual quick actions — modals pre-filled with THIS
              member; the old pills navigated to GLOBAL pages (/classes — the
              create-a-class page! — /payments/new, /pt) and dropped the member. */}
          <MemberActions
            studentId={id}
            memberName={name}
            classes={(pickableClasses ?? []) as PickableClass[]}
            openInvoices={openInvoices}
            locale={locale}
            autoPay={searchParams?.pay === '1'}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── 1. Membership ── */}
        <Panel icon={CreditCard} title={t('membership')} testid="panel-membership">
          {(memberships ?? []).length === 0 ? <Empty text={t('noMembership')} /> : (
            <ul className="space-y-2">
              {(memberships ?? []).map((m: any) => (
                <li key={m.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium text-gray-800">{lname(one(m.membership_plans))}</p>
                    <p className="text-xs text-gray-500">{fmtDate(m.start_date)} → {fmtDate(m.end_date)}</p>
                  </div>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                    m.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>{m.status}</span>
                </li>
              ))}
            </ul>
          )}
          {/* D2 freeze/upgrade actions land here */}
          <div data-testid="membership-actions" className="mt-2" />
        </Panel>

        {/* ── 2. Class registrations ── */}
        <Panel icon={CalendarDays} title={t('registrations')} testid="panel-registrations">
          {(registrations ?? []).length === 0 ? <Empty text={t('noRegistrations')} /> : (
            <ul className="space-y-2">
              {(registrations ?? []).map((r: any) => (
                <li key={r.id} className="flex items-center justify-between text-sm" data-testid="member-reg-row" data-status={r.status}>
                  <div>
                    <p className="font-medium text-gray-800">{lname(one(r.classes))}</p>
                    <p className="text-xs text-gray-500">
                      {r.monthly_fee_usd != null ? `$${Number(r.monthly_fee_usd).toFixed(0)}/${t('mo')}` : ''}
                      {Number(r.discount_pct) > 0 ? ` · −${Number(r.discount_pct)}%` : ''}
                      {Number(r.discount_amount_usd) > 0 ? ` · −$${Number(r.discount_amount_usd).toFixed(0)}` : ''}
                      {r.status === 'waitlisted' && r.waitlist_position ? ` · #${r.waitlist_position}` : ''}
                    </p>
                  </div>
                  {r.status === 'requested' ? (
                    <Link href={`/${locale}/inbox`} className={cn('rounded-full px-2 py-0.5 text-xs font-medium underline-offset-2 hover:underline', regBadge[r.status])}>
                      {t('pendingInbox')}
                    </Link>
                  ) : (
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', regBadge[r.status] || 'bg-gray-100 text-gray-500')}>{r.status}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* ── 3. PT ── the file's own PT cockpit (the header pill anchors here).
            DOCKING SLOT: PT-1 “sell package” + PT-2 “book session” actions mount
            in this panel (per the approved PT-360 §3.1 package cards). */}
        <Panel icon={Dumbbell} title={t('pt')} testid="panel-pt" id="panel-pt">
          {(ptAssignments ?? []).length === 0 ? <Empty text={t('noPt')} /> : (
            <ul className="space-y-2">
              {(ptAssignments ?? []).map((a: any) => (
                <li key={a.id} className="flex items-center justify-between text-sm" data-testid="member-pt-row" data-status={a.status}>
                  <div>
                    <p className="font-medium text-gray-800">{lname(one(a.pt_packages))}</p>
                    <p className="text-xs text-gray-500">
                      {a.expires_at ? `${t('validUntil')} ${fmtDate(a.expires_at)}` : t('noExpiry')}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-gray-900" data-testid="pt-remaining">
                    {a.sessions_remaining}/{a.sessions_total} <span className="text-xs font-normal text-gray-500">{t('left')}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {(ptSessions ?? []).length > 0 && (
            <div className="mt-3 border-t pt-2">
              <p className="mb-1 text-xs font-medium text-gray-500">{t('recentSessions')}</p>
              <ul className="space-y-1">
                {(ptSessions ?? []).map((s: any) => (
                  <li key={s.id} className="flex items-center justify-between text-xs text-gray-600">
                    <span>{fmtDate(s.scheduled_at)}</span>
                    <span className="capitalize">{s.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        {/* ── 4. Billing ── */}
        <Panel icon={DollarSign} title={t('billing')} testid="panel-billing">
          {(invoices ?? []).length === 0 ? <Empty text={t('noInvoices')} /> : (
            <ul className="space-y-2">
              {(invoices ?? []).map((inv: any) => {
                const bal = balanceUsd(inv.total_usd, [{ amount_usd: paidByInvoice.get(inv.id) ?? 0 }])
                return (
                  <li key={inv.id} className="flex items-center justify-between gap-2 text-sm" data-testid="member-invoice-row" data-status={inv.status} data-type={inv.invoice_type}>
                    <span className="flex flex-col">
                      <Link href={`/${locale}/invoices/${inv.id}`} className="font-mono text-xs font-medium text-[#cd1419] hover:underline">
                        {inv.invoice_number}
                      </Link>
                      {inv.payer_profile_id && inv.payer_profile_id !== profileId && (
                        <span className="text-[10px] text-gray-400" data-testid="invoice-payer">
                          {t('payer')}: {localizedName(one(inv.payer), locale)}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-gray-500">${Number(inv.total_usd).toFixed(2)}{bal > 0 ? ` · ${t('due')} $${bal.toFixed(2)}` : ''}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_BADGE[inv.status])}>{statusLabel(inv.status, locale)}</span>
                  </li>
                )
              })}
            </ul>
          )}
          {(payments ?? []).length > 0 && (
            <div className="mt-3 border-t pt-2">
              <p className="mb-1 text-xs font-medium text-gray-500">{t('payments')}</p>
              <ul className="space-y-1">
                {(payments ?? []).map((p: any) => (
                  <li key={p.id} className="flex items-center justify-between text-xs text-gray-600" data-testid="member-payment-row">
                    <span>{fmtDate(p.payment_date)} · {(isRTL ? METHOD_LABEL[p.payment_method]?.ar : METHOD_LABEL[p.payment_method]?.en) || p.payment_method}</span>
                    <span className="font-medium">${Number(p.amount_usd).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-3">
            <Link href={`/${locale}/money?tab=invoices&search=${encodeURIComponent(name)}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
              {t('openMoney')} <ChevronRight className={cn('h-3 w-3', isRTL && 'rotate-180')} />
            </Link>
          </div>
        </Panel>

        {/* ── 5. Attendance ── */}
        <Panel icon={ClipboardList} title={`${t('attendance')} · ${t('last30', { count: attendance30 ?? 0 })}`} testid="panel-attendance">
          {(attendance ?? []).length === 0 ? <Empty text={t('noAttendance')} /> : (
            <ul className="space-y-1">
              {(attendance ?? []).map((a: any) => (
                <li key={a.id} className="flex items-center justify-between text-xs text-gray-600">
                  <span>{fmtDate(a.attendance_date)} · {lname(one(a.classes))}</span>
                  <span className="capitalize">{a.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* ── 6. Belt progress ── */}
        <Panel icon={Award} title={t('beltProgress')} testid="panel-belts">
          <p className="mb-2 text-sm text-gray-700 capitalize">
            {t('currentRank')}: <span className="font-semibold">{beltLabel(student.current_belt_rank)}</span>
          </p>
          {(beltPromotions ?? []).length === 0 ? <Empty text={t('noPromotions')} /> : (
            <ul className="space-y-1">
              {(beltPromotions ?? []).map((b: any) => (
                <li key={b.id} className="flex items-center justify-between text-xs text-gray-600" data-testid="member-belt-row">
                  <span className="capitalize">{beltLabel(b.from_rank)} → <span className="font-medium">{beltLabel(b.to_rank)}</span> · {lname(one(b.disciplines))}</span>
                  <span>{fmtDate(b.promotion_date)}</span>
                </li>
              ))}
            </ul>
          )}
          <PromotePanel
            studentId={id}
            currentRank={student.current_belt_rank}
            disciplines={(promoDisciplines ?? []) as any}
            hierarchies={(promoHierarchies ?? []) as any}
            coaches={promoteCoaches}
            locale={locale}
          />
        </Panel>
        {/* ── 7. Guardians (B3) ── */}
        <GuardianPanel studentId={id} gymId={(student as any).gym_id} guardians={guardianRows} locale={locale} />

        {/* ── 8. Household (this member is a guardian) ── */}
        {ownGuardian && (
          <section className="rounded-2xl border bg-white p-4 shadow-sm" data-testid="panel-household">
            <h2 className={cn('mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
              <Users className="h-4 w-4 text-primary-600" /> {t('household')}
            </h2>
            <p className="mb-2 text-xs text-gray-500">
              {householdKids.map((k) => (
                <Link key={k.id} href={`/${locale}/students/${k.id}`} className="mr-2 text-primary-600 hover:underline">{k.name}</Link>
              ))}
            </p>
            {payerInvoices.length === 0 ? (
              <p className="py-2 text-center text-sm text-gray-400">{t('noHouseholdInvoices')}</p>
            ) : (
              <ul className="space-y-1.5">
                {payerInvoices.map((inv: any) => (
                  <li key={inv.id} className="flex items-center justify-between text-xs" data-testid="household-payer-row">
                    <Link href={`/${locale}/invoices/${inv.id}`} className="font-mono text-[#cd1419] hover:underline">{inv.invoice_number}</Link>
                    <span className="text-gray-500">{localizedName(one(one(inv.students)?.profiles), locale)}</span>
                    <span className={cn('rounded-full px-2 py-0.5 font-medium', STATUS_BADGE[inv.status])}>{statusLabel(inv.status, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {ptActive.length > 0 && (
        <p className="text-xs text-gray-400" data-testid="member-pt-total-remaining">
          {t('ptTotals', { remaining: ptRemaining })}
        </p>
      )}
    </div>
  )
}
