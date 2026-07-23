'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { storagePublicUrl } from '@/lib/storage/public-url'

export type AuthGymBrand = { logoUrl?: string; name?: string }

/**
 * WL-DOMAIN-ROUTING — brand an auth surface from the request Host (extracted from
 * the login page for LANDING DA-42, so /auth/forgot and /auth/reset carry the same
 * gym identity login has). Resolved client-side so the auth-critical form render is
 * untouched: on a mapped custom domain, swap in that gym's logo + per-locale name;
 * otherwise the built-in default stands (no flash for the vendor/Railway domain).
 * Anon-safe reads only (get_gym_slug_by_domain / get_public_gym definer RPCs).
 */
export function useAuthGymBrand(locale: string): AuthGymBrand {
  const [brand, setBrand] = useState<AuthGymBrand>({})
  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      try {
        const { data: slug } = await supabase.rpc('get_gym_slug_by_domain', { p_domain: window.location.host })
        if (!slug || typeof slug !== 'string') return // vendor/Railway domain → default branding
        const { data } = await supabase.rpc('get_public_gym', { p_slug: slug })
        const g = Array.isArray(data) ? data[0] : data
        if (g)
          setBrand({
            logoUrl: storagePublicUrl('avatars', g.logo_url) || undefined,
            name: (locale === 'ar' ? g.name_ar : locale === 'fr' ? g.name_fr : g.name_en) || undefined,
          })
      } catch {
        /* keep the default branding */
      }
    })()
  }, [locale])
  return brand
}
