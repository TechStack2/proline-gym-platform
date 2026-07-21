import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { StatusChip } from '@/components/ui/status-chip'
import { PageHeader } from '@/components/ui/page-header'
import { localizedName, one } from '@/lib/names'
import { Calendar, Search } from 'lucide-react'
import { PortalClassesClient } from './portal-classes-client'
import { MySchedule } from './my-schedule'

export const dynamic = 'force-dynamic'

type Props = { params: { locale: string }; searchParams?: { kid?: string; view?: string } }

/**
 * DS 2.0 §3 (RULED 2026-07-20) — Classes = catalog + weekly schedule MERGED
 * behind a segmented control (Schedule | Browse). Both answer "when/what can I
 * train"; the old split forced one question across two tabs. Default = Schedule
 * (the ruling's first segment); a guardian acting for a kid (?kid=) defaults to
 * Browse (the acting-for flows are catalog flows). /portal/schedule deep links
 * redirect here with ?view=schedule — nothing 404s.
 *
 * Desktop (§4.2 Rule 1): main = the active segment; aside = the member's
 * registration glance (statuses), from the same query set (§2.4 rule 2).
 */
export default async function PortalClassesPage({ params: { locale }, searchParams }: Props) {
  const tt = await getTranslations('portalClasses')
  const isRTL = locale === 'ar'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const view: 'schedule' | 'browse' =
    searchParams?.view === 'browse' ? 'browse'
    : searchParams?.view === 'schedule' ? 'schedule'
    : searchParams?.kid ? 'browse'
    : 'schedule'

  const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
  const gymId = profile?.gym_id
  if (!gymId) return null
  const { data: ownStudent } = await supabase.from('students').select('id').eq('profile_id', user.id).maybeSingle()

  // B3: a linked guardian can act FOR a kid (?kid=<studentId>). The link is
  // verified server-side (guardian RLS makes a non-linked kid unreadable).
  let kid: { id: string; name: string } | null = null
  if (searchParams?.kid) {
    const { data: kidRow } = await supabase
      .from('students')
      .select('id, profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)')
      .eq('id', searchParams.kid)
      .maybeSingle()
    if (kidRow) {
      kid = { id: kidRow.id, name: localizedName(one((kidRow as any).profiles), locale) }
    }
  }
  const student = kid ? { id: kid.id } : ownStudent

  // The registration glance is shared by BOTH segments (aside on desktop).
  const { data: regs } = student
    ? await supabase
        .from('class_registrations')
        .select('id, class_id, status, waitlist_position, monthly_fee_usd, end_date')
        .eq('student_id', student.id)
        .order('requested_at', { ascending: false })
    : { data: [] as any[] }

  // Latest OPEN registration per class (requested/active/waitlisted).
  const openByClass = new Map<string, any>()
  for (const r of (regs ?? []) as any[]) {
    if (['requested', 'active', 'waitlisted'].includes(r.status) && !openByClass.has(r.class_id)) {
      openByClass.set(r.class_id, r)
    }
  }

  // Catalog data only feeds the Browse segment.
  let classes: any[] = []
  if (view === 'browse') {
    const { data: classesRaw } = await supabase
      .from('classes')
      .select(`id, name_ar, name_en, name_fr, monthly_fee_usd, monthly_fee_lbp, max_capacity, status,
        coach:coaches(profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)),
        schedules:class_schedules(day_of_week, start_time, end_time)`)
      .eq('gym_id', gymId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    classes = (classesRaw ?? []).map((c: any) => ({
      id: c.id,
      name: (locale === 'ar' ? c.name_ar : locale === 'fr' ? c.name_fr : c.name_en) || c.name_en,
      coachName: localizedName(one(c.coach)?.profiles, locale),
      monthly_fee_usd: c.monthly_fee_usd,
      monthly_fee_lbp: c.monthly_fee_lbp,
      schedules: c.schedules ?? [],
      registration: openByClass.get(c.id) ?? null,
    }))
  }

  // The class-name map for the aside glance (needs names even in schedule view).
  const openRegs = [...openByClass.values()]
  let regNames = new Map<string, string>()
  if (openRegs.length && view !== 'browse') {
    const { data: regClasses } = await supabase
      .from('classes')
      .select('id, name_ar, name_en, name_fr')
      .in('id', openRegs.map((r) => r.class_id))
    regNames = new Map(((regClasses ?? []) as any[]).map((c) => [
      c.id,
      (locale === 'ar' ? c.name_ar : locale === 'fr' ? c.name_fr : c.name_en) || c.name_en,
    ]))
  } else {
    regNames = new Map(classes.map((c) => [c.id, c.name]))
  }

  const segHref = (v: 'schedule' | 'browse') =>
    `/${locale}/portal/classes?view=${v}${kid ? `&kid=${kid.id}` : ''}`

  // W3a §2.3: colour via the registration vocabulary (StatusChip); labels stay
  // this page's strings (waitlist carries the position).
  const regStatusLabel = (r: any): string =>
    r.status === 'active' ? tt('statusActive')
    : r.status === 'requested' ? tt('statusRequested')
    : r.status === 'waitlisted' ? tt('statusWaitlist', { n: r.waitlist_position ?? '' })
    : r.status

  return (
    /* W3a R3: the undefined `rtl` class + the physical text-right swept (DA-61 /
       §4.1 logical-side law — dir already aligns the text). */
    <div className="p-4 space-y-4">
      <div>
        {/* W2b R3: the ONE title primitive (testid `page-title`); mobile keeps
            the always-visible subtitle line (chrome owns the mobile title). */}
        <PageHeader title={tt('title')} subtitle={tt('subtitle')} variant="compact" />
        <p className="text-sm text-gray-500 md:hidden">
          {tt('subtitle')}
        </p>
      </div>
      {kid && (
        <p data-testid="acting-for-kid" className="rounded-xl bg-primary-50 px-3 py-2 text-sm font-medium text-primary-700">
          {tt('actingFor', { name: kid.name })}
        </p>
      )}

      {/* §3: the ruled segmented control — Schedule | Browse. Links (not client
          state) so the server page fetches only the active segment's data. */}
      <nav
        data-testid="classes-segments"
        aria-label={tt('title')}
        className="inline-flex rounded-xl bg-gray-100 p-1"
      >
        {(['schedule', 'browse'] as const).map((v) => (
          <Link
            key={v}
            href={segHref(v)}
            data-testid={`classes-seg-${v}`}
            aria-current={view === v ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {v === 'schedule' ? <Calendar className="h-4 w-4" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
            {v === 'schedule' ? tt('viewSchedule') : tt('viewBrowse')}
          </Link>
        ))}
      </nav>

      {/* §4.2 Rule 1: main (the active segment) + aside (registration glance). */}
      <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div>
          {view === 'schedule' ? (
            <MySchedule locale={locale} />
          ) : (
            <PortalClassesClient classes={classes} locale={locale} hasStudent={!!student} kidId={kid?.id} />
          )}
        </div>

        {openRegs.length > 0 && (
          <aside className="mt-4 lg:mt-0" data-testid="classes-reg-glance">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900">{tt('myRegs')}</h3>
              <ul className="mt-2 space-y-2">
                {openRegs.map((r: any) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-gray-700">{regNames.get(r.class_id) ?? ''}</span>
                    <StatusChip domain="registration" status={r.status} label={regStatusLabel(r)} className="shrink-0 font-semibold" />
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
