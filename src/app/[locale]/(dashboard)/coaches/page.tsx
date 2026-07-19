import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CoachList } from './components/coach-list'
import { CoachFilters } from './components/coach-filters'
import { StaffAccessList, type StaffMember } from './components/staff-access-list'
import { matchingProfileIds } from '@/lib/admin/profile-search'
import { InviteStaffButton } from '@/components/shared/invite-staff-button'
import { localizedName } from '@/lib/names'
import { PageHeader } from '@/components/ui/page-header';

export default async function CoachesPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string }
  searchParams: { search?: string; status?: string }
}) {
  const supabase = await createClient()
  const t = await getTranslations('coaches')
  const isRTL = locale === 'ar'

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: me } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
  const gymId = me?.gym_id
  if (!gymId) return null

  // STAFF-INVITE: minting staff logins is owner/head_coach-only (the server action
  // re-gates; this only gates the surface).
  const { data: roleRow } = await supabase
    .from('user_roles').select('role').eq('user_id', user.id).limit(1).maybeSingle()
  const canInviteStaff = ['owner', 'head_coach'].includes((roleRow as any)?.role ?? '')

  // STAFF-MGMT: the TEAM list reads user_roles (not the coaches table) so ALL staff
  // roles show — owner, head_coach, coach AND receptionist. A receptionist has a
  // user_roles row but no coaches row, so the coaches-table list below never showed
  // them. profiles is joined in JS (no FK user_roles.user_id→profiles for embedding).
  const { data: staffRoles } = await supabase
    .from('user_roles').select('user_id, role, is_active')
    .eq('gym_id', gymId).in('role', ['owner', 'head_coach', 'coach', 'receptionist'])
  const staffUserIds = [...new Set((staffRoles ?? []).map((r: any) => r.user_id))]
  const staffProfiles: any[] = staffUserIds.length
    ? ((await supabase.from('profiles')
        .select('id, first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, avatar_url')
        .in('id', staffUserIds)).data ?? [])
    : []
  const profById = new Map(staffProfiles.map((p: any) => [p.id, p]))
  const staffMap = new Map<string, { userId: string; roles: string[]; isActive: boolean; profile: any }>()
  for (const r of (staffRoles ?? []) as any[]) {
    const cur = staffMap.get(r.user_id) ?? { userId: r.user_id, roles: [] as string[], isActive: false, profile: profById.get(r.user_id) }
    cur.roles.push(r.role)
    cur.isActive = cur.isActive || r.is_active // active if any staff role is active
    staffMap.set(r.user_id, cur)
  }
  const staff: StaffMember[] = [...staffMap.values()].map((s) => ({
    userId: s.userId,
    name: localizedName(s.profile, locale),
    avatarUrl: s.profile?.avatar_url ?? null,
    roles: [...new Set(s.roles)],
    isActive: s.isActive,
  }))

  let query = supabase
    .from('coaches')
    .select(`
      *,
      profiles!inner (
        id,
        first_name_ar,
        first_name_en,
        first_name_fr,
        last_name_ar,
        last_name_en,
        last_name_fr,
        phone,
        avatar_url
      )
    `)
    .eq('gym_id', gymId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (searchParams.search) {
    // Names/phone live on profiles — match there, then filter coaches by profile_id.
    const ids = await matchingProfileIds(supabase, gymId, searchParams.search)
    query = query.in('profile_id', ids)
  }
  if (searchParams.status) {
    query = query.eq('is_active', searchParams.status === 'active')
  }

  const { data: coaches, error } = await query

  if (error) {
    console.error('Error fetching coaches:', error)
    return <div className="text-red-500">{t('error_loading')}</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader segment="coaches" />
        <div className="flex items-start gap-2">
          {/* STAFF-INVITE: create + invite a staff login (receptionist/head-coach/coach). */}
          {canInviteStaff && <InviteStaffButton locale={locale} gymId={gymId} />}
          <Link href={`/${locale}/coaches/add`}>
            <Button>
              <Plus className="w-4 h-4 ms-2" />
              {t('add_coach')}
            </Button>
          </Link>
        </div>
      </div>

      {/* STAFF-MGMT: the full team + per-member access control (all staff roles). */}
      <StaffAccessList staff={staff} canManage={canInviteStaff} currentUserId={user.id} locale={locale} />

      <CoachFilters locale={locale} isRTL={isRTL} />

      <CoachList
        coaches={coaches || []}
        locale={locale}
        isRTL={isRTL}
      />
    </div>
  )
}
