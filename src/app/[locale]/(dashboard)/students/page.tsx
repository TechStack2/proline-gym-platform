import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { StudentList } from './components/student-list'
import { StudentFilters } from './components/student-filters'
import { matchingProfileIds } from '@/lib/admin/profile-search'
import { getMemberEnrichment } from '@/lib/members/enrichment'
import { getEnabledProducts } from '@/lib/gym/products'
import { LeadsPipeline } from '../leads/leads-pipeline'

export default async function StudentsPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string }
  searchParams: { search?: string; discipline?: string; belt?: string; status?: string; tab?: string; chip?: string }
}) {
  const supabase = await createClient()
  const t = await getTranslations('students')
  const isRTL = locale === 'ar'
  const activeTab = searchParams.tab === 'prospects' ? 'prospects' : 'active'

  // ── IA-2: Members workspace tabs — Active (roster) | Prospects (lead pipeline,
  //    re-homed from /leads; conversion moves a person across, same flow) ──
  const Tabs = (
    <div className="inline-flex rounded-xl border bg-gray-50 p-1" data-testid="members-tabs">
      <Link href={`/${locale}/students`} data-testid="tab-active"
        className={cn('rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
          activeTab === 'active' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-800')}>
        {t('tabs_active')}
      </Link>
      <Link href={`/${locale}/students?tab=prospects`} data-testid="tab-prospects"
        className={cn('rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
          activeTab === 'prospects' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-800')}>
        {t('tabs_prospects')}
      </Link>
    </div>
  )

  if (activeTab === 'prospects') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          {/* SHELL-IA: mobile shows the large title; the Active/Prospects tabs lead. */}
          <h1 className={cn('hidden md:block text-3xl font-bold', isRTL && 'text-right')}>{t('title')}</h1>
          {Tabs}
        </div>
        <LeadsPipeline locale={locale} searchParams={searchParams} />
      </div>
    )
  }

  // ── Auth + gym_id for multi-tenant isolation ──────────
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('gym_id')
    .eq('id', user.id)
    .single()

  const gymId = profile?.gym_id
  if (!gymId) return null

  // NO-MEMBERSHIP-GAPS: the "expiring" chip is membership-expiry — hidden for a
  // classes+PT gym.
  const products = await getEnabledProducts(supabase, gymId)

  // Fetch students with profile data. PERF-2: only the columns the roster actually
  // reads (id, is_active, join_date, current_belt_rank + the embedded profile) — the
  // old `select('*')` pulled every students column over the wire unused.
  let query = supabase
    .from('students')
    .select(`
      id,
      is_active,
      join_date,
      current_belt_rank,
      profiles!inner (
        id,
        first_name_ar,
        first_name_en,
        first_name_fr,
        last_name_ar,
        last_name_en,
        last_name_fr,
        phone,
        avatar_url,
        date_of_birth
      )
    `)
    .eq('gym_id', gymId)
    .order('created_at', { ascending: false })

  if (searchParams.search) {
    // Names/phone live on profiles — match there (gym-scoped), then filter
    // students by profile_id. (The legacy top-level .or() over embedded
    // profiles.* columns never matched anything.)
    const ids = await matchingProfileIds(supabase, gymId, searchParams.search)
    query = query.in('profile_id', ids)
  }
  if (searchParams.status) {
    query = query.eq('is_active', searchParams.status === 'active')
  }

  const { data: students, error } = await query

  // ── FD-1: row badges + filter chips — bulk maps over the fetched roster ──
  //   expiring  = active membership ending within 7 days
  //   owing     = any open (pending/partial/overdue) invoice
  //   noguardian= minor (<18) with no guardian link
  //   recent    = joined within 30 days
  const ids = (students ?? []).map((s: any) => s.id)
  const today = new Date().toISOString().slice(0, 10)
  const in7d = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
  const ago30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  const [{ data: expRows }, { data: owingRows }, { data: guardRows }] = ids.length
    ? await Promise.all([
        supabase.from('student_memberships').select('student_id, end_date')
          .in('student_id', ids).eq('status', 'active').gte('end_date', today).lte('end_date', in7d),
        supabase.from('invoices').select('student_id')
          .eq('gym_id', gymId).in('student_id', ids).in('status', ['pending', 'partial', 'overdue']),
        supabase.from('guardian_students').select('student_id').in('student_id', ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]
  const expiringBy = new Map<string, string>()
  for (const r of (expRows ?? []) as any[]) {
    const cur = expiringBy.get(r.student_id)
    if (!cur || r.end_date < cur) expiringBy.set(r.student_id, r.end_date)
  }
  const owingSet = new Set(((owingRows ?? []) as any[]).map((r) => r.student_id))
  const guardianSet = new Set(((guardRows ?? []) as any[]).map((r) => r.student_id))
  const isMinor = (s: any) => {
    const dob = (Array.isArray(s.profiles) ? s.profiles[0] : s.profiles)?.date_of_birth
    return dob ? (Date.now() - new Date(dob).getTime()) / (365.25 * 864e5) < 18 : false
  }
  const chipPredicates: Record<string, (s: any) => boolean> = {
    owing: (s) => owingSet.has(s.id),
    expiring: (s) => expiringBy.has(s.id),
    noguardian: (s) => isMinor(s) && !guardianSet.has(s.id),
    recent: (s) => s.join_date >= ago30,
  }
  const chip = searchParams.chip && chipPredicates[searchParams.chip] ? searchParams.chip : ''
  const visibleStudents = chip ? (students ?? []).filter(chipPredicates[chip]) : (students ?? [])

  // PERF-2: the per-member enrichment and the disciplines filter list are independent
  // — fetch them in one wave instead of back-to-back.
  //   MEMBER-ENRICH: discipline(s) + active class(es) + membership status per visible
  //   member (one gym-scoped read; the class→discipline join the card lacked).
  const [memberInfo, { data: disciplines }] = await Promise.all([
    getMemberEnrichment(supabase, gymId, visibleStudents.map((s: any) => s.id), locale),
    supabase
      .from('disciplines')
      .select(`id, name_${locale}`)
      .eq('gym_id', gymId)
      .eq('is_active', true)
      .order(`name_${locale}`),
  ])
  const chipCounts = Object.fromEntries(
    Object.entries(chipPredicates).map(([k, pred]) => [k, (students ?? []).filter(pred).length]),
  )

  // Fetch belt ranks for filter. ADM-2: belt_hierarchies has NO gym_id column —
  // the old .eq('gym_id', …) was a phantom-column 42703 that silently emptied
  // this filter; scope through the gym's active disciplines instead.
  const disciplineIdsForBelts = (disciplines || []).map((d: any) => d.id)
  const { data: beltRanks } = disciplineIdsForBelts.length
    ? await supabase
        .from('belt_hierarchies')
        .select('id, name_ar, name_en, sort_order')
        .in('discipline_id', disciplineIdsForBelts)
        .eq('is_active', true) // UX-2 ladder archive
        .order('sort_order')
    : { data: [] as any[] }

  if (error) {
    console.error('Error fetching students:', error)
    return <div className="text-red-500">{t('error_loading')}</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* SHELL-IA: mobile shows the large title; the Active/Prospects tabs lead. */}
        <h1 className={cn("hidden md:block text-3xl font-bold", isRTL && "text-right")}>
          {t('title')}
        </h1>
        <div className="flex items-center gap-3">
          {Tabs}
          <Link href={`/${locale}/students/add`}>
            <Button>
              <Plus className="w-4 h-4 ms-2" />
              {t('add_student')}
            </Button>
          </Link>
        </div>
      </div>

      <StudentFilters
        disciplines={(disciplines || []) as any}
        beltRanks={(beltRanks || []) as any}
        locale={locale}
        isRTL={isRTL}
      />

      {/* FD-1 filter chips — “who needs attention” without opening files */}
      <div className="flex flex-wrap gap-2" data-testid="member-chips">
        {(['owing', 'expiring', 'noguardian', 'recent'] as const)
          .filter((k) => k !== 'expiring' || products.membership)
          .map((k) => (
          <Link
            key={k}
            href={`/${locale}/students${chip === k ? '' : `?chip=${k}`}`}
            data-testid={`chip-${k}`}
            data-count={chipCounts[k]}
            className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              chip === k ? 'border-[#cd1419] bg-[#cd1419] text-primary-foreground' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}
          >
            {t(`chips.${k}`)} · {chipCounts[k]}
          </Link>
        ))}
      </div>

      <StudentList
        students={visibleStudents}
        locale={locale}
        isRTL={isRTL}
        expiringBy={Object.fromEntries(expiringBy)}
        owing={[...owingSet]}
        memberInfo={memberInfo}
      />
    </div>
  )
}
