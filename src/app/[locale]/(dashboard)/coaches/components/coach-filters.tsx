'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useState } from 'react'

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
          <Search className={cn(
            "absolute top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400",
            isRTL ? "right-3" : "left-3"
          )} />
          <Input
            placeholder={t('search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(isRTL ? "pr-10" : "pl-10")}
          />
        </div>
      </form>

      <select
        className="border rounded-md px-3 py-2 text-sm"
        value={searchParams.get('status') || ''}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString())
          if (e.target.value) {
            params.set('status', e.target.value)
          } else {
            params.delete('status')
          }
          router.push(`?${params.toString()}`)
        }}
      >
        <option value="">{t('all_statuses')}</option>
        <option value="active">{t('status.active')}</option>
        <option value="inactive">{t('status.inactive')}</option>
        <option value="on_leave">{t('status.on_leave')}</option>
      </select>
    </div>
  )
}