import { dateLocale } from '@/lib/utils/locale-format'
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
import { MemberActions, type OpenInvoice, type PickableCamp, type PickableClass } from './member-actions'
import { MemberPortalAccess } from './member-portal-access'
import { MemberPtPanel, type SellableCoach, type SellableType } from './pt-panel-client'
import { MembershipCard, type MembershipCardData, type PlanOption } from './membership-card'
import { getEnabledProducts } from '@/lib/gym/products'
import { registrationState } from '@/lib/lifecycle/status'
import { STATUS_BADGE as INV_BADGE } from '@/lib/billing/reconcile'
import { getWaiverContext } from '@/lib/waivers/server'
import { waiverTitle, waiverBody } from '@/lib/waivers/status'
import { WaiverSign, WaiverChip } from '@/components/shared/waiver-sign'

export const dynamic = 'force-dynamic'

type Props = { params: { locale: string; id: string }; searchParams: { pay?: string; sellpt?: string } }

// FORM-FOCUS-SWEEP: hoisted to module scope (stable type) — was defined during render.
const Panel = ({ isRTL, icon: Icon, title, testid, id: anchorId, children }: { isRTL: boolean; icon: any; title: string; testid: string; id?: string; children: React.ReactNode }) => (
  <section id={anchorId} className="scroll-mt-4 rounded-2xl border bg-white p-4 shadow-sm" data-testid={testid}>
    <h2 className={cn('mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
      <Icon className="h-4 w-4 text-primary-600" /> {title}
    </h2>
    {children}
  </section>
)
// FORM-FOCUS-SWEEP: hoisted to module scope (stable type) — was defined during render.
const Empty = ({ text }: { text: string }) => <p className="py-3 text-center text-sm text-gray-400">{text}</p>

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
        profiles:profile_id (id, first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone))`)
      .eq('student_id', id),
    supabase
      .from('student_memberships')
      .select(`id, start_date, end_date, status, pause_start_date, pause_end_date, pending_plan_id,
        membership_plans:plan_id (name_ar, name_en, name_fr, price_usd),
        pending_plan:membership_plans!student_memberships_pending_plan_id_fkey (name_ar, name_en, name_fr)`)
      .eq('student_id', id)
      .order('end_date', { ascending: false })
      .limit(5),
    supabase
      .from('class_registrations')
      .select('id, status, waitlist_position, monthly_fee_usd, discount_pct, discount_amount_usd, start_date, end_date, paid_until, requested_at, classes:class_id (name_ar, name_en, name_fr, disciplines:discipline_id (name_ar, name_en, name_fr), class_schedules (day_of_week, start_time, end_time, is_active))')
      .eq('student_id', id)
      .order('requested_at', { ascending: false })
      .limit(10),
    supabase
      .from('pt_assignments')
      .select(`id, status, sessions_total, sessions_used, sessions_remaining, purchased_at, expires_at, is_active, invoice_id,
        pt_packages:package_id (name_ar, name_en, name_fr, validity_days, disciplines:discipline_id (name_ar, name_en, name_fr)),
        coaches:coach_id (id, profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, avatar_url))`)
      .eq('student_id', id)
      .order('purchased_at', { ascending: false, nullsFirst: false })
      .limit(10),
    supabase
      .from('pt_sessions')
      .select('id, assignment_id, scheduled_at, status')
      .eq('student_id', id)
      .order('scheduled_at', { ascending: false })
      .limit(40),
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
      profileId: one(guard?.profiles)?.id,
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
  // NO-MEMBERSHIP: hide the membership panel on gyms that don't sell membership.
  const enabledProducts = await getEnabledProducts(supabase, gymIdForPromote)
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
        .eq('is_active', true) // UX-2: archived ladder ranks are not promotion targets
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

  // ── PT-1: package-first panel data — catalog types, sellable coaches, the
  //    member's package cards (invoice state fetched DIRECTLY, never windowed),
  //    sessions grouped under their package. ──
  const [{ data: ptTypes }, { data: sellCoachRows }] = await Promise.all([
    supabase.from('pt_packages')
      .select('id, name_ar, name_en, name_fr, session_count, price_usd, validity_days, discipline_id, disciplines:discipline_id (name_en)')
      .eq('gym_id', gymIdForPromote).eq('is_active', true).is('deleted_at', null)
      .order('session_count'),
    supabase.from('coaches')
      .select('id, specialization_en, profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, avatar_url)')
      .eq('gym_id', gymIdForPromote).eq('is_active', true).is('deleted_at', null),
  ])
  const ptInvoiceIds = (ptAssignments ?? []).map((a: any) => a.invoice_id).filter(Boolean)
  const { data: ptInvoices } = ptInvoiceIds.length
    ? await supabase.from('invoices').select('id, invoice_number, status').in('id', ptInvoiceIds)
    : { data: [] as any[] }
  const ptInvBy = new Map((ptInvoices ?? []).map((i: any) => [i.id, i]))
  const ptSessionsByAssignment = new Map<string, any[]>()
  let ptUnlinked = 0
  for (const sRow of (ptSessions ?? []) as any[]) {
    if (!sRow.assignment_id) { ptUnlinked++; continue }
    const list = ptSessionsByAssignment.get(sRow.assignment_id) ?? []
    list.push(sRow)
    ptSessionsByAssignment.set(sRow.assignment_id, list)
  }
  const sellableTypes: SellableType[] = ((ptTypes ?? []) as any[]).map((x) => ({
    id: x.id, name_ar: x.name_ar, name_en: x.name_en, name_fr: x.name_fr,
    session_count: x.session_count, price_usd: Number(x.price_usd),
    validity_days: x.validity_days, discipline_id: x.discipline_id,
    discipline_name_en: one(x.disciplines)?.name_en ?? null,
  }))
  const sellableCoaches: SellableCoach[] = ((sellCoachRows ?? []) as any[])
    .map((c) => ({
      id: c.id,
      name: localizedName(one(c.profiles), locale),
      avatarUrl: one(c.profiles)?.avatar_url ?? null,
      specializationEn: c.specialization_en ?? null,
    }))
    .filter((c) => c.name)

  // E1: open camps for the register-to-camp modal (spots via the definer fn).
  const { data: campRows } = await supabase
    .from('camps')
    .select('id, name_ar, name_en, name_fr, start_date, end_date, price_usd, min_age, max_age, status')
    .eq('gym_id', gymIdForPromote)
    .is('deleted_at', null)
    .in('status', ['open', 'in_progress', 'full'])
    .gte('end_date', new Date().toISOString().slice(0, 10))
    .order('start_date')
  const pickableCamps: PickableCamp[] = await Promise.all(
    ((campRows ?? []) as any[]).map(async (c) => {
      const { data: spots } = await supabase.rpc('get_camp_spots_left', { p_camp_id: c.id })
      return { ...c, price_usd: Number(c.price_usd), spots: (spots as number | null) ?? 0 }
    }),
  )

  // ── ML-1: membership cards (read-time states) + policy + plans + freezes ──
  const { data: gymPolicy } = await supabase
    .from('gyms')
    .select('renewal_lead_days, dunning_grace_days, freeze_max_days_year, freeze_min_chunk_days')
    .eq('id', gymIdForPromote)
    .single()
  const { data: planRows } = await supabase
    .from('membership_plans')
    .select('id, name_ar, name_en, name_fr, price_usd, duration_days')
    .eq('gym_id', gymIdForPromote).eq('is_active', true)
    .order('price_usd')
  const msIds = (memberships ?? []).map((m: any) => m.id)
  const [{ data: openRenewals }, { data: freezeRows }] = msIds.length
    ? await Promise.all([
        supabase.from('renewal_invoices')
          .select('product_id, invoices:invoice_id!inner (status)')
          .eq('product_type', 'membership').in('product_id', msIds),
        supabase.from('membership_freezes')
          .select('membership_id, days_frozen, start_date')
          .in('membership_id', msIds),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }]
  const renewalOpenSet = new Set(
    ((openRenewals ?? []) as any[])
      .filter((r) => ['pending', 'partial', 'overdue'].includes(one(r.invoices)?.status))
      .map((r) => r.product_id),
  )
  const thisYear = new Date().getFullYear()
  const freezeUsedBy = new Map<string, number>()
  for (const f of (freezeRows ?? []) as any[]) {
    if (new Date(f.start_date).getFullYear() !== thisYear) continue
    freezeUsedBy.set(f.membership_id, (freezeUsedBy.get(f.membership_id) ?? 0) + (f.days_frozen ?? 0))
  }

  // F3: waiver status for this member (active template + signing state + the
  // signed artifact/signer, staff-only — surfaces who signed for guardian proof).
  const waiver = await getWaiverContext(supabase, id, gymIdForPromote, { locale, includeArtifact: true })

  const prof: any = one((student as any).profiles)
  const name = localizedName(prof, locale)
  const age = prof?.date_of_birth ? Math.floor((Date.now() - new Date(prof.date_of_birth).getTime()) / (365.25 * 864e5)) : null
  const lname = (row: any) => ((isRTL ? row?.name_ar : locale === 'fr' ? row?.name_fr : row?.name_en) || row?.name_en || '')
  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString(dateLocale(locale)) : '—')
  const beltLabel = (r: string | null) => (r ? r.replace(/_/g, ' ') : '—')
  // MEMBER-ENRICH: format an enrolled class's weekly schedule (day(s) · time).
  const DOW: Record<string, string[]> = {
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    fr: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
    ar: ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'],
  }
  const fmtSchedule = (cls: any): string => {
    const scheds = ((one(cls) as any)?.class_schedules ?? []).filter((s: any) => s.is_active)
    if (!scheds.length) return ''
    const days = [...new Set(scheds.map((s: any) => (DOW[locale] ?? DOW.en)[s.day_of_week] ?? '?'))].join('/')
    const time = (scheds[0].start_time ?? '').slice(0, 5)
    return time ? `${days} · ${time}` : days
  }
  const ptActive = (ptAssignments ?? []).filter((a: any) => a.is_active && a.status === 'active')
  const ptRemaining = ptActive.reduce((s: number, a: any) => s + (a.sessions_remaining ?? 0), 0)

  const ptCards = ((ptAssignments ?? []) as any[]).map((a) => {
    const pkg = one(a.pt_packages)
    const inv: any = a.invoice_id ? ptInvBy.get(a.invoice_id) : null
    return {
      id: a.id,
      status: a.status,
      sessionsTotal: a.sessions_total ?? 0,
      sessionsRemaining: a.sessions_remaining ?? 0,
      expiresAt: a.expires_at,
      packageName: lname(pkg),
      disciplineName: pkg ? lname(one((pkg as any).disciplines)) || null : null,
      coachName: localizedName(one(one(a.coaches)?.profiles), locale) || null,
      coachAvatarUrl: one(one(a.coaches)?.profiles)?.avatar_url ?? null,
      invoiceHref: inv ? `/${locale}/invoices/${inv.id}` : null,
      invoiceNumber: inv?.invoice_number ?? null,
      invoiceStatusLabel: inv ? statusLabel(inv.status, locale) : null,
      invoiceStatusClass: inv ? INV_BADGE[inv.status] : null,
      sessions: (ptSessionsByAssignment.get(a.id) ?? []).map((sRow: any) => ({
        id: sRow.id, scheduledAt: sRow.scheduled_at, status: sRow.status,
      })),
    }
  })

  const membershipCards: MembershipCardData[] = ((memberships ?? []) as any[])
    .filter((m) => m.status !== 'cancelled')
    .map((m) => ({
      id: m.id,
      status: m.status,
      start_date: m.start_date,
      end_date: m.end_date,
      pause_end_date: m.pause_end_date,
      planName: lname(one(m.membership_plans)),
      pendingPlanName: m.pending_plan_id ? lname(one(m.pending_plan)) || null : null,
      renewalOpen: renewalOpenSet.has(m.id),
    }))
  const planOptions: PlanOption[] = ((planRows ?? []) as any[]).map((p) => ({
    id: p.id, name: lname(p), price: Number(p.price_usd), durationDays: p.duration_days,
  }))
  const lcPolicy = {
    renewal_lead_days: (gymPolicy as any)?.renewal_lead_days ?? 7,
    dunning_grace_days: (gymPolicy as any)?.dunning_grace_days ?? 7,
    freeze_max_days_year: (gymPolicy as any)?.freeze_max_days_year ?? 30,
    freeze_min_chunk_days: (gymPolicy as any)?.freeze_min_chunk_days ?? 7,
  }

  const regBadge: Record<string, string> = {
    active: 'bg-green-100 text-green-700', requested: 'bg-yellow-100 text-yellow-700',
    waitlisted: 'bg-orange-100 text-orange-700', cancelled: 'bg-gray-100 text-gray-500',
    rejected: 'bg-red-100 text-red-600', expired: 'bg-gray-100 text-gray-500',
    suspended: 'bg-red-50 text-red-600',
  }

  return (
    <div className={cn('space-y-4', isRTL && 'rtl text-right')} data-testid="member-360">
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
              <h1 className={cn('text-2xl font-bold text-gray-900', isRTL && 'font-arabic')} data-testid="member-name">{name}</h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                {prof?.phone && <span dir="ltr" className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{prof.phone}</span>}
                {age != null && <span>{t('age', { age })}</span>}
                <span className="inline-flex items-center gap-1 capitalize"><Award className="h-3 w-3" />{beltLabel(student.current_belt_rank)}</span>
                <span className={cn('rounded-full px-2 py-0.5 font-medium', student.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                  {student.is_active ? t('active') : t('inactive')}
                </span>
                {/* F3: waiver status chip */}
                <WaiverChip state={waiver.state} version={waiver.signedVersion} />
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
          <div className="flex flex-col items-end gap-2">
            {/* ON-1 + MJ-1: invite this member to the portal — gated on portal-login
                eligibility (staff override ?? age default). An ineligible minor points
                staff to the guardian panel (the guardian is the family's door). */}
            <MemberPortalAccess
              studentId={id} name={name} locale={locale}
              phone={prof?.phone ?? null}
              override={(student as any).portal_login_override ?? null}
              age={age}
            />
            {/* F3: front-desk waiver capture when unsigned/outdated (staff signs on a tablet) */}
            {waiver.template && (waiver.state === 'unsigned' || waiver.state === 'outdated') && (
              <WaiverSign
                studentId={id}
                title={waiverTitle(waiver.template, locale)}
                body={waiverBody(waiver.template, locale)}
                locale={locale}
                outdated={waiver.state === 'outdated'}
                label={waiver.state === 'outdated' ? t('waiverResign') : t('waiverSign')}
                testidPrefix="member-waiver"
              />
            )}
            {/* F3: the signed record — proves the artifact persisted + who signed (guardian path) */}
            {waiver.signature && (
              <div className="flex flex-col items-end gap-1 rounded-xl border border-gray-100 p-2" data-testid="member-waiver-record">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={waiver.signature} alt="signature" data-testid="member-waiver-artifact"
                  className="h-10 w-28 rounded bg-white object-contain" />
                {waiver.signedByName && (
                  <span className="text-[10px] text-gray-500" data-testid="member-waiver-signer">{waiver.signedByName}</span>
                )}
              </div>
            )}
            <MemberActions
              studentId={id}
              memberName={name}
              classes={(pickableClasses ?? []) as PickableClass[]}
              openInvoices={openInvoices}
              camps={pickableCamps}
              memberAge={age}
              locale={locale}
              autoPay={searchParams?.pay === '1'}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── 1. Membership (NO-MEMBERSHIP: hidden when the gym doesn't sell it) ── */}
        {enabledProducts.membership && (
        <Panel isRTL={isRTL} icon={CreditCard} title={t('membership')} testid="panel-membership">
          {/* ML-1: the D2 docking slot is live — read-time states + actions */}
          {membershipCards.length === 0 ? <Empty text={t('noMembership')} /> : (
            <div className="space-y-3">
              {membershipCards.map((mc) => (
                <MembershipCard
                  key={mc.id}
                  data={mc}
                  plans={planOptions}
                  policy={lcPolicy}
                  freezeUsedDays={freezeUsedBy.get(mc.id) ?? 0}
                  studentId={id}
                  locale={locale}
                />
              ))}
            </div>
          )}
        </Panel>
        )}

        {/* ── 2. Class registrations ── */}
        <Panel isRTL={isRTL} icon={CalendarDays} title={t('registrations')} testid="panel-registrations">
          {(registrations ?? []).length === 0 ? <Empty text={t('noRegistrations')} /> : (
            <ul className="space-y-2">
              {(registrations ?? []).map((r: any) => (
                <li key={r.id} className="flex items-center justify-between text-sm" data-testid="member-reg-row" data-status={r.status}>
                  <div>
                    <p className="font-medium text-gray-800">{lname(one(r.classes))}</p>
                    {(() => {
                      const cls = one(r.classes) as any
                      const disc = lname(one(cls?.disciplines))
                      const sched = fmtSchedule(r.classes)
                      return (disc || sched) ? (
                        <p className="text-xs text-gray-600" data-testid="reg-discipline-schedule">
                          {[disc, sched].filter(Boolean).join(' · ')}
                        </p>
                      ) : null
                    })()}
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
                    <span className="flex items-center gap-1">
                      {r.status === 'active' && ['expiring', 'overdue'].includes(registrationState(r, lcPolicy)) && (
                        <span data-testid="reg-renewal-state" className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                          registrationState(r, lcPolicy) === 'overdue' ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700')}>
                          {registrationState(r, lcPolicy) === 'overdue' ? t('regOverdue') : t('regExpiring')}
                        </span>
                      )}
                      <span data-testid="reg-status-badge" className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', regBadge[r.status] || 'bg-gray-100 text-gray-500')}>{r.status}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* ── 3. PT ── the file's own PT cockpit (the header pill anchors here).
            DOCKING SLOT: PT-1 “sell package” + PT-2 “book session” actions mount
            in this panel (per the approved PT-360 §3.1 package cards). */}
        <Panel isRTL={isRTL} icon={Dumbbell} title={t('pt')} testid="panel-pt" id="panel-pt">
          {/* PT-1 package-first: cards with sessions NESTED (the flat
              recent-sessions list died here); sell + extend actions inside. */}
          <MemberPtPanel
            studentId={id}
            cards={ptCards as any}
            types={sellableTypes}
            coaches={sellableCoaches}
            unlinkedCount={ptUnlinked}
            locale={locale}
            autoSellPackageId={searchParams?.sellpt || null}
          />
        </Panel>

        {/* ── 4. Billing ── */}
        <Panel isRTL={isRTL} icon={DollarSign} title={t('billing')} testid="panel-billing">
          {(invoices ?? []).length === 0 ? <Empty text={t('noInvoices')} /> : (
            <ul className="space-y-2">
              {(invoices ?? []).map((inv: any) => {
                const bal = balanceUsd(inv.total_usd, [{ amount_usd: paidByInvoice.get(inv.id) ?? 0 }])
                return (
                  <li key={inv.id} className="flex items-center justify-between gap-2 text-sm" data-testid="member-invoice-row" data-status={inv.status} data-type={inv.invoice_type}>
                    <span className="flex flex-col">
                      <Link href={`/${locale}/invoices/${inv.id}`} className="font-mono text-xs font-medium text-primary-700 hover:underline">
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
                    <span>{fmtDate(p.payment_date)} · {(locale === 'ar' ? METHOD_LABEL[p.payment_method]?.ar : locale === 'fr' ? METHOD_LABEL[p.payment_method]?.fr : METHOD_LABEL[p.payment_method]?.en) || p.payment_method}</span>
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
        <Panel isRTL={isRTL} icon={ClipboardList} title={`${t('attendance')} · ${t('last30', { count: attendance30 ?? 0 })}`} testid="panel-attendance">
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
        <Panel isRTL={isRTL} icon={Award} title={t('beltProgress')} testid="panel-belts">
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
                <Link key={k.id} href={`/${locale}/students/${k.id}`} className="me-2 text-primary-600 hover:underline">{k.name}</Link>
              ))}
            </p>
            {payerInvoices.length === 0 ? (
              <p className="py-2 text-center text-sm text-gray-400">{t('noHouseholdInvoices')}</p>
            ) : (
              <ul className="space-y-1.5">
                {payerInvoices.map((inv: any) => (
                  <li key={inv.id} className="flex items-center justify-between text-xs" data-testid="household-payer-row">
                    <Link href={`/${locale}/invoices/${inv.id}`} className="font-mono text-primary-700 hover:underline">{inv.invoice_number}</Link>
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
