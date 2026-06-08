'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, Filter, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface InvoiceFiltersProps {
  locale: string
}

export function InvoiceFilters({ locale }: InvoiceFiltersProps) {
  const t = useTranslations('invoices')
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [status, setStatus] = useState(searchParams.get('status') || '')
  const [currency, setCurrency] = useState(searchParams.get('currency') || '')
  const [dateFrom, setDateFrom] = useState(searchParams.get('date_from') || '')
  const [dateTo, setDateTo] = useState(searchParams.get('date_to') || '')
  
  const applyFilters = () => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (status) params.set('status', status)
    if (currency) params.set('currency', currency)
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    
    router.push(`/${locale}/invoices?${params.toString()}`)
  }
  
  const clearFilters = () => {
    setSearch('')
    setStatus('')
    setCurrency('')
    setDateFrom('')
    setDateTo('')
    router.push(`/${locale}/invoices`)
  }
  
  const hasFilters = search || status || currency || dateFrom || dateTo
  
  return (
    <div className="space-y-4 mb-6">
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('search_invoices')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder={t('all_statuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('all_statuses')}</SelectItem>
            <SelectItem value="draft">{t('draft')}</SelectItem>
            <SelectItem value="sent">{t('sent')}</SelectItem>
            <SelectItem value="paid">{t('paid')}</SelectItem>
            <SelectItem value="overdue">{t('overdue')}</SelectItem>
            <SelectItem value="cancelled">{t('cancelled')}</SelectItem>
          </SelectContent>
        </Select>
        
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder={t('all_currencies')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('all_currencies')}</SelectItem>
            <SelectItem value="USD">USD</SelectItem>
            <SelectItem value="LBP">LBP</SelectItem>
          </SelectContent>
        </Select>
        
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-[150px]"
          placeholder={t('date_from')}
        />
        
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-[150px]"
          placeholder={t('date_to')}
        />
        
        <Button onClick={applyFilters} variant="primary">
          <Filter className="mr-2 h-4 w-4" />
          {t('filter')}
        </Button>
        
        {hasFilters && (
          <Button onClick={clearFilters} variant="outline">
            <X className="mr-2 h-4 w-4" />
            {t('clear')}
          </Button>
        )}
      </div>
    </div>
  )
}