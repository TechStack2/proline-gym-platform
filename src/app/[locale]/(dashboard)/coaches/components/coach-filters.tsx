'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useState } from 'react'

const STATUSES = ['active', 'inactive', 'on_leave'] as const

interface CoachFiltersProps {
  locale: string
  isRTL: boolean
}

export function CoachFilters({ locale, isRTL }: CoachFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('coaches')
  const [search, setSearch] = useState(searchParams.get('search') || '')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams(searchParams.toString())
    if (search) {
      params.set('search', search)
    } else {
      params.delete('search')
    }
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="flex gap-4">
      <form onSubmit={handleSearch} className="flex-1">
        <div className="relative">
          {/* DA-61: logical properties — no isRTL side ternaries. */}
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 start-3" />
          <Input
            placeholder={t('search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-10"
          />
        </div>
      </form>

      {/* §2.6 (W4): the 3-value status set is apply-on-tap chips (tap-active-clears);
          searchParams mechanics unchanged. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUSES.map((s) => {
          const status = searchParams.get('status') || ''
          const setStatus = (value: string) => {
            const params = new URLSearchParams(searchParams.toString())
            if (value) {
              params.set('status', value)
            } else {
              params.delete('status')
            }
            router.push(`?${params.toString()}`)
          }
          return (
            <button
              key={s}
              type="button"
              data-status={s}
              data-active={status === s}
              onClick={() => setStatus(status === s ? '' : s)}
              className={cn(
                'inline-flex min-h-[36px] items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--shell-accent)]',
                status === s
                  ? 'border-primary-700 bg-primary-700 text-primary-foreground'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
              )}
            >
              {t(`status.${s}`)}
            </button>
          )
        })}
      </div>
    </div>
  )
}