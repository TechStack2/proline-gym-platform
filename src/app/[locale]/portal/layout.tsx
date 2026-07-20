import type { Viewport } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PortalLayoutClient } from './_components/PortalLayoutClient'
import { BrandThemeStyle } from '@/components/shared/brand-theme-style'
import { getUserGymChrome } from '@/lib/theme/user-brand'

// AX-1 shell identity: per-shell PWA theme-color (portal = cool teal). DS-2: per
// light/dark — dark status bar = the shared #131317 ground.
export const viewport: Viewport = {
  // DA-2: opt into the notch/home-indicator area so the shells' env(safe-area-inset-*)
  // padding actually resolves on standalone iOS (0 without viewport-fit=cover).
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0e7490' },
    { media: '(prefers-color-scheme: dark)', color: '#131317' },
  ],
}

type Props = { children: React.ReactNode; params: { locale: string } }

export default async function PortalLayout({ children, params }: Props) {
  const { locale } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/auth/login`)
  // WL-THEME · PORTAL-BRAND: brand this member's portal by THEIR gym's colour (never
  // the Host's). Members aren't is_staff(), so the plain gyms RLS read returns null —
  // resolve brand_color via the user's own gym_id through the server-only helper.
  // W2a §4.1: the same read now carries the gym NAME + LOGO for the identity bar.
  const chrome = await getUserGymChrome(user.id, locale)
  return (
    <>
      <BrandThemeStyle brandColor={chrome.brandColor} />
      <PortalLayoutClient locale={locale} gymName={chrome.gymName} logoUrl={chrome.logoUrl}>
        {children}
      </PortalLayoutClient>
    </>
  )
}
