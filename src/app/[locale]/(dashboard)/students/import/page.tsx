import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ImportClient } from './import-client'

export const dynamic = 'force-dynamic'

// R1: owner + reception only (the members area also admits head_coach, but import is
// a higher-trust bulk write — gate it tighter, mirroring the server action).
const IMPORT_ROLES = ['owner', 'receptionist']

export default async function ImportMembersPage({ params: { locale } }: { params: { locale: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: me } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
  if (!me?.gym_id) return null
  const { data: roles } = await supabase
    .from('user_roles').select('role').eq('user_id', user.id).eq('gym_id', me.gym_id)
  const allowed = ((roles ?? []) as { role: string }[]).some((r) => IMPORT_ROLES.includes(r.role))
  if (!allowed) redirect(`/${locale}/students`)

  return <ImportClient locale={locale} />
}
