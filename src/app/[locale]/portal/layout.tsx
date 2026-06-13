import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PortalLayoutClient } from './_components/PortalLayoutClient'

// AX-1 shell identity: per-shell PWA theme-color (portal = cool teal).
export const viewport = { themeColor: '#0e7490' }

type Props = { children: React.ReactNode; params: { locale: string } }

export default async function PortalLayout({ children, params }: Props) {
  const { locale } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/auth/login`)
  return <PortalLayoutClient locale={locale}>{children}</PortalLayoutClient>
}
