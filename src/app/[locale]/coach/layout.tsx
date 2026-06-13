import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CoachLayoutClient } from './_components/CoachLayoutClient'

// AX-1 shell identity: per-shell PWA theme-color (coach = black/gold).
export const viewport = { themeColor: '#111111' }

type Props = { children: React.ReactNode; params: { locale: string } }

export default async function CoachLayout({ children, params }: Props) {
  const { locale } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/auth/login`)
  return <CoachLayoutClient locale={locale}>{children}</CoachLayoutClient>
}
