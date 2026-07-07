'use client'

/**
 * J5 SETTINGS-REFIT — a searchable timezone picker (no free-text IANA typos). Fed by
 * Intl.supportedValuesOf('timeZone') with a graceful fallback for older engines / TS
 * libs that don't type it, and a short regional-defaults list on top (Asia/Beirut
 * first — Proline's home). Keeps the `gym-timezone` testid on the input for continuity.
 */
import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// Proline is Beirut-first; a handful of regional defaults surface before the long list.
const REGIONAL = ['Asia/Beirut', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Amman', 'Europe/Paris', 'Europe/London', 'America/New_York', 'UTC']

function allTimeZones(): string[] {
  // Intl.supportedValuesOf is ES2022 — guard for TS-lib gaps + older browsers.
  const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf
  try {
    if (typeof fn === 'function') return fn('timeZone')
  } catch {
    /* noop */
  }
  return REGIONAL
}

export function TimezonePicker({
  value, onChange, placeholder,
}: {
  value: string
  onChange: (tz: string) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const zones = useMemo(allTimeZones, [])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      const rest = zones.filter((z) => !REGIONAL.includes(z))
      return [...REGIONAL.filter((z) => zones.includes(z) || REGIONAL.includes(z)), ...rest].slice(0, 80)
    }
    return zones.filter((z) => z.toLowerCase().includes(q)).slice(0, 80)
  }, [query, zones])

  const pick = (tz: string) => {
    onChange(tz)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="relative">
      <Input
        data-testid="gym-timezone"
        dir="ltr"
        value={open ? query : value}
        placeholder={placeholder || 'Asia/Beirut'}
        onFocus={() => { setOpen(true); setQuery('') }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => { setOpen(true); setQuery(e.target.value) }}
        className="rounded-lg border p-2"
      />
      {open && list.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {list.map((z) => (
            <button
              key={z}
              type="button"
              data-testid="gym-timezone-option"
              data-value={z}
              // preventDefault on mousedown keeps the input focused (the dropdown stays
              // open, no re-render mid-click); the actual select fires on click, so the
              // option is never detached between mousedown and mouseup (Playwright-safe).
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(z)}
              className={cn(
                'block w-full px-3 py-1.5 text-start text-sm hover:bg-gray-50',
                z === value ? 'bg-gray-50 font-medium text-primary-600' : 'text-gray-700',
              )}
            >
              {z}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
