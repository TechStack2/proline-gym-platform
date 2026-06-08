import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
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

  const beltLabel = coach?.belt_rank
    ? (coach.belt_rank as string).replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
    : null

  return (
    <div className={cn('p-4 space-y-4', isRTL && 'rtl')}>
      {/* Avatar + Name Card */}
      <div className="rounded-2xl bg-white p-6 shadow-sm text-center">
        <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-[#cd1419] text-white text-3xl font-bold mb-3">
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
          <span className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-medium bg-red-50 text-[#cd1419]">
            <Award className="h-3.5 w-3.5" />
            {specialization}
          </span>
        )}

        {/* Belt Rank Badge */}
        {beltLabel && (
          <span className="inline-flex items-center gap-1.5 mt-2 ml-2 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
            <Award className="h-3.5 w-3.5" />
            {beltLabel}
          </span>
        )}

        {profile?.phone && (
          <div className="inline-flex items-center gap-1.5 mt-3 text-sm text-gray-500">
            <Phone className="h-3.5 w-3.5" />
            <span dir="ltr">{profile.phone}</span>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm text-center">
          <BookOpen className="h-5 w-5 text-[#cd1419] mx-auto mb-1.5" />
          <p className="text-2xl font-bold text-gray-900">{classesCount ?? 0}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {isRTL ? 'حصة' : locale === 'fr' ? 'Cours' : 'Classes'}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm text-center">
          <Users className="h-5 w-5 text-[#cd1419] mx-auto mb-1.5" />
          <p className="text-2xl font-bold text-gray-900">{studentsCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {isRTL ? 'طالب' : locale === 'fr' ? 'Élèves' : 'Students'}
          </p>
        </div>
      </div>

      {/* Contact & Role Info */}
      <div className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
        <h3 className={cn('text-xs font-semibold text-gray-500 uppercase mb-1 tracking-wider', isRTL && 'font-arabic')}>
          {isRTL ? 'معلومات التواصل' : locale === 'fr' ? 'Coordonnées' : 'Contact Info'}
        </h3>
        <DetailRow
          icon={Mail}
          label={isRTL ? 'البريد الإلكتروني' : locale === 'fr' ? 'Email' : 'Email'}
          value={user.email || (isRTL ? 'غير محدد' : locale === 'fr' ? 'Non défini' : 'Not set')}
        />
        <DetailRow
          icon={Phone}
          label={isRTL ? 'الهاتف' : locale === 'fr' ? 'Téléphone' : 'Phone'}
          value={profile?.phone || (isRTL ? 'غير محدد' : locale === 'fr' ? 'Non défini' : 'Not set')}
        />
        <DetailRow
          icon={Globe}
          label={isRTL ? 'اللغة المفضلة' : locale === 'fr' ? 'Langue préférée' : 'Preferred Language'}
          value={
            profile?.locale === 'ar' ? 'العربية' : profile?.locale === 'fr' ? 'Français' : 'English'
          }
        />
        {roles && roles.length > 0 && (
          <div className="flex items-center gap-3">
            <ShieldIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-500">
                {isRTL ? 'الدور' : locale === 'fr' ? 'Rôle' : 'Role'}
              </p>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {roles.map((r: any) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700"
                  >
                    {r.role === 'head_coach'
                      ? isRTL
                        ? 'مدرب رئيسي'
                        : locale === 'fr'
                          ? 'Entraîneur en chef'
                          : 'Head Coach'
                      : r.role === 'coach'
                        ? isRTL
                          ? 'مدرب'
                          : locale === 'fr'
                            ? 'Entraîneur'
                            : 'Coach'
                        : r.role}
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
            {isRTL ? 'الأجر بالساعة' : locale === 'fr' ? 'Tarif horaire' : 'Hourly Rate'}
          </h3>
          {coach?.hourly_rate_usd && (
            <DetailRow
              icon={DollarSign}
              label="USD"
              value={`$${Number(coach.hourly_rate_usd).toFixed(2)}/hr`}
            />
          )}
          {coach?.hourly_rate_lbp && (
            <DetailRow
              icon={DollarSign}
              label="LBP"
              value={`${Number(coach.hourly_rate_lbp).toLocaleString()}/hr`}
            />
          )}
        </div>
      )}

      {/* Bio */}
      {bio && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h3 className={cn('text-xs font-semibold text-gray-500 uppercase mb-2 tracking-wider', isRTL && 'font-arabic')}>
            {isRTL ? 'نبذة' : locale === 'fr' ? 'Biographie' : 'Bio'}
          </h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{bio}</p>
        </div>
      )}

      {/* Joined Date */}
      <div className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
        <h3 className={cn('text-xs font-semibold text-gray-500 uppercase mb-1 tracking-wider', isRTL && 'font-arabic')}>
          {isRTL ? 'تفاصيل الحساب' : locale === 'fr' ? 'Détails du compte' : 'Account Details'}
        </h3>
        <DetailRow
          icon={CalendarDays}
          label={isRTL ? 'تاريخ الانضمام' : locale === 'fr' ? "Date d'inscription" : 'Joined'}
          value={
            profile?.created_at
              ? new Date(profile.created_at).toLocaleDateString(isRTL ? 'ar-LB' : locale === 'fr' ? 'fr-FR' : 'en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })
              : '—'
          }
        />
      </div>
    </div>
  )
}

function DetailRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
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
