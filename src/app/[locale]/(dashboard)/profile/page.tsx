import { dateLocale } from '@/lib/utils/locale-format'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { User, Phone, Mail, Shield, CalendarDays, Clock, Globe, Save, Check } from 'lucide-react'
import { revalidatePath } from 'next/cache'
import { PushToggle } from '@/components/push/push-toggle'

type Props = { params: { locale: string } }

const roleLabels: Record<string, { ar: string; en: string; fr: string }> = {
  owner: { ar: 'مالك', en: 'Owner', fr: 'Propriétaire' },
  head_coach: { ar: 'مدرب رئيسي', en: 'Head Coach', fr: 'Entraîneur en chef' },
  coach: { ar: 'مدرب', en: 'Coach', fr: 'Entraîneur' },
  receptionist: { ar: 'موظف استقبال', en: 'Receptionist', fr: 'Réceptionniste' },
  student: { ar: 'طالب', en: 'Student', fr: 'Élève' },
  parent: { ar: 'ولي أمر', en: 'Parent', fr: 'Parent' },
  external_coach: { ar: 'مدرب خارجي', en: 'External Coach', fr: 'Entraîneur externe' },
}

export default async function StaffProfilePage({ params }: Props) {
  const { locale } = params
  const isRTL = locale === 'ar'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const { data: roles } = await supabase.from('user_roles').select('*').eq('user_id', user.id)

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

  const langLabel = (l: string | undefined) => {
    if (l === 'ar') return 'العربية'
    if (l === 'fr') return 'Français'
    return 'English'
  }

  async function updateProfile(formData: FormData) {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('profiles').update({
      first_name_ar: (formData.get('first_name_ar') as string) || null,
      first_name_en: (formData.get('first_name_en') as string) || null,
      first_name_fr: (formData.get('first_name_fr') as string) || null,
      last_name_ar: (formData.get('last_name_ar') as string) || null,
      last_name_en: (formData.get('last_name_en') as string) || null,
      last_name_fr: (formData.get('last_name_fr') as string) || null,
      phone: (formData.get('phone') as string) || null,
      locale: (formData.get('locale') as string) || 'ar',
      updated_at: new Date().toISOString(),
    }).eq('id', user.id)

    revalidatePath(`/${locale}/profile`)
  }

  return (
    <div className={cn('p-4 space-y-4', isRTL && 'rtl')}>
      <PushToggle />
      {/* Avatar + Name Card */}
      <div className="rounded-2xl bg-white p-6 shadow-sm text-center">
        <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-primary-700 text-primary-foreground text-3xl font-bold mb-3">
          {firstName?.charAt(0) || '?'}
        </div>
        <h2 className={cn('text-xl font-bold text-gray-900', isRTL && 'font-arabic')}>
          {firstName} {lastName}
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
          {roles?.map((r: any) => {
            const labels = roleLabels[r.role]
            const label = labels
              ? isRTL
                ? labels.ar
                : locale === 'fr'
                  ? labels.fr
                  : labels.en
              : r.role
            return (
              <span
                key={r.id}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700"
              >
                <Shield className="h-3 w-3" />
                {label}
              </span>
            )
          })}
        </div>
        {profile?.phone && (
          <div className="inline-flex items-center gap-1.5 mt-2 text-sm text-gray-500">
            <Phone className="h-3.5 w-3.5" />
            <span dir="ltr">{profile.phone}</span>
          </div>
        )}
      </div>

      {/* Account Info Card */}
      <div className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
        <h3 className={cn('text-xs font-semibold text-gray-500 uppercase mb-1 tracking-wider', isRTL && 'font-arabic')}>
          {isRTL ? 'معلومات الحساب' : locale === 'fr' ? 'Informations du compte' : 'Account Info'}
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
          value={langLabel(profile?.locale)}
        />
        <DetailRow
          icon={CalendarDays}
          label={isRTL ? 'تاريخ الانضمام' : locale === 'fr' ? "Date d'inscription" : 'Joined'}
          value={
            profile?.created_at
              ? new Date(profile.created_at).toLocaleDateString(dateLocale(locale), {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })
              : '—'
          }
        />
        <DetailRow
          icon={Clock}
          label={isRTL ? 'آخر تسجيل دخول' : locale === 'fr' ? 'Dernière connexion' : 'Last Login'}
          value={
            profile?.last_login_at
              ? new Date(profile.last_login_at).toLocaleDateString(dateLocale(locale), {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })
              : isRTL
                ? 'غير متوفر'
                : locale === 'fr'
                  ? 'Non disponible'
                  : 'Not available'
          }
        />
      </div>

      {/* Edit Profile Form */}
      <form action={updateProfile} className="rounded-2xl bg-white p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-primary-700" />
          <h3 className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
            {isRTL ? 'تعديل الملف الشخصي' : locale === 'fr' ? 'Modifier le profil' : 'Edit Profile'}
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InputField
            label={isRTL ? 'الاسم الأول (عربي)' : locale === 'fr' ? 'Prénom (Arabe)' : 'First Name (Arabic)'}
            name="first_name_ar"
            defaultValue={profile?.first_name_ar || ''}
            dir="rtl"
          />
          <InputField
            label={isRTL ? 'الاسم الأول (إنجليزي)' : locale === 'fr' ? 'Prénom (Anglais)' : 'First Name (English)'}
            name="first_name_en"
            defaultValue={profile?.first_name_en || ''}
          />
          <InputField
            label={isRTL ? 'الاسم الأول (فرنسي)' : locale === 'fr' ? 'Prénom (Français)' : 'First Name (French)'}
            name="first_name_fr"
            defaultValue={profile?.first_name_fr || ''}
          />
          <InputField
            label={isRTL ? 'اسم العائلة (عربي)' : locale === 'fr' ? 'Nom (Arabe)' : 'Last Name (Arabic)'}
            name="last_name_ar"
            defaultValue={profile?.last_name_ar || ''}
            dir="rtl"
          />
          <InputField
            label={isRTL ? 'اسم العائلة (إنجليزي)' : locale === 'fr' ? 'Nom (Anglais)' : 'Last Name (English)'}
            name="last_name_en"
            defaultValue={profile?.last_name_en || ''}
          />
          <InputField
            label={isRTL ? 'اسم العائلة (فرنسي)' : locale === 'fr' ? 'Nom (Français)' : 'Last Name (French)'}
            name="last_name_fr"
            defaultValue={profile?.last_name_fr || ''}
          />
          <InputField
            label={isRTL ? 'رقم الهاتف' : locale === 'fr' ? 'Téléphone' : 'Phone'}
            name="phone"
            defaultValue={profile?.phone || ''}
            type="tel"
            dir="ltr"
          />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {isRTL ? 'اللغة المفضلة' : locale === 'fr' ? 'Langue préférée' : 'Preferred Language'}
            </label>
            <select
              name="locale"
              defaultValue={profile?.locale || 'ar'}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-700 focus:border-transparent bg-white"
            >
              <option value="ar">العربية</option>
              <option value="en">English</option>
              <option value="fr">Français</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-700 text-primary-foreground text-sm font-medium rounded-xl hover:bg-primary-800 active:bg-primary-800 transition-colors"
        >
          <Save className="h-4 w-4" />
          {isRTL ? 'حفظ التغييرات' : locale === 'fr' ? 'Enregistrer les modifications' : 'Save Changes'}
        </button>
      </form>
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

function InputField({
  label,
  name,
  defaultValue,
  type = 'text',
  dir,
}: {
  label: string
  name: string
  defaultValue: string
  type?: string
  dir?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        dir={dir}
        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-700 focus:border-transparent placeholder:text-gray-400"
      />
    </div>
  )
}
