'use client'

/**
 * DISC-ICON — a discipline's optional uploaded icon, resolved from the RELATIVE
 * path stored in disciplines.icon_url (public `gym-landing` bucket, 000092). When
 * a gym hasn't uploaded one, it falls back to an emoji-free initial glyph (the
 * discipline's first letter) so every list — Settings rows, class-wizard chips,
 * timetable — has a consistent small leading avatar without a per-gym asset.
 *
 * Pure (storagePublicUrl is a string concat); safe in server OR client trees. The
 * <img> mirrors the Avatar idiom (public bucket, onError → glyph fallback).
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { storagePublicUrl } from '@/lib/storage/public-url'

const SIZES = { xs: 'h-5 w-5 text-[9px]', sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-xs' }

export function DisciplineIcon({
  iconUrl, name, size = 'sm', className, v,
}: {
  iconUrl?: string | null
  name: string
  size?: 'xs' | 'sm' | 'md'
  className?: string
  /** optional cache-buster (e.g. updated_at) for same-path overwrites */
  v?: string | number | null
}) {
  const [errored, setErrored] = useState(false)
  const src = storagePublicUrl('gym-landing', iconUrl, v)
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?'

  if (!src || errored) {
    return (
      <span
        aria-hidden
        data-testid="discipline-icon-fallback"
        className={cn('inline-flex shrink-0 items-center justify-center rounded-md bg-gray-100 font-bold text-gray-500', SIZES[size], className)}
      >
        {initial}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      data-testid="discipline-icon-img"
      onError={() => setErrored(true)}
      className={cn('inline-block shrink-0 rounded-md object-cover', SIZES[size], className)}
    />
  )
}
