import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { dateLocale } from '@/lib/utils/locale-format'
import { cn } from '@/lib/utils'
import { User, Phone, CalendarDays, Shield, Award, CreditCard, AlertCircle } from 'lucide-react'
import { AvatarUpload } from '@/components/shared/avatar-upload'

type Props = { params: { locale: string } }

export default async function PortalProfilePage({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'portalProfile' })
  const isRTL = locale === 'ar'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const { data: student } = await supabase.from('students').select('*').eq('profile_id', user.id).single()
  const { data: membership } = await supabase.from('student_memberships')
    .select('status, start_date, end_date, membership_plans:plan_id (name_en, name_ar, name_fr, duration_days, price_usd)')
    .eq('student_id', student?.id).eq('status', 'active').maybeSingle()
  const { data: belt } = await supabase.from('belt_promotions')
    .select('to_rank, promotion_date, discipline_id, disciplines:discipline_id (name_en, name_ar, name_fr)')
    .eq('student_id', student?.id).order('promotion_date', { ascending: false }).limit(1).maybeSingle()
  const { data: guardians } = await supabase.from('guardian_students')
    .select(`guardian_id, guardians:guardian_id (profile_id, relationship_en, relationship_ar, relationship_fr, profiles:profile_id (first_name_en, first_name_ar, first_name_fr, last_name_en, last_name_ar, last_name_fr, phone))`)
    .eq('student_id', student?.id)

  const firstName = isRTL ? profile?.first_name_ar : (locale === 'fr' ? profile?.first_name_fr : profile?.first_name_en)
  const lastName = isRTL ? profile?.last_name_ar : (locale === 'fr' ? profile?.last_name_fr : profile?.last_name_en)
  const beltLabelVal = belt?.to_rank ? (belt.to_rank as string).replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : null
  const mplans: any = (membership as any)?.membership_plans
  const mplan = Array.isArray(mplans) ? mplans[0] : mplans
  const membershipNameVal = mplan ? (isRTL ? mplan.name_ar : (locale === 'fr' ? mplan.name_fr : mplan.name_en)) : null
  const disc: any = (belt as any)?.disciplines
  const discObj = Array.isArray(disc) ? disc[0] : disc

  const guardianLabel = (g: any) => {
    const gd: any = g?.guardians
    const gdObj = Array.isArray(gd) ? gd[0] : gd
    const p: any = gdObj?.profiles
    const pObj = Array.isArray(p) ? p[0] : p
    if (!pObj) return ''
    const fn = isRTL ? pObj.first_name_ar : (locale === 'fr' ? pObj.first_name_fr : pObj.first_name_en)
    const ln = isRTL ? pObj.last_name_ar : (locale === 'fr' ? pObj.last_name_fr : pObj.last_name_en)
    return [fn, ln].filter(Boolean).join(' ')
  }

  return (
    <div className={cn('p-4 space-y-4', isRTL && 'rtl')}>
      <div className="rounded-2xl bg-white p-6 shadow-sm text-center">
        <div className="mb-3 flex justify-center">
          <AvatarUpload
            gymId={profile?.gym_id}
            profileId={user.id}
            name={`${firstName ?? ''} ${lastName ?? ''}`.trim() || '?'}
            currentUrl={profile?.avatar_url}
            size="lg"
            locale={locale}
          />
        </div>
        <h2 className="text-lg font-bold text-gray-900">{firstName} {lastName}</h2>
        <p className="text-sm text-gray-500">{t('member')}</p>
        {profile?.phone && <div className="inline-flex items-center gap-1 mt-2 text-sm text-gray-500"><Phone className="h-3.5 w-3.5" /><span>{profile.phone}</span></div>}
      </div>

      {belt && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">{t('currentBelt')}</h3>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-full bg-gray-900"><Award className="h-5 w-5 text-yellow-400" /></div>
            <div>
              <p className="font-semibold text-gray-900">{beltLabelVal}</p>
              <p className="text-xs text-gray-500">{discObj ? (isRTL ? discObj.name_ar : locale === 'fr' ? discObj.name_fr || discObj.name_en : discObj.name_en) : ''} · {new Date(belt.promotion_date).toLocaleDateString(dateLocale(locale))}</p>
            </div>
          </div>
        </div>
      )}

      {membership && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">{t('membership')}</h3>
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-[#cd1419]" />
            <div>
              <p className="font-semibold text-gray-900">{membershipNameVal}</p>
              <p className="text-xs text-gray-500">{new Date(membership.start_date).toLocaleDateString(dateLocale(locale))} — {new Date(membership.end_date).toLocaleDateString(dateLocale(locale))}</p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">{t('memberDetails')}</h3>
        <DetailRow icon={CalendarDays} label={t('joined')} value={student?.join_date ? new Date(student.join_date).toLocaleDateString(dateLocale(locale)) : '—'} />
        <DetailRow icon={Shield} label={t('emergency')} value={student?.emergency_contact_name ? `${student.emergency_contact_name} (${student.emergency_contact_phone})` : t('notSet')} />
        {student?.medical_notes && <DetailRow icon={AlertCircle} label={t('medical')} value={student.medical_notes} />}
      </div>

      {guardians && guardians.length > 0 && (
        <div className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">{t('guardians')}</h3>
          {guardians.map((g: any, i: number) => {
            const gd: any = Array.isArray(g.guardians) ? g.guardians[0] : g.guardians
            return (
              <DetailRow key={i} icon={User}
                label={isRTL ? gd?.relationship_ar || gd?.relationship_en : gd?.relationship_en}
                value={guardianLabel(g)}
              />
            )
          })}
        </div>
      )}
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
