import { fmtDate, fmtPhone } from '@/lib/fmt'
import { fmtUsd, fmtLbp } from '@/lib/billing/currency'
import { Ltr } from '@/components/ui/bdi'
import { CoachProfileEditor } from './CoachProfileEditor'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import { PushToggle } from '@/components/push/push-toggle'
import { DeskGrid } from '@/components/portal/portal-kit'
import { storagePublicUrl } from '@/lib/storage/public-url'
import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { beltRankLabel } from '@/lib/belts/label'
import { cn } from '@/lib/utils'
import {
  User,
  Phone,
  Mail,
  Award,
  Globe,
  DollarSign,
  BookOpen,
  Users,
  CalendarDays,
} from 'lucide-react'

type Props = { params: { locale: string } }

export default async function CoachProfilePage({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'coach' })
  // W3a/DA-36: the page's dozen hardcoded ar/fr/en ternaries became i18n keys —
  // visible to the missing-key gate, editable by translators.
  const tp = await getTranslations({ locale, namespace: 'coachProfilePage' })
  const isRTL = locale === 'ar'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Fetch coach record joined with profile and user_roles
  const { data: coachRaw } = await supabase
    .from('coaches')
    .select(`*, profiles:profile_id (*)`)
    .eq('profile_id', user.id)
    .single()

  const coach: any = coachRaw
  const profilesArr = coach?.profiles
  const profile = Array.isArray(profilesArr) ? profilesArr[0] : profilesArr

  // COACH-LP: the coach's own pending draft (if any) — seeds the self-editor.
  const { data: pendingDraft } = coach?.id
    ? await supabase.from('coach_profile_pending').select('*').eq('coach_id', coach.id).maybeSingle()
    : { data: null }

  // COACH-PHOTO-GATE: a staged draft photo lives in the PRIVATE coach-avatar-drafts
  // bucket → sign it for the coach's own preview (RLS lets the owner read it).
  let draftPhotoUrl: string | null = null
  if ((pendingDraft as any)?.avatar_url) {
    const { data: signed } = await supabase.storage
      .from('coach-avatar-drafts')
      .createSignedUrl((pendingDraft as any).avatar_url, 3600)
    draftPhotoUrl = signed?.signedUrl ?? null
  }

  // Fetch user roles
  const { data: roles } = await supabase.from('user_roles').select('*').eq('user_id', user.id)

  // Stats: number of classes taught by this coach
  const { count: classesCount } = await supabase
    .from('classes')
    .select('*', { count: 'exact', head: true })
    .eq('coach_id', coach?.id)

  // Get all classes taught by this coach
  const { data: coachClasses } = await supabase
    .from('classes')
    .select('id')
    .eq('coach_id', coach?.id)

  const coachClassIds = coachClasses?.map((c: any) => c.id) || []

  let studentsCount = 0
  if (coachClassIds.length > 0) {
    const { count } = await supabase
      .from('class_enrollments')
      .select('*', { count: 'exact', head: true })
      .in('class_id', coachClassIds)
    studentsCount = count || 0
  }

  // Locale-aware helpers
  const firstName = isRTL
    ? profile?.first_name_ar
    : locale === 'fr'
      ? profile?.first_name_fr
      : profile?.first_name_en
  const lastName = isRTL
    ? profile?.last_name_ar
    : locale === 'fr'
      ? profile?.last_name_fr
      : profile?.last_name_en
  const specialization = isRTL
    ? coach?.specialization_ar
    : locale === 'fr'
      ? coach?.specialization_fr
      : coach?.specialization_en
  const bio = isRTL
    ? coach?.bio_ar
    : locale === 'fr'
      ? coach?.bio_fr
      : coach?.bio_en

  const tb = await getTranslations({ locale, namespace: 'beltRanks' })
  const beltLabel = coach?.belt_rank ? beltRankLabel(coach.belt_rank as string, tb) : null

  return (
    /* W3a R3: the undefined `rtl` class swept (DA-61). */
    <div className="p-4 space-y-4">
    {/* W2a §4.2 Rule 1: main = identity card → stats → contact & role → hourly
        rate → bio → account details → self-editor; aside = push toggle +
        interface-language (on mobile these two now render AFTER main — intended). */}
    <DeskGrid gap="space-y-4" main={<>
      {/* Avatar + Name Card */}
      <div className="rounded-2xl bg-white p-6 shadow-sm text-center">
        <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-primary-700 text-primary-foreground text-3xl font-bold mb-3">
          {firstName?.charAt(0) || '?'}
        </div>
        <h2 className={cn('text-xl font-bold text-gray-900', isRTL && 'font-arabic')}>
          {firstName} {lastName}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {t('profile.role_label')}
        </p>

        {/* Specialization Badge */}
        {specialization && (
          <span className="tint-brand inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-medium">
            <Award className="h-3.5 w-3.5" />
            {specialization}
          </span>
        )}

        {/* Belt Rank Badge */}
        {beltLabel && (
          <span className="inline-flex items-center gap-1.5 mt-2 ms-2 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
            <Award className="h-3.5 w-3.5" />
            {beltLabel}
          </span>
        )}

        {profile?.phone && (
          <div className="inline-flex items-center gap-1.5 mt-3 text-sm text-gray-500">
            <Phone className="h-3.5 w-3.5" />
            <Ltr>{fmtPhone(profile.phone)}</Ltr>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm text-center">
          <BookOpen className="h-5 w-5 text-primary-700 mx-auto mb-1.5" />
          <p className="text-2xl font-bold text-gray-900">{classesCount ?? 0}</p>
          <p className="text-xs text-gray-500 mt-0.5">
{tp('classes')}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm text-center">
          <Users className="h-5 w-5 text-primary-700 mx-auto mb-1.5" />
          <p className="text-2xl font-bold text-gray-900">{studentsCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">
{tp('students')}
          </p>
        </div>
      </div>

      {/* Contact & Role Info */}
      <div className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
        <h3 className={cn('text-xs font-semibold text-gray-500 uppercase mb-1 tracking-wider', isRTL && 'font-arabic')}>
{tp('contactInfo')}
        </h3>
        <DetailRow
          icon={Mail}
          label={tp('email')}
          value={user.email || tp('notSet')}
        />
        <DetailRow
          icon={Phone}
          label={tp('phone')}
          value={profile?.phone ? <Ltr>{fmtPhone(profile.phone)}</Ltr> : tp('notSet')}
        />
        <DetailRow
          icon={Globe}
          label={tp('preferredLanguage')}
          value={
            profile?.locale === 'ar' ? 'العربية' : profile?.locale === 'fr' ? 'Français' : 'English'
          }
        />
        {roles && roles.length > 0 && (
          <div className="flex items-center gap-3">
            <ShieldIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-500">{tp('role')}</p>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {roles.map((r: any) => (
                  <span
                    key={r.id}
                    className="tint-info inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                  >
                    {r.role === 'head_coach' ? tp('headCoach') : r.role === 'coach' ? tp('coach') : r.role}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hourly Rate */}
      {(coach?.hourly_rate_usd || coach?.hourly_rate_lbp) && (
        <div className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
          <h3 className={cn('text-xs font-semibold text-gray-500 uppercase mb-1 tracking-wider', isRTL && 'font-arabic')}>
{tp('hourlyRate')}
          </h3>
          {coach?.hourly_rate_usd && (
            <DetailRow
              icon={DollarSign}
              label="USD"
              value={<Ltr>{`${fmtUsd(Number(coach.hourly_rate_usd))}/${tp('hr')}`}</Ltr>}
            />
          )}
          {coach?.hourly_rate_lbp && (
            <DetailRow
              icon={DollarSign}
              label="LBP"
              value={<Ltr>{`${fmtLbp(Number(coach.hourly_rate_lbp))}/${tp('hr')}`}</Ltr>}
            />
          )}
        </div>
      )}

      {/* Bio */}
      {bio && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h3 className={cn('text-xs font-semibold text-gray-500 uppercase mb-2 tracking-wider', isRTL && 'font-arabic')}>
{tp('bio')}
          </h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{bio}</p>
        </div>
      )}

      {/* Joined Date */}
      <div className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
        <h3 className={cn('text-xs font-semibold text-gray-500 uppercase mb-1 tracking-wider', isRTL && 'font-arabic')}>
{tp('accountDetails')}
        </h3>
        <DetailRow
          icon={CalendarDays}
          label={tp('joined')}
          value={<Ltr>{fmtDate(profile?.created_at, locale, 'medium')}</Ltr>}
        />
      </div>

      {/* COACH-LP: self-edit → pending draft (admin publishes from Coach-360) */}
      {coach?.id && (
        <CoachProfileEditor
          coachId={coach.id}
          locale={locale}
          name={[firstName, lastName].filter(Boolean).join(' ').trim() || (profile?.first_name_en ?? '')}
          avatarUrl={storagePublicUrl('avatars', profile?.avatar_url, profile?.updated_at) || null}
          gymId={coach.gym_id}
          profileId={user.id}
          draftPhotoUrl={draftPhotoUrl}
          draftPhotoPath={(pendingDraft as any)?.avatar_url ?? null}
          live={{
            specialization_ar: coach.specialization_ar ?? '',
            specialization_en: coach.specialization_en ?? '',
            specialization_fr: coach.specialization_fr ?? '',
            bio_ar: coach.bio_ar ?? '',
            bio_en: coach.bio_en ?? '',
            bio_fr: coach.bio_fr ?? '',
          }}
          pending={pendingDraft ?? null}
          hasPending={!!coach.has_pending_changes}
        />
      )}
    </>} aside={<>
      <PushToggle />
      {/* PWA-BASICS R1: an always-editable INTERFACE-language control. The coach shell
          previously exposed no language switcher (only the read-only messaging
          preference above), so a coach stuck on the wrong UI language had no way out. */}
      <div className="rounded-2xl bg-white p-4 shadow-sm" data-testid="settings-language">
        <h3 className={cn('text-xs font-semibold text-gray-500 uppercase mb-2 tracking-wider', isRTL && 'font-arabic')}>
{tp('interfaceLanguage')}
        </h3>
        <LanguageSwitcher locale={locale} variant="inline" />
      </div>
    </>} />
    </div>
  )
}

function DetailRow({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 text-gray-400 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm text-gray-700 truncate">{value}</p>
      </div>
    </div>
  )
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}
