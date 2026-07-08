import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { localizedName } from '@/lib/names'
import { roleHomePath } from '../../onboarding/role-home'
import { PublishPanel } from './PublishPanel'
import { Megaphone, ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

/**
 * J6 GO-LIVE-PANEL — one guided place to take the gym public (Owner Journey 2.0,
 * Sprint 3 finale). A staff-gated page that gathers every "what shows on my public
 * website" control the platform already had — scattered across each Class file and
 * each Coach 360 — into a single, plain-language panel:
 *   • per-class + per-coach visibility toggles (REUSING the exact write paths:
 *     classes.show_on_landing via a direct staff-RLS update like ClassDetail, and
 *     the set_coach_landing RPC via the shared setCoachLanding server action — no fork);
 *   • a live read-only STATUS of what the public page shows (classes · coaches ·
 *     pricing) that updates as you toggle;
 *   • the shareable landing + member-login links (reusing <ShareableLink>) and a
 *     one-tap "open your landing" preview.
 * Owner/head_coach only (the admin tier that both the classes RLS and the coach
 * landing RPC already require); reception is redirected home. Dark + RTL safe via
 * the neutral channel-var palette + logical direction handling.
 */

// The admin tier: both the classes write RLS and set_coach_landing accept owner +
// head_coach (reception can edit a class but never publishes a coach), so the page
// that toggles BOTH is gated to exactly those two roles.
const ADMIN_ROLES = ['owner', 'head_coach']

export default async function PublishPage({ params: { locale } }: { params: { locale: string } }) {
  const supabase = await createClient()

  // Per-page preamble (dashboard convention, mirrors /setup): auth + gym, then an
  // ADMIN gate — the (dashboard) layout only asserts auth, so /publish gates itself.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: me } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
  const gymId = me?.gym_id
  if (!gymId) return null
  const { data: roleRow } = await supabase
    .from('user_roles').select('role').eq('user_id', user.id).limit(1).maybeSingle()
  const role = roleRow?.role as string | undefined
  if (!role || !ADMIN_ROLES.includes(role)) redirect(`/${locale}${roleHomePath(role)}`)

  const t = await getTranslations('publish')
  const isRTL = locale === 'ar'

  // One parallel wave — every read is gym-scoped (the catalog *_read RLS is
  // all-authenticated, so the explicit .eq('gym_id') is the tenant boundary).
  const today = new Date().toISOString().slice(0, 10)
  const [
    { data: gym },
    { data: classRows },
    { data: coachRows },
    { count: planCount },
    { data: ptRows },
    { data: campRows },
  ] = await Promise.all([
    supabase.from('gyms').select('slug, name_ar, name_en, name_fr').eq('id', gymId).maybeSingle(),
    supabase
      .from('classes')
      .select('id, name_ar, name_en, name_fr, show_on_landing')
      .eq('gym_id', gymId).eq('is_active', true).is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('coaches')
      .select('id, landing_visible, landing_status, profiles!inner(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)')
      .eq('gym_id', gymId).eq('is_active', true).is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('membership_plans')
      .select('id', { count: 'exact', head: true })
      .eq('gym_id', gymId).eq('is_active', true).is('deleted_at', null),
    supabase
      .from('pt_packages')
      .select('id, show_on_landing')
      .eq('gym_id', gymId).eq('is_active', true).is('deleted_at', null),
    // M2-B: camps landing visibility (000043 show_on_landing). Camps have NO is_active —
    // list the live, not-yet-ended ones (the set the landing policy can actually show).
    supabase
      .from('camps')
      .select('id, name_ar, name_en, name_fr, show_on_landing')
      .eq('gym_id', gymId).is('deleted_at', null)
      .in('status', ['open', 'in_progress', 'full']).gte('end_date', today)
      .order('start_date', { ascending: false }),
  ])

  type ClassRow = { id: string; name_ar: string | null; name_en: string | null; name_fr: string | null; show_on_landing: boolean | null }
  type CoachRow = { id: string; landing_visible: boolean | null; landing_status: string | null; profiles: Parameters<typeof localizedName>[0] }
  type PtRow = { id: string; show_on_landing: boolean | null }
  type CampRow = { id: string; name_ar: string | null; name_en: string | null; name_fr: string | null; show_on_landing: boolean | null }

  const slug = gym?.slug ?? null
  const classes = ((classRows ?? []) as unknown as ClassRow[]).map((c) => ({
    id: c.id,
    name: (locale === 'ar' ? c.name_ar : locale === 'fr' ? c.name_fr : c.name_en) || c.name_en || '',
    visible: !!c.show_on_landing,
  }))
  const coaches = ((coachRows ?? []) as unknown as CoachRow[]).map((c) => ({
    id: c.id,
    // Names live on the joined profile (coaches has no name column).
    name: localizedName(c.profiles, locale) || t('coachFallback'),
    visible: !!c.landing_visible,
    status: ((c.landing_status as 'active' | 'coming_soon') ?? 'active'),
  }))
  const ptRowsTyped = (ptRows ?? []) as unknown as PtRow[]
  const ptTotal = ptRowsTyped.length
  const ptVisible = ptRowsTyped.filter((p) => p.show_on_landing).length
  const camps = ((campRows ?? []) as unknown as CampRow[]).map((c) => ({
    id: c.id,
    name: (locale === 'ar' ? c.name_ar : locale === 'fr' ? c.name_fr : c.name_en) || c.name_en || '',
    visible: !!c.show_on_landing,
  }))

  return (
    <div
      data-testid="publish-page"
      dir={isRTL ? 'rtl' : 'ltr'}
      className={cn('mx-auto max-w-3xl space-y-5', isRTL && 'text-right')}
    >
      {/* ── Back to the guided setup hub ── */}
      <Link
        href={`/${locale}/setup`}
        data-testid="publish-back-setup"
        className="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700"
      >
        <ArrowLeft className={cn('h-4 w-4', isRTL && 'rotate-180')} />
        {t('backToSetup')}
      </Link>

      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#cd1419]/10 text-primary-600">
            <Megaphone className="h-5 w-5" />
          </span>
          <h1 className={cn('text-2xl font-bold text-gray-900', isRTL && 'font-arabic')}>{t('title')}</h1>
        </div>
        <p className={cn('mt-1 text-sm text-gray-500', isRTL && 'font-arabic')}>{t('subtitle')}</p>
      </div>

      <PublishPanel
        locale={locale}
        isRTL={isRTL}
        slug={slug}
        initialClasses={classes}
        initialCoaches={coaches}
        initialCamps={camps}
        planCount={planCount ?? 0}
        ptVisible={ptVisible}
        ptTotal={ptTotal}
      />
    </div>
  )
}
