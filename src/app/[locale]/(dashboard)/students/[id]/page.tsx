import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { beltRankLabel } from '@/lib/belts/label'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { localizedName, one } from '@/lib/names'
import { balanceUsd, statusLabel, displayInvoiceStatus, METHOD_LABEL } from '@/lib/billing/reconcile'
import { StatusChip } from '@/components/ui/status-chip'
import { statusTintClass, VARIANT_TINT } from '@/lib/status-vocabulary'
import {
  User, Phone, Award, CreditCard, CalendarDays, Dumbbell, ClipboardList,
  DollarSign, Users, Clock,
} from 'lucide-react'
import { NavChevron } from '@/components/ui/nav-chevron'
import { GuardianPanel, type GuardianRow } from './guardian-panel'
import { AvatarUpload } from '@/components/shared/avatar-upload'
import { PromotePanel } from './promote-panel'
import { MemberActions, type OpenInvoice, type PickableCamp, type PickableClass } from './member-actions'
import { MemberPortalAccess } from './member-portal-access'
import { MemberPtPanel, type SellableCoach, type SellableType } from './pt-panel-client'
import { MembershipCard, type MembershipCardData, type PlanOption } from './membership-card'
import { getEnabledProducts } from '@/lib/gym/products'
import { registrationState, membershipState } from '@/lib/lifecycle/status'
import { getWaiverContext } from '@/lib/waivers/server'
import { waiverTitle, waiverBody } from '@/lib/waivers/status'
import { WaiverSign, WaiverChip } from '@/components/shared/waiver-sign'
import { fmtDate as fmtIntlDate, fmtDateRange, fmtPhone, fmtTime, humanizeEnum } from '@/lib/fmt'
import { Ltr } from '@/components/ui/bdi'
import { StatusStrip, type StripStat } from '@/components/member360/status-strip'
import { AttentionQueue, type QueueRow } from '@/components/member360/attention-queue'
import { LifecycleFacts, type LifecycleFact } from '@/components/member360/lifecycle-facts'
import { deriveMemberAttention } from '@/lib/member360/attention'
import { agingBucketFor, daysPastDue } from '@/lib/finances/aging'
import { cycleWindow } from '@/lib/billing/proration'
import { composeInvoiceWa } from '../../invoices/[id]/wa-message'
import { InvoiceRowWa } from '../../invoices/invoice-row-wa'
import { gymCanonicalOrigin } from '@/lib/host/primary-domain'
import { gymDisplayName } from '@/lib/whatsapp/identity'
import { WhatsAppShare } from '@/components/shared/whatsapp-share'

export const dynamic = 'force-dynamic'

type Props = { params: { locale: string; id: string }; searchParams: { pay?: string; sellpt?: string; register?: string } }

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
      last_name_ar, last_name_en, last_name_fr, phone, gender, date_of_birth, avatar_url, locale)`)
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
      .select('id, class_id, status, waitlist_position, monthly_fee_usd, discount_pct, discount_amount_usd, start_date, end_date, paid_until, billing_anchor, first_cycle_prorated, requested_at, classes:class_id (name_ar, name_en, name_fr, disciplines:discipline_id (name_ar, name_en, name_fr), class_schedules (day_of_week, start_time, end_time, is_active))')
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
      .select(`id, invoice_number, invoice_type, total_usd, status, voided_at, due_date, created_at, payer_profile_id,
        payer:profiles!invoices_payer_profile_id_fkey (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)`)
      .eq('student_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('payments')
      .select('id, invoice_id, amount_usd, amount_lbp, payment_method, payment_date, reference_number, invoices:invoice_id (invoice_type)')
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
    .select(`id, invoice_number, invoice_type, total_usd, status, due_date, created_at, exchange_rate,
      notes_ar, notes_en, notes_fr, payer_profile_id,
      payer:profiles!invoices_payer_profile_id_fkey (first_name_ar, first_name_en, first_name_fr, phone, locale)`)
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
    ? await supabase.from('invoices').select('id, invoice_number, status, total_usd').in('id', ptInvoiceIds)
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
    .select('renewal_lead_days, dunning_grace_days, freeze_max_days_year, freeze_min_chunk_days, name_ar, name_en, name_fr, slug')
    .eq('id', gymIdForPromote)
    .single()
  const { data: planRows } = await supabase
    .from('membership_plans')
    .select('id, name_ar, name_en, name_fr, price_usd, duration_days')
    .eq('gym_id', gymIdForPromote).eq('is_active', true)
    .order('price_usd')
  const msIds = (memberships ?? []).map((m: any) => m.id)
  const regIds = (registrations ?? []).map((r: any) => r.id)
  const renewalProductIds = [...msIds, ...regIds]
  const [{ data: openRenewals }, { data: freezeRows }] = renewalProductIds.length
    ? await Promise.all([
        // MEMBER-360-ACTIONABLE: widened to BOTH product types + the invoice id, so
        // an overdue renewal's queue row can open the collect flow pre-filled (§2.1).
        supabase.from('renewal_invoices')
          .select('product_id, product_type, invoice_id, invoices:invoice_id!inner (status)')
          .in('product_type', ['membership', 'class_registration']).in('product_id', renewalProductIds),
        msIds.length
          ? supabase.from('membership_freezes')
              .select('membership_id, days_frozen, start_date')
              .in('membership_id', msIds)
          : Promise.resolve({ data: [] as any[] }),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }]
  const openRenewalRows = ((openRenewals ?? []) as any[])
    .filter((r) => ['pending', 'partial', 'overdue'].includes(one(r.invoices)?.status))
  const renewalOpenSet = new Set(openRenewalRows.filter((r) => r.product_type === 'membership').map((r) => r.product_id))
  /** open renewal invoice per product (membership OR registration) — the §2.1 collect target */
  const renewalInvoiceByProduct = new Map<string, string>(openRenewalRows.map((r) => [r.product_id, r.invoice_id]))
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
  // DS2-FMT §2.7 — the page's local date helper now delegates to the one layer, so
  // every date on this file goes through it without churning the call sites. Two
  // real fixes ride along: a bare DATE column ('2026-01-15') is noon-anchored
  // instead of parsed as midnight UTC (which rendered the PREVIOUS day on any
  // server behind UTC), and timestamps render in the gym's timezone rather than
  // the server's.
  const fmtDate = (d: string | null) => fmtIntlDate(d, locale)
  const tb = await getTranslations('beltRanks')
  const beltLabel = (r: string | null) => beltRankLabel(r, tb, '—')
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
      invoiceStatus: inv?.status ?? null,
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

  // W3b (DA-25/32): colour is the registration vocabulary's call — no local map.
  const regBadge = (status: string) => statusTintClass('registration', status)

  // R3 win-back: a lapsed/inactive member's last-seen + join date give the staff
  // context for the outreach call (display only). Lapsed = deactivated OR any
  // membership read-state is 'lapsed'.
  const memStates = ((memberships ?? []) as any[]).map((m) => membershipState(m, lcPolicy))
  const isLapsedMember = !student.is_active || memStates.includes('lapsed')
  const lastSeenDate = ((attendance ?? []) as any[])[0]?.attendance_date ?? null

  // ══ MEMBER-360-ACTIONABLE (§3) — every derivation below is over rows this page
  //    already loads; the queue is computed at render, never stored. ══
  const ta = await getTranslations('member360.actionable')
  const tAging = await getTranslations('ownerFinances.aging')
  const tw = await getTranslations('whatsapp')
  const ti = await getTranslations('invoices')

  // The aging LEDGER = the open invoices, oldest due first (the same rows the
  // pay modal offers — so "oldest pre-selected" and the ledger agree by shape).
  const openLedger = ((openInvRows ?? []) as any[])
    .map((i) => ({ ...i, balance_usd: balanceUsd(i.total_usd, [{ amount_usd: openPaidBy.get(i.id) ?? 0 }]) }))
    .filter((i) => i.balance_usd > 0)
  const balanceDue = Math.round(openLedger.reduce((sum, i) => sum + i.balance_usd, 0) * 100) / 100
  const oldestAgeDays = openLedger.length ? daysPastDue(openLedger[0].due_date) : 0

  // Next renewal = the nearest billing boundary across ACTIVE products.
  const renewalBoundaries: { date: string; label: string; overdue: boolean; anchor: string; productId: string }[] = []
  for (const m of (memberships ?? []) as any[]) {
    if (m.status !== 'active' || !m.end_date) continue
    renewalBoundaries.push({
      date: String(m.end_date).slice(0, 10), label: lname(one(m.membership_plans)),
      overdue: membershipState(m, lcPolicy) === 'overdue', anchor: '#panel-membership', productId: m.id,
    })
  }
  for (const r of (registrations ?? []) as any[]) {
    if (r.status !== 'active') continue
    const pu = r.paid_until ?? r.end_date
    if (!pu) continue
    renewalBoundaries.push({
      date: String(pu).slice(0, 10), label: lname(one(r.classes)),
      overdue: registrationState(r, lcPolicy) === 'overdue', anchor: '#panel-registrations', productId: r.id,
    })
  }
  renewalBoundaries.sort((a, b) => a.date.localeCompare(b.date))
  const nextRenewal = renewalBoundaries[0] ?? null
  const nextRenewalOverdue = nextRenewal ? daysPastDue(nextRenewal.date) : 0

  // Last payment per product type (§3.3 money-last slot) + overall (§3.4 line).
  const lastPayByType = new Map<string, any>()
  for (const pRow of (payments ?? []) as any[]) {
    const ty = (one((pRow as any).invoices) as any)?.invoice_type
    if (ty && !lastPayByType.has(ty)) lastPayByType.set(ty, pRow)
  }
  const lastPayment = ((payments ?? []) as any[])[0] ?? null

  // §3.2 — the queue (mechanical rules, lib-derived, absent when empty).
  const attentionItems = deriveMemberAttention({
    overdueRenewals: renewalBoundaries.filter((b) => b.overdue).map((b) => ({
      productLabel: b.label, dueDate: b.date,
      collectInvoiceId: renewalInvoiceByProduct.get(b.productId) ?? null, anchor: b.anchor,
    })),
    openInvoices: openLedger.map((i) => ({ id: i.id, invoiceNumber: i.invoice_number, dueDate: i.due_date, balanceUsd: i.balance_usd })),
    ptAssignments: ((ptAssignments ?? []) as any[]).map((a) => ({
      id: a.id, packageLabel: lname(one(a.pt_packages)), expiresAt: a.expires_at,
      sessionsRemaining: a.sessions_remaining ?? 0, sessionsTotal: a.sessions_total ?? 0,
      isActive: !!a.is_active && a.status === 'active',
    })),
    lastSeen: lastSeenDate,
    joinDate: (student as any).join_date ?? null,
  })

  // wa.me handoff payloads for the open ledger + queue reminders (the G1 bridge —
  // the invoices-view batched idiom: payer when guardian-billed, else the member).
  const waOrigin = await gymCanonicalOrigin((gymPolicy as any)?.slug ?? null)
  const twCache = new Map<string, (k: string, v: Record<string, string>) => string>()
  const twFor = async (loc: string | null | undefined) => {
    const key = loc === 'ar' || loc === 'fr' ? loc : 'en'
    if (!twCache.has(key)) {
      twCache.set(key, (await getTranslations({ locale: key, namespace: 'whatsapp' })) as unknown as (k: string, v: Record<string, string>) => string)
    }
    return twCache.get(key)!
  }
  const waByInvoice = new Map<string, { phone: string | null; due: string; reminder: string }>()
  await Promise.all(openLedger.map(async (inv: any) => {
    const target = inv.payer_profile_id ? (one(inv.payer) as any) : prof
    waByInvoice.set(inv.id, composeInvoiceWa(await twFor(target?.locale), {
      gym: gymPolicy as any, target, locale: target?.locale === 'ar' || target?.locale === 'fr' ? target.locale : 'en',
      origin: waOrigin, invoiceNumber: inv.invoice_number, invoiceType: inv.invoice_type,
      notes: inv, balanceUsd: inv.balance_usd, exchangeRate: inv.exchange_rate,
    }))
  }))
  const gymName = gymDisplayName(gymPolicy as any, locale)

  // §3.1 — the three numbers that drive action (calm-zero throughout).
  const stripStats: StripStat[] = [
    {
      key: 'balance', label: ta('balanceDue'),
      value: <Ltr>{`$${balanceDue.toFixed(2)}`}</Ltr>,
      tone: balanceDue > 0.005 ? 'danger' : undefined,
      chip: oldestAgeDays > 0 ? { label: ta('oldestDays', { days: oldestAgeDays }), variant: 'danger' } : null,
      href: '#panel-billing', testid: 'm360-strip-balance',
    },
    {
      key: 'renewal', label: ta('nextRenewal'),
      value: nextRenewal ? fmtDate(nextRenewal.date) : '—',
      tone: nextRenewalOverdue > 0 ? 'warning' : undefined,
      chip: nextRenewal
        ? nextRenewalOverdue > 0
          ? { label: ta('overdueDays', { days: nextRenewalOverdue }), variant: 'warning' }
          : { label: nextRenewal.label, variant: 'neutral' }
        : null,
      href: nextRenewal?.anchor ?? '#panel-registrations', testid: 'm360-strip-renewal',
    },
    {
      key: 'lastseen', label: ta('lastSeenLabel'),
      value: lastSeenDate ? fmtDate(lastSeenDate) : t('neverSeen'),
      chip: lastSeenDate ? { label: ta('daysAgo', { days: Math.max(0, daysPastDue(lastSeenDate)) }), variant: 'neutral' } : null,
      href: '#panel-attendance', testid: 'm360-strip-lastseen',
    },
  ]

  // §3.2 queue rows — the action IS on the row (§2.1: one tap).
  const queueRows: QueueRow[] = attentionItems.map((item, idx) => {
    if (item.kind === 'renewal') {
      return {
        key: `renewal-${idx}`, kind: 'renewal',
        chip: { label: ta('kindRenewal'), variant: 'danger' },
        why: ta('queueRenewal', { label: item.productLabel, date: fmtDate(item.dueDate), days: item.overdueDays }),
        action: (
          <Link
            href={item.collectInvoiceId ? `/${locale}/students/${id}?pay=${item.collectInvoiceId}` : item.anchor}
            data-testid="queue-collect-renew"
            className="inline-flex items-center rounded-lg bg-primary-700 px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-800"
          >
            {ta('collectRenew')}
          </Link>
        ),
      }
    }
    if (item.kind === 'invoice') {
      const wa = waByInvoice.get(item.invoiceId)
      return {
        key: `invoice-${item.invoiceId}`, kind: 'invoice',
        chip: { label: ta('kindInvoice'), variant: 'warning' },
        why: <>{item.invoiceNumber} · {ta('unpaidDays', { days: item.ageDays })} · <Ltr>{`$${item.balanceUsd.toFixed(2)}`}</Ltr></>,
        action: wa?.phone ? (
          <InvoiceRowWa invoiceId={item.invoiceId} phone={wa.phone} dueMessage={wa.due} reminderMessage={wa.reminder}
            sendLabel={ti('waSendInvoice')} remindLabel={ti('waSendReminder')} />
        ) : (
          <Link href={`/${locale}/students/${id}?pay=${item.invoiceId}`} data-testid="queue-collect"
            className="inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
            {ta('collect')}
          </Link>
        ),
      }
    }
    if (item.kind === 'pt') {
      return {
        key: `pt-${item.assignmentId}`, kind: 'pt',
        chip: { label: t('pt'), variant: 'info' },
        why: item.reason === 'expiring'
          ? ta('queuePtExpiring', { label: item.packageLabel, date: fmtDate(item.expiresAt), n: item.sessionsRemaining, total: item.sessionsTotal })
          : ta('queuePtLow', { label: item.packageLabel, n: item.sessionsRemaining }),
        action: (
          <a href="#panel-pt" data-testid="queue-book-pt"
            className="inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
            {ta('bookSession')}
          </a>
        ),
      }
    }
    return {
      key: 'winback', kind: 'winback',
      chip: { label: ta('kindWinback'), variant: 'info' },
      why: item.absentDays != null ? ta('queueWinback', { days: item.absentDays }) : ta('queueWinbackNever'),
      action: prof?.phone ? (
        <WhatsAppShare phone={prof.phone} testid="queue-winback-wa"
          message={tw('tmpl.winback', { name, gym: gymName })} label={tw('share.reachOut')} />
      ) : (
        <a href="#panel-attendance" className="text-xs font-medium text-gray-500 underline-offset-2 hover:underline">
          {ta('kindWinback')}
        </a>
      ),
    }
  })

  // §3.3 fact-grid builders (registration / PT variants; membership grid is
  // composed inline below and passed into the card).
  const regFacts = (r: any): LifecycleFact[] => {
    const anchorIso = r.billing_anchor ?? r.start_date
    let cycle: string | null = null
    if (anchorIso && (r.status === 'active' || r.status === 'suspended')) {
      const w = cycleWindow(new Date(String(anchorIso).slice(0, 10) + 'T12:00:00'), new Date())
      cycle = fmtDateRange(w.start.toISOString().slice(0, 10), w.end.toISOString().slice(0, 10), locale, 'dayMonth')
    }
    const nextBillDate = r.paid_until ?? r.end_date
    const fee = r.monthly_fee_usd != null
      ? Math.max(0, Number(r.monthly_fee_usd) * (1 - Number(r.discount_pct ?? 0) / 100) - Number(r.discount_amount_usd ?? 0))
      : null
    const collectId = renewalInvoiceByProduct.get(r.id) ?? null
    const lastPay = lastPayByType.get('class_registration') ?? null
    const classHref = r.class_id ? `/${locale}/classes/${r.class_id}` : undefined
    return [
      { key: 'registered', label: ta('registered'), value: r.requested_at ? fmtDate(r.requested_at) : '—', href: classHref, testid: 'fact-registered' },
      { key: 'cycle', label: ta('currentCycle'), value: cycle ?? '—', href: classHref, testid: 'fact-cycle' },
      {
        key: 'nextbill', label: ta('nextBill'), value: nextBillDate ? fmtDate(nextBillDate) : '—',
        sub: fee != null ? <Ltr>{`· $${fee.toFixed(2)}`}</Ltr> : undefined,
        href: collectId ? `/${locale}/students/${id}?pay=${collectId}` : undefined,
        tone: r.status === 'active' && registrationState(r, lcPolicy) === 'overdue' ? 'danger' : undefined,
        testid: 'fact-next-bill',
      },
      {
        key: 'lastpay', label: ta('lastPayment'),
        value: lastPay ? fmtDate(lastPay.payment_date) : ta('noneYet'),
        sub: lastPay ? <Ltr>{`· $${Number(lastPay.amount_usd).toFixed(2)}`}</Ltr> : undefined,
        href: lastPay?.invoice_id ? `/${locale}/invoices/${lastPay.invoice_id}/receipt` : undefined,
        testid: 'fact-last-payment',
      },
    ]
  }

  // §3.3 PT variant (sold · valid window · invoice state · next session).
  const ptFactsById: Record<string, React.ReactNode> = {}
  for (const a of (ptAssignments ?? []) as any[]) {
    const inv: any = a.invoice_id ? ptInvBy.get(a.invoice_id) : null
    const invOpen = inv && ['pending', 'partial', 'overdue'].includes(inv.status)
    const future = (ptSessionsByAssignment.get(a.id) ?? [])
      .filter((sRow: any) => ['scheduled', 'proposed'].includes(sRow.status) && sRow.scheduled_at >= new Date().toISOString())
      .sort((x: any, y: any) => String(x.scheduled_at).localeCompare(String(y.scheduled_at)))
    const next = future[0] ?? null
    const facts: LifecycleFact[] = [
      { key: 'sold', label: ta('sold'), value: a.purchased_at ? fmtDate(a.purchased_at) : '—', testid: 'fact-registered' },
      { key: 'valid', label: ta('valid'), value: a.purchased_at && a.expires_at ? fmtDateRange(a.purchased_at, a.expires_at, locale, 'dayMonth') : a.expires_at ? fmtDate(a.expires_at) : '—', testid: 'fact-cycle' },
      {
        key: 'invoice', label: ta('invoiceFact'),
        value: inv ? <Ltr>{`$${Number(inv.total_usd ?? 0).toFixed(2)}`}</Ltr> : '—',
        sub: inv ? `· ${statusLabel(inv.status, locale)}` : undefined,
        href: inv ? (invOpen ? `/${locale}/students/${id}?pay=${inv.id}` : `/${locale}/invoices/${inv.id}`) : undefined,
        tone: invOpen ? 'warning' : undefined,
        testid: 'fact-next-bill',
      },
      {
        key: 'nextsession', label: ta('nextSession'),
        value: next ? `${fmtDate(next.scheduled_at)} · ${fmtTime(next.scheduled_at, locale)}` : ta('noneYet'),
        testid: 'fact-last-payment',
      },
    ]
    ptFactsById[a.id] = <LifecycleFacts facts={facts} testid="pt-lifecycle" />
  }

  // §3.3 membership variant (start · cycle · next bill · last payment).
  const msPriceById = new Map<string, number | null>(
    ((memberships ?? []) as any[]).map((m) => [m.id, (one(m.membership_plans) as any)?.price_usd ?? null]),
  )
  const msFacts = (mc: MembershipCardData): React.ReactNode => {
    const price = msPriceById.get(mc.id)
    const collectId = renewalInvoiceByProduct.get(mc.id) ?? null
    const lastPay = lastPayByType.get('membership') ?? null
    const facts: LifecycleFact[] = [
      { key: 'start', label: ta('started'), value: fmtDate(mc.start_date), testid: 'fact-registered' },
      { key: 'cycle', label: ta('currentCycle'), value: fmtDateRange(mc.start_date, mc.end_date, locale, 'dayMonth'), testid: 'fact-cycle' },
      {
        key: 'nextbill', label: ta('nextBill'), value: fmtDate(mc.end_date),
        sub: price != null ? <Ltr>{`· $${Number(price).toFixed(2)}`}</Ltr> : undefined,
        href: collectId ? `/${locale}/students/${id}?pay=${collectId}` : undefined,
        tone: mc.renewalOpen ? 'warning' : undefined,
        testid: 'fact-next-bill',
      },
      {
        key: 'lastpay', label: ta('lastPayment'),
        value: lastPay ? fmtDate(lastPay.payment_date) : ta('noneYet'),
        sub: lastPay ? <Ltr>{`· $${Number(lastPay.amount_usd).toFixed(2)}`}</Ltr> : undefined,
        href: lastPay?.invoice_id ? `/${locale}/invoices/${lastPay.invoice_id}/receipt` : undefined,
        testid: 'fact-last-payment',
      },
    ]
    return <LifecycleFacts facts={facts} testid="ms-lifecycle" />
  }

  return (
    <div className="space-y-4" data-testid="member-360">
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
                {/* DA-7: the raw stored E.164 flipped its "+" to the far end in Arabic
                    ("96170000012+"). fmtPhone groups it and <Ltr> isolates it. */}
                {prof?.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /><Ltr>{fmtPhone(prof.phone)}</Ltr></span>}
                {age != null && <span>{t('age', { age })}</span>}
                <span className="inline-flex items-center gap-1 capitalize"><Award className="h-3 w-3" />{beltLabel(student.current_belt_rank)}</span>
                <StatusChip domain="member" status={student.is_active ? 'active' : 'inactive'}
                  label={student.is_active ? t('active') : t('inactive')} className="capitalize" />
                {/* F3: waiver status chip */}
                <WaiverChip state={waiver.state} version={waiver.signedVersion} />
              </p>
              {(guardianLinks ?? []).length > 0 && (
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500" data-testid="member-guardians">
                  <Users className="h-3 w-3" />
                  {(guardianLinks ?? []).map((g: any) => {
                    const guard = one(g.guardians)
                    const rel = (isRTL ? guard?.relationship_ar : locale === 'fr' ? guard?.relationship_fr : guard?.relationship_en) || ''
                    // GUARDIAN-360: the guardian name jumps to their family page.
                    return (
                      <Link key={guard?.id} href={`/${locale}/students/guardians/${guard?.id}`}
                        data-testid="member-guardian-link" className="text-primary-600 hover:underline">
                        {localizedName(one(guard?.profiles), locale)}{rel ? ` (${rel})` : ''}
                      </Link>
                    )
                  })}
                </p>
              )}
              {/* R3 win-back: lapsed member's last-seen + join date for the outreach call. */}
              {isLapsedMember && (
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-red-700" data-testid="member-winback">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />
                    {lastSeenDate ? t('lastSeen', { date: fmtDate(lastSeenDate) }) : t('neverSeen')}</span>
                  <span>· {t('joined', { date: fmtDate(student.join_date) })}</span>
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
              autoPay={!!searchParams?.pay}
              autoPayInvoiceId={searchParams?.pay && searchParams.pay !== '1' ? searchParams.pay : null}
              autoRegister={searchParams?.register === '1'}
            />
          </div>
        </div>
      </div>

      {/* §3.1 — the header status strip: three tappable numbers (each drills). */}
      <StatusStrip stats={stripStats} testid="m360-strip" />

      {/* §3.2 — needs-attention queue: derived at render, ABSENT when empty. */}
      <AttentionQueue rows={queueRows} testid="m360-attention" />

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
                  facts={msFacts(mc)}
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
                <li key={r.id} className="text-sm" data-testid="member-reg-row" data-status={r.status}>
                  <div className="flex items-center justify-between">
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
                    {/* BILL-CYCLES R3: the current billing cycle (start/renews + prorate tag). */}
                    {(r.status === 'active' || r.status === 'suspended') && (() => {
                      const nowIso = new Date().toISOString().slice(0, 10)
                      const fut = r.start_date && String(r.start_date).slice(0, 10) > nowIso
                      const renews = r.paid_until ?? r.end_date
                      // DA-7: this line passed a bare 'ar' locale, so it rendered
                      // Arabic-Indic digits ("٦ تموز") beside every neighbouring date
                      // on the same page, which renders Latin ones. fmtDate is the
                      // single layer and always uses the ar-LB-u-nu-latn ramp.
                      const d = (iso: string) => fmtIntlDate(String(iso).slice(0, 10), locale, 'dayMonth')
                      const txt = fut
                        ? `${isRTL ? 'يبدأ' : locale === 'fr' ? 'Débute' : 'Starts'} ${d(r.start_date)}`
                        : renews ? `${isRTL ? 'يتجدّد' : locale === 'fr' ? 'Renouvelle' : 'Renews'} ${d(renews)}` : ''
                      return (txt || r.first_cycle_prorated) ? (
                        <p className="text-xs text-blue-600" data-testid="member-reg-cycle">
                          {txt}{r.first_cycle_prorated ? ` · ${isRTL ? 'بالتناسب' : locale === 'fr' ? 'proratisé' : 'prorated'}` : ''}
                        </p>
                      ) : null
                    })()}
                  </div>
                  {r.status === 'requested' ? (
                    <Link href={`/${locale}/inbox`} className={cn('rounded-full px-2 py-0.5 text-xs font-medium underline-offset-2 hover:underline', regBadge(r.status))}>
                      {t('pendingInbox')}
                    </Link>
                  ) : (
                    <span className="flex items-center gap-1">
                      {r.status === 'active' && ['expiring', 'overdue'].includes(registrationState(r, lcPolicy)) && (
                        <span data-testid="reg-renewal-state" className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                          registrationState(r, lcPolicy) === 'overdue' ? statusTintClass('member', 'overdue') : statusTintClass('member', 'expiring'))}>
                          {registrationState(r, lcPolicy) === 'overdue' ? t('regOverdue') : t('regExpiring')}
                        </span>
                      )}
                      <span data-testid="reg-status-badge" className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', regBadge(r.status))}>{humanizeEnum(r.status)}</span>
                    </span>
                  )}
                  </div>
                  {/* §3.3 — the uniform four-slot lifecycle grid (origin · window ·
                      money-next · money-last); every slot drills per §2.1. */}
                  {(r.status === 'active' || r.status === 'suspended') && (
                    <LifecycleFacts facts={regFacts(r)} testid="reg-lifecycle" />
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
            factsById={ptFactsById}
            cards={ptCards as any}
            types={sellableTypes}
            coaches={sellableCoaches}
            unlinkedCount={ptUnlinked}
            locale={locale}
            autoSellPackageId={searchParams?.sellpt || null}
          />
        </Panel>

        {/* ── 4. Billing → the AGING LEDGER (§3.4): open invoices oldest-first with
            issued date + the 000110 age bucket + balance + a one-tap action; settled
            history below. The ledger and the pay modal read the SAME open set, so
            "Collect" always lands on a pre-selectable invoice. */}
        <Panel isRTL={isRTL} icon={DollarSign} title={t('billing')} testid="panel-billing">
          {openLedger.length === 0 && (invoices ?? []).length === 0 && <Empty text={t('noInvoices')} />}
          {openLedger.length > 0 && (
            <ul className="space-y-2" data-testid="m360-aging-ledger">
              {openLedger.map((inv: any) => {
                const bucket = agingBucketFor(inv.due_date)
                const wa = waByInvoice.get(inv.id)
                return (
                  <li key={inv.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" data-testid="member-invoice-row" data-status={inv.status} data-type={inv.invoice_type} data-bucket={bucket}>
                    <span className="flex min-w-0 flex-col">
                      <Link href={`/${locale}/invoices/${inv.id}`} className="font-mono text-xs font-medium text-primary-700 hover:underline">
                        {inv.invoice_number}
                      </Link>
                      {inv.payer_profile_id && inv.payer_profile_id !== profileId && (
                        <span className="text-[10px] text-gray-400" data-testid="invoice-payer">
                          {t('payer')}: {localizedName(one(inv.payer), locale)}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-gray-400">{ta('issued')} {fmtDate(inv.created_at)}</span>
                    {/* §2.1: the age chip drills to the invoice it ages. */}
                    <Link href={`/${locale}/invoices/${inv.id}`} data-testid="ledger-age-chip" data-bucket={bucket}
                      className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        VARIANT_TINT[bucket === 'current' ? 'neutral' : bucket === 'd1_30' ? 'warning' : 'danger'])}>
                      {tAging(bucket)}
                    </Link>
                    <span className="ms-auto text-xs text-gray-500">${Number(inv.total_usd).toFixed(2)} · {t('due')} <Ltr>{`$${inv.balance_usd.toFixed(2)}`}</Ltr></span>
                    <span className="flex items-center gap-1.5">
                      <Link href={`/${locale}/students/${id}?pay=${inv.id}`} data-testid="ledger-collect"
                        className="inline-flex items-center rounded-lg bg-primary-700 px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary-800">
                        {ta('collect')}
                      </Link>
                      {wa?.phone && (
                        <InvoiceRowWa invoiceId={inv.id} phone={wa.phone} dueMessage={wa.due} reminderMessage={wa.reminder}
                          sendLabel={ti('waSendInvoice')} remindLabel={ti('waSendReminder')} />
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          {(invoices ?? []).filter((inv: any) => !openLedger.some((o: any) => o.id === inv.id)).length > 0 && (
            <ul className={cn('space-y-2', openLedger.length > 0 && 'mt-3 border-t pt-2')}>
              {(invoices ?? []).filter((inv: any) => !openLedger.some((o: any) => o.id === inv.id)).map((inv: any) => {
                const bal = balanceUsd(inv.total_usd, [{ amount_usd: paidByInvoice.get(inv.id) ?? 0 }])
                return (
                  <li key={inv.id} className="flex items-center justify-between gap-2 text-sm" data-testid="member-invoice-row" data-status={inv.status} data-voided={inv.voided_at ? 'true' : undefined} data-type={inv.invoice_type}>
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
                    <StatusChip domain="invoice" status={displayInvoiceStatus(inv.status, inv.voided_at)} label={statusLabel(displayInvoiceStatus(inv.status, inv.voided_at), locale)} />
                  </li>
                )
              })}
            </ul>
          )}
          {/* §3.4 — the last-payment line, drilling to its receipt (§2.1). */}
          {lastPayment && (
            <p className="mt-3 border-t pt-2 text-xs text-gray-500" data-testid="m360-last-payment">
              {ta('lastPayment')}:{' '}
              <Link href={`/${locale}/invoices/${lastPayment.invoice_id}/receipt`} className="font-medium text-gray-800 underline-offset-2 hover:underline">
                {fmtDate(lastPayment.payment_date)} · <Ltr>{`$${Number(lastPayment.amount_usd).toFixed(2)}`}</Ltr> · {(locale === 'ar' ? METHOD_LABEL[lastPayment.payment_method]?.ar : locale === 'fr' ? METHOD_LABEL[lastPayment.payment_method]?.fr : METHOD_LABEL[lastPayment.payment_method]?.en) || lastPayment.payment_method}
              </Link>
            </p>
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
              {t('openMoney')} <NavChevron className="h-3 w-3 text-primary-600" />
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
                    <StatusChip domain="invoice" status={inv.status} label={statusLabel(inv.status, locale)} size="sm" />
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
