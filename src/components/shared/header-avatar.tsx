'use client'

/** Own avatar in the shell header (ADM-2) — initials fallback, self-fetched. */
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from './avatar'

export function HeaderAvatar() {
  const [info, setInfo] = useState<{ url: string | null; name: string; v: string | null } | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !mounted) return
      const { data } = await supabase
        .from('profiles')
        .select('first_name_en, first_name_ar, last_name_en, last_name_ar, avatar_url, updated_at')
        .eq('id', user.id)
        .maybeSingle()
      if (!mounted || !data) return
      const name = [data.first_name_en || data.first_name_ar, data.last_name_en || data.last_name_ar].filter(Boolean).join(' ')
      // AVATAR-PATHS: bust the CDN on same-path re-uploads via updated_at (own avatar).
      setInfo({ url: data.avatar_url, name: name || '?', v: data.updated_at ?? null })
    })()
    return () => { mounted = false }
  }, [])

  if (!info) return null
  return <span data-testid="header-avatar"><Avatar url={info.url} name={info.name} size="sm" v={info.v} /></span>
}
