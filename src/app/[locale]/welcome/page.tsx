import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_GYM_SLUG } from '@/lib/marketing/gym'
import { storagePublicUrl } from '@/lib/storage/public-url'
import { cn } from '@/lib/utils'
import { CalendarDays, Dumbbell, CreditCard, ArrowRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

/**
 * MJ-2 FIRST-LOGIN WELCOME — the guided "you're in" moment a member lands on right
 * after finishing the forced-password-change onboarding (onboarding-client routes
 * members here instead of a bare /portal redirect). Shows their name, their gym's
 * OWN brand (never Proline on another tenant), and the three things the portal does,
 * then a single CTA into the portal. Benign + idempotent — a friendly signpost, not
 * a gate.
 */
export default async function WelcomePage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale)
  const t = await getTranslations('welcome')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/auth/login`)

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name_ar, first_name_en, first_name_fr, gym_id')
    .eq('id', user.id).maybeSingle()

  const firstName =
    (locale === 'ar' ? profile?.first_name_ar : locale === 'fr' ? profile?.first_name_fr : profile?.first_name_en) ||
    profile?.first_name_en || ''

  // A MEMBER can't read the gyms table via RLS (gyms_staff_read is staff-only), so the
  // gym's PUBLIC brand (name + logo — exactly what the landing shows) is resolved with
  // the service role, scoped to the member's OWN gym_id. Server-only; no RLS/migration.
  let g: { slug?: string; name_ar?: string; name_en?: string; name_fr?: string; logo_url?: string } | null = null
  if (profile?.gym_id) {
    const { data } = await createAdminClient()
      .from('gyms').select('slug, name_ar, name_en, name_fr, logo_url').eq('id', profile.gym_id).maybeSingle()
    g = data
  }
  const isDefaultGym = (g?.slug ?? DEFAULT_GYM_SLUG) === DEFAULT_GYM_SLUG
  const gymName =
    (locale === 'ar' ? g?.name_ar : locale === 'fr' ? g?.name_fr : g?.name_en) ||
    g?.name_en || (isDefaultGym ? 'PRO LINE Gym' : '')
  const gymLogo = isDefaultGym ? '/logo.jpg' : storagePublicUrl('avatars', g?.logo_url) || null
  const isRTL = locale === 'ar'

  const things = [
    { icon: CalendarDays, key: 'schedule' },
    { icon: Dumbbell, key: 'progress' },
    { icon: CreditCard, key: 'billing' },
  ] as const

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-secondary-900 to-primary-950 p-4"
    >
      <div data-testid="welcome" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-elevation-3 sm:p-8">
        {/* The gym's OWN brand (logo + name) — the tenant's, never Proline's on another gym. */}
        <div className="flex flex-col items-center text-center">
          {gymLogo && (
            <div className="mb-4 h-16 w-16 overflow-hidden rounded-2xl shadow-sm ring-2 ring-primary-100">
              <Image src={gymLogo} alt={gymName} width={64} height={64} className="h-full w-full object-cover" priority />
            </div>
          )}
          {gymName && (
            <p data-testid="welcome-gym" className={cn('text-sm font-semibold uppercase tracking-widest text-primary-600', isRTL && 'font-arabic')}>
              {gymName}
            </p>
          )}
          <h1 data-testid="welcome-title" className={cn('mt-2 text-2xl font-bold text-secondary-900', isRTL && 'font-arabic')}>
            {t('title', { name: firstName })}
          </h1>
          <p className="mt-1 text-sm text-gray-500">{t('subtitle')}</p>
        </div>

        {/* The three things the member can do now. */}
        <div className="mt-6 space-y-3">
          {things.map(({ icon: Icon, key }) => (
            <div key={key} className="flex items-start gap-3 rounded-xl bg-gray-50 p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50">
                <Icon className="h-5 w-5 text-primary-600" />
              </span>
              <div>
                <p className={cn('text-sm font-semibold text-secondary-900', isRTL && 'font-arabic')}>
                  {t(`${key}Title` as 'scheduleTitle')}
                </p>
                <p className="text-xs text-gray-500">{t(`${key}Desc` as 'scheduleDesc')}</p>
              </div>
            </div>
          ))}
        </div>

        {/* One clear way in. */}
        <Link
          href={`/${locale}/portal`}
          data-testid="welcome-cta"
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-base font-semibold text-primary-foreground shadow-glow-primary transition-all hover:bg-primary-700 active:scale-95"
        >
          {t('cta')}
          <ArrowRight className={cn('h-5 w-5', isRTL && 'rotate-180')} />
        </Link>
      </div>
    </div>
  )
}
