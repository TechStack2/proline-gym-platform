import type { Viewport } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PortalLayoutClient } from './_components/PortalLayoutClient'
import { BrandThemeStyle } from '@/components/shared/brand-theme-style'

// AX-1 shell identity: per-shell PWA theme-color (portal = cool teal). DS-2: per
// light/dark — dark status bar = the shared #131317 ground.
export const viewport: Viewport = {
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
  // WL-THEME: brand this member's portal by THEIR gym's colour (never the Host's).
  const { data: gymRow } = await supabase.from('profiles').select('gyms(brand_color)').eq('id', user.id).maybeSingle()
  const rawGym = (gymRow as { gyms?: unknown } | null)?.gyms
  const gymNode = Array.isArray(rawGym) ? rawGym[0] : rawGym
  const brandColor = (gymNode as { brand_color?: string | null } | null | undefined)?.brand_color ?? null
  return (
    <>
      <BrandThemeStyle brandColor={brandColor} />
      <PortalLayoutClient locale={locale}>{children}</PortalLayoutClient>
    </>
  )
}
