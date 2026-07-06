import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { dateLocale } from '@/lib/utils/locale-format'
import { parseHorizon, horizonEndDate, HORIZONS, type Horizon } from '@/lib/finances/horizon'
import { TodayHorizon } from './_components/TodayHorizon'
import { WeekHorizon } from './_components/WeekHorizon'
import { MonthHorizon } from './_components/MonthHorizon'
import { SetupChecklist } from './_components/SetupChecklist'
import { InstallAppCard } from '@/components/pwa/install-app-card'
import { UserPlus, Users, DollarSign } from 'lucide-react'

export const dynamic = 'force-dynamic'

type Props = { params: { locale: string }; searchParams: { h?: string; __err?: string } }

/**
 * /today — Gym 360 Pro front desk. The horizon switcher swaps the entire CARD
 * SET (FD-2), not just the date window: Today = "run the shift" (operational) ·
 * This Week = "plan & chase" (tactical) · This Month = "grow & diagnose"
 * (strategic). Each lens is its own server component; chrome (header, switcher,
 * quick actions) is shared here. Read-time only — zero schema.
 */
export default async function TodayPage({ params: { locale }, searchParams }: Props) {
  // ERROR-HARDEN guard hook: a deterministic server throw for the e2e error-
  // boundary proof. E2E_TEST_MODE is CI-only (never set in prod) → inert in prod.
  if (process.env.E2E_TEST_MODE === '1' && searchParams?.__err === '1') {
    throw new Error('e2e forced segment error (raw internals — must never render)')
  }
  const isRTL = locale === 'ar'
  const t = await getTranslations('today')
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
  const gymId = profile?.gym_id
  if (!gymId) return null

  const now = new Date()
  const horizon: Horizon = parseHorizon(searchParams?.h)

  // Period-correct subtitle: the day for Today; the window for Week/Month.
  const fmtDate = (d: Date | string) =>
    new Date(d).toLocaleDateString(dateLocale(locale), { day: 'numeric', month: 'short' })
  let subtitle: string
  if (horizon === 'today') {
    subtitle = now.toLocaleDateString(dateLocale(locale), { weekday: 'long', day: 'numeric', month: 'long' })
  } else {
    const end = horizonEndDate(horizon, now)
    subtitle = `${t(`period.${horizon}`)} · ${fmtDate(now)} – ${fmtDate(end)}`
  }

  const quickActions = [
    { key: 'newLead', icon: UserPlus, href: `/${locale}/students?tab=prospects`, testid: 'quick-new-lead' },
    { key: 'newMember', icon: Users, href: `/${locale}/students/add`, testid: 'quick-new-member' },
    { key: 'recordPayment', icon: DollarSign, href: `/${locale}/payments/new`, testid: 'quick-record-payment' },
  ] as const

  return (
    <div className={cn('space-y-4', isRTL && 'rtl text-right')}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          {/* SHELL-IA: mobile shows the NativeHeader large title; the date subtitle
              below leads on mobile. Desktop keeps this H1 (its only title). */}
          <h1 className={cn('hidden md:block text-2xl font-bold text-gray-900', isRTL && 'font-arabic')}>{t('title')}</h1>
          <p className="mt-0.5 text-sm text-gray-500" data-testid="horizon-subtitle">{subtitle}</p>
        </div>
        <Link href={`/${locale}/schedule?view=day`} data-testid="open-diary-link"
          className="text-sm font-medium text-primary-600 hover:underline">
          {t('openDiary')}
        </Link>
      </div>

      {/* PWA-INSTALL: dismissible, platform-aware "Install the app" affordance for the
          front-desk laptop (the offline guarantee). Renders nothing once installed. */}
      <InstallAppCard locale={locale} />

      {/* ONBOARDING-CHECKLIST: derived first-run setup guide — renders only while
          setup is incomplete, hides itself once every applicable item is done. */}
      <SetupChecklist locale={locale} gymId={gymId} />

      {/* Horizon switcher — Today / Week / Month swap the whole card set */}
      <div className="inline-flex rounded-xl border bg-gray-50 p-1" data-testid="horizon-switcher">
        {HORIZONS.map((h) => (
          <Link key={h} href={`/${locale}/today${h === 'today' ? '' : `?h=${h}`}`}
            data-testid={`horizon-${h}`} data-active={horizon === h}
            className={cn('rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              horizon === h ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-800')}>
            {t(`horizon.${h}`)}
          </Link>
        ))}
      </div>

      {/* Quick actions (front-desk shortcuts, all horizons) */}
      <div className="grid grid-cols-3 gap-3">
        {quickActions.map((a) => {
          const Icon = a.icon
          return (
            <Link key={a.key} href={a.href} data-testid={a.testid}
              className="flex flex-col items-center gap-2 rounded-2xl border bg-white p-4 text-center shadow-sm transition-colors hover:bg-primary-50">
              <Icon className="h-6 w-6 text-primary-600" />
              <span className="text-xs font-medium text-gray-700">{t(`quick.${a.key}`)}</span>
            </Link>
          )
        })}
      </div>

      {horizon === 'today' && <TodayHorizon locale={locale} gymId={gymId} />}
      {horizon === 'week' && <WeekHorizon locale={locale} gymId={gymId} />}
      {horizon === 'month' && <MonthHorizon locale={locale} gymId={gymId} />}
    </div>
  )
}
