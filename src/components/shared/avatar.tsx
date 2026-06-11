'use client'

/**
 * Person avatar with graceful initials fallback (ADM-2). Plain <img> (the
 * avatars bucket is public-read; a missing/broken URL falls back to initials,
 * same pattern as LandingImage).
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'

export function Avatar({
  url, name, size = 'md', className,
}: {
  url?: string | null
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}) {
  const [errored, setErrored] = useState(false)
  const sizes = { xs: 'h-5 w-5 text-[9px]', sm: 'h-7 w-7 text-[11px]', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-lg' }
  const initials = (name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join('')
    .toUpperCase() || '?'

  if (!url || errored) {
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
      src={url}
      alt={name}
      data-testid="avatar-img"
      onError={() => setErrored(true)}
      className={cn('inline-block shrink-0 rounded-full object-cover', sizes[size], className)}
    />
  )
}
