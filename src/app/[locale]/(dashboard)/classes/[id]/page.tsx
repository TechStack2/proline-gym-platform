import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { localizedName, one } from '@/lib/names'
import { getMemberEnrichment } from '@/lib/members/enrichment'
import ClassDetail from './ClassDetail'
import { getGymCyclePolicy } from '@/lib/billing/cycle-policy'

export const dynamic = 'force-dynamic'

async function getClass(id: string) {
  const supabase = await createClient()
  
  // NB: legacy embeds selected non-existent columns (coaches.first_name,
  // students.first_name/belt_rank/email, class_enrollments.status) → PostgREST
  // errored and the page 404'd. Corrected to the real normalized schema so the
  // class-detail page (and its Enroll modal) loads.
  const { data: classData, error } = await supabase
    .from('classes')
    .select(`
      *,
      discipline:disciplines(id, name_ar, name_en, name_fr),
      coach:coaches(id, profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)),
      schedules:class_schedules(*)
    `)
    .eq('id', id)
    .single()

  if (error || !classData) {
    return null
  }

  // Get enrollments with student details (via the normalized profiles row).
  const { data: enrollments } = await supabase
    .from('class_enrollments')
    .select(`
      *,
      student:students(id, current_belt_rank, profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr))
    `)
    .eq('class_id', id)
    .eq('is_active', true)
    .order('enrolled_at', { ascending: false })

  return {
    ...classData,
    enrollments: enrollments || [],
    enrollments_count: enrollments?.length || 0
  }
}

export default async function ClassDetailPage({
  params: { locale, id },
}: {
  params: { locale: string; id: string }
}) {
  const supabase = await createClient()
  const classData = await getClass(id)
  if (!classData) {
    notFound()
  }

  // MEMBER-ENRICH: each roster student's discipline(s) (belt already on the row).
  const rosterIds = (classData.enrollments as any[]).map((e) => one(e.student)?.id).filter(Boolean) as string[]
  const memberInfo = await getMemberEnrichment(supabase, (classData as any).gym_id, rosterIds, locale)

  // B2: registrations (request→approve→bill→waitlist) + a member picker for walk-ins.
  // BILL-CYCLES: also read the cycle fields so the panel shows/edit the billing cycle.
  const { data: regsRaw } = await supabase
    .from('class_registrations')
    .select(`id, status, waitlist_position, monthly_fee_usd, discount_pct, discount_amount_usd, invoice_id, requested_at,
      start_date, billing_anchor, paid_until, end_date, first_cycle_prorated,
      student:students(id, profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr))`)
    .eq('class_id', id)
    .in('status', ['requested', 'active', 'waitlisted'])
    .order('requested_at', { ascending: true })

  const registrations = (regsRaw ?? []).map((r: any) => ({
    id: r.id, status: r.status, waitlist_position: r.waitlist_position,
    monthly_fee_usd: r.monthly_fee_usd, invoice_id: r.invoice_id,
    start_date: r.start_date, billing_anchor: r.billing_anchor, paid_until: r.paid_until,
    end_date: r.end_date, first_cycle_prorated: r.first_cycle_prorated,
    studentName: localizedName(one(r.student)?.profiles, locale),
  }))

  // BILL-CYCLES: the day's FX rate feeds the dual-currency proration preview.
  const { data: rateRow } = await supabase
    .from('exchange_rates').select('rate')
    .eq('gym_id', (classData as any).gym_id)
    .order('rate_date', { ascending: false }).limit(1).maybeSingle()
  const rate = (rateRow as any)?.rate ?? null
  // BILL-POLICY: the gym's cycle policy drives the anchor the preview derives and
  // the prorate default — it must agree with what _default_billing_anchor does in
  // SQL, so both read the same two columns.
  const cyclePolicy = await getGymCyclePolicy(supabase, (classData as any).gym_id)
  const today = new Date().toISOString().slice(0, 10)

  const { data: studentRows } = await supabase
    .from('students')
    .select('id, profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)')
    .eq('gym_id', (classData as any).gym_id)
    .eq('is_active', true)
  const students = (studentRows ?? [])
    .map((s: any) => ({ id: s.id, name: localizedName(one(s.profiles), locale) }))
    .filter((s) => s.name)
    .sort((a, b) => a.name.localeCompare(b.name))

  // ADM-1 admin bar: the edit wizard needs the gym's disciplines + active
  // coaches; archive shows the active-registrations count warning.
  const [{ data: disciplines }, { data: coaches }, { count: activeRegCount }] = await Promise.all([
    supabase.from('disciplines').select('*').eq('gym_id', (classData as any).gym_id).eq('is_active', true).order('sort_order'),
    supabase.from('coaches')
      .select('id, profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, avatar_url)')
      .eq('gym_id', (classData as any).gym_id)
      .eq('is_active', true),
    supabase.from('class_registrations').select('id', { count: 'exact', head: true })
      .eq('class_id', id).eq('status', 'active'),
  ])

  return (
    <ClassDetail
      classData={classData}
      locale={locale}
      registrations={registrations}
      students={students}
      disciplines={disciplines ?? []}
      coaches={coaches ?? []}
      activeRegCount={activeRegCount ?? 0}
      memberInfo={memberInfo}
      rate={rate}
      today={today}
      cyclePolicy={cyclePolicy}
    />
  )
}