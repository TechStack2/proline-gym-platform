import type { Viewport } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CoachLayoutClient } from './_components/CoachLayoutClient'

// AX-1 shell identity: per-shell PWA theme-color (coach = black/gold). DS-2: per
// light/dark — dark status bar = the shared #131317 ground.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#111111' },
    { media: '(prefers-color-scheme: dark)', color: '#131317' },
  ],
}

type Props = { children: React.ReactNode; params: { locale: string } }

export default async function CoachLayout({ children, params }: Props) {
  const { locale } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/auth/login`)
  return <CoachLayoutClient locale={locale}>{children}</CoachLayoutClient>
}
