'use client'

/**
 * Person avatar with graceful initials fallback (ADM-2). Plain <img> (the
 * avatars bucket is public-read; a missing/broken URL falls back to initials,
 * same pattern as LandingImage).
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { storagePublicUrl } from '@/lib/storage/public-url'

export function Avatar({
  url, name, size = 'md', className, v,
}: {
  url?: string | null
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
  // AVATAR-PATHS: optional cache-buster (a row timestamp, e.g. profiles.updated_at)
  // for same-path avatar overwrites; passed through to storagePublicUrl.
  v?: string | number | null
}) {
  const [errored, setErrored] = useState(false)
  const sizes = { xs: 'h-5 w-5 text-[9px]', sm: 'h-7 w-7 text-[11px]', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-lg' }
  const initials = (name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join('')
    .toUpperCase() || '?'

  // AVATAR-PATHS: the DB stores the RELATIVE object path — resolve it to a public
  // URL at read time (a legacy absolute url passes through unchanged). This is THE
  // choke point for profiles.avatar_url across every Avatar caller.
  const src = storagePublicUrl('avatars', url, v)

  if (!src || errored) {
    return (
      <span
        data-testid="avatar-fallback"
        aria-label={name}
        className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-primary-50 font-bold text-primary-700', sizes[size], className)}
      >
        {initials}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      data-testid="avatar-img"
      onError={() => setErrored(true)}
      className={cn('inline-block shrink-0 rounded-full object-cover', sizes[size], className)}
    />
  )
}
