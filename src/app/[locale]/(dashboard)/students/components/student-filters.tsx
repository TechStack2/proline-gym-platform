'use client'

/**
 * DA-33 (W4) — the members-list filters leave native `<select>`s for the §2.6
 * doctrine: the 3-value status set = apply-on-tap chips (tap-active-clears);
 * the LONG lists (discipline, belt ladder) = the searchable-Dialog pattern.
 * Mechanics unchanged: the URL stays the source of truth (`updateFilter`).
 */
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Search, Filter } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SearchableFilterDialog } from '@/components/ui/filter-dialog'
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

const STATUSES = ['active', 'inactive', 'suspended'] as const

export function StudentFilters({ disciplines, beltRanks, locale, isRTL }: StudentFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('students')
  const tc = useTranslations('common')
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

  const status = searchParams.get('status') || ''

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <form onSubmit={handleSearch} className="flex-1">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 w-4 h-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder={t('search_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ps-10"
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
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-4" data-testid="member-filters">
          <SearchableFilterDialog
            label={t('filter_discipline')}
            value={searchParams.get('discipline') || ''}
            options={disciplines.map((d) => ({ id: d.id, label: d.name }))}
            onSelect={(id) => updateFilter('discipline', id)}
            searchPlaceholder={tc('search')}
            clearLabel={t('all_disciplines')}
            testid="member-filter-discipline"
          />
          <SearchableFilterDialog
            label={t('filter_belt')}
            value={searchParams.get('belt') || ''}
            options={beltRanks.map((b) => ({ id: b.id, label: isRTL ? b.name_ar : b.name_en }))}
            onSelect={(id) => updateFilter('belt', id)}
            searchPlaceholder={tc('search')}
            clearLabel={t('all_belts')}
            testid="member-filter-belt"
          />
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              data-testid="member-filter-status"
              data-status={s}
              data-active={status === s}
              onClick={() => updateFilter('status', status === s ? '' : s)}
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
          ))}
        </div>
      )}
    </div>
  )
}
