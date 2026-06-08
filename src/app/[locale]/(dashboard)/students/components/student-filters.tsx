'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Search, Filter } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useState, useCallback } from 'react'

interface Discipline {
  id: string
  name: string
}

interface BeltRank {
  id: string
  name_ar: string
  name_en: string
  color: string
}

interface StudentFiltersProps {
  disciplines: Discipline[]
  beltRanks: BeltRank[]
  locale: string
  isRTL: boolean
}

export function StudentFilters({ disciplines, beltRanks, locale, isRTL }: StudentFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('students')
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [showFilters, setShowFilters] = useState(false)

  const updateFilter = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`?${params.toString()}`)
  }, [router, searchParams])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    updateFilter('search', search)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
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
        <Button
          variant="outline"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="w-4 h-4" />
        </Button>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-4 p-4 bg-gray-50 rounded-lg">
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('filter_discipline')}
            </label>
            <select
              className="border rounded-md px-3 py-2 text-sm"
              value={searchParams.get('discipline') || ''}
              onChange={(e) => updateFilter('discipline', e.target.value)}
            >
              <option value="">{t('all_disciplines')}</option>
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {t('filter_belt')}
            </label>
            <select
              className="border rounded-md px-3 py-2 text-sm"
              value={searchParams.get('belt') || ''}
              onChange={(e) => updateFilter('belt', e.target.value)}
            >
              <option value="">{t('all_belts')}</option>
              {beltRanks.map((b) => (
                <option key={b.id} value={b.id}>
                  {isRTL ? b.name_ar : b.name_en}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {t('filter_status')}
            </label>
            <select
              className="border rounded-md px-3 py-2 text-sm"
              value={searchParams.get('status') || ''}
              onChange={(e) => updateFilter('status', e.target.value)}
            >
              <option value="">{t('all_statuses')}</option>
              <option value="active">{t('status.active')}</option>
              <option value="inactive">{t('status.inactive')}</option>
              <option value="suspended">{t('status.suspended')}</option>
            </select>
          </div>
        </div>
      )}
    </div>
  )
}