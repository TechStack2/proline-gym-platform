import type { Viewport } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CoachLayoutClient } from './_components/CoachLayoutClient'
import { BrandThemeStyle } from '@/components/shared/brand-theme-style'

// AX-1 shell identity: per-shell PWA theme-color (coach = black/gold). DS-2: per
// light/dark — dark status bar = the shared #131317 ground.
export const viewport: Viewport = {
  // DA-2: opt into the notch/home-indicator area so the shells' env(safe-area-inset-*)
  // padding actually resolves on standalone iOS (0 without viewport-fit=cover).
  viewportFit: 'cover',
  // W2c/DA-62: ONE light meta — theme-color follows the APP's html.dark state
  // (boot script + ThemeToggle swap in #131317), not the OS media query.
  themeColor: '#111111',
}

type Props = { children: React.ReactNode; params: { locale: string } }

export default async function CoachLayout({ children, params }: Props) {
  const { locale } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/auth/login`)
  // WL-THEME: brand this coach's shell by THEIR gym's colour (never the Host's).
  // W2a §4.1: the same server-only helper the portal uses now also carries the
  // gym NAME + LOGO for the identity bar (one read, one code path).
  const { getUserGymChrome } = await import('@/lib/theme/user-brand')
  const chrome = await getUserGymChrome(user.id, locale)
  // §3: the More entry badges when trials are scheduled today. Same definer RPC
  // the Today surface uses; best-effort — a failure renders no badge, never blocks.
  let trialsTodayCount = 0
  try {
    const { data: trialsRaw } = await supabase.rpc('get_coach_trials')
    const todayIso = new Date().toISOString().slice(0, 10)
    trialsTodayCount = ((trialsRaw || []) as { status?: string; scheduled_date?: string }[])
      .filter((tr) => tr.status === 'scheduled' && tr.scheduled_date === todayIso).length
  } catch {
    trialsTodayCount = 0
  }
  return (
    <>
      <BrandThemeStyle brandColor={chrome.brandColor} />
      <CoachLayoutClient
        locale={locale}
        gymName={chrome.gymName}
        logoUrl={chrome.logoUrl}
        trialsTodayCount={trialsTodayCount}
      >
        {children}
      </CoachLayoutClient>
    </>
  )
}
