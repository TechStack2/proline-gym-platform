import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { InvoiceList } from './components/invoice-list'
import { InvoiceFilters } from './components/invoice-filters'
import { InvoiceStats } from './components/invoice-stats'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface InvoicesPageProps {
  params: { locale: string }
  searchParams: { 
    search?: string
    status?: string
    currency?: string
    date_from?: string
    date_to?: string
    page?: string
  }
}

export default async function InvoicesPage({ params: { locale }, searchParams }: InvoicesPageProps) {
  const t = await getTranslations('invoices')
  const supabase = await createClient()
  
  // Build query
  let query = supabase
    .from('invoices')
    .select(`
      *,
      students (
        id,
        first_name,
        last_name,
        email,
        phone
      ),
      membership_plans (
        id,
        name,
        price_usd,
        price_lbp,
        duration_days,
        max_classes_per_week
      )
    `, { count: 'exact' })
    .order('issue_date', { ascending: false })
  
  // Apply filters
  if (searchParams.search) {
    query = query.or(`students.first_name.ilike.%${searchParams.search}%,students.last_name.ilike.%${searchParams.search}%,invoice_number.ilike.%${searchParams.search}%`)
  }
  
  if (searchParams.status) {
    query = query.eq('status', searchParams.status)
  }
  
  if (searchParams.currency) {
    query = query.eq('currency', searchParams.currency)
  }
  
  if (searchParams.date_from) {
    query = query.gte('issue_date', searchParams.date_from)
  }
  
  if (searchParams.date_to) {
    query = query.lte('issue_date', searchParams.date_to)
  }
  
  // Pagination
  const page = parseInt(searchParams.page || '1')
  const pageSize = 20
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  
  query = query.range(from, to)
  
  const { data: invoices, error, count } = await query
  
  // Get stats
  const { data: allInvoices } = await supabase
    .from('invoices')
    .select('amount, currency, status')
  
  const stats = {
    total: allInvoices?.length || 0,
    paid: allInvoices?.filter(i => i.status === 'paid').length || 0,
    overdue: allInvoices?.filter(i => i.status === 'overdue').length || 0,
    draft: allInvoices?.filter(i => i.status === 'draft').length || 0,
    totalAmountUSD: allInvoices?.filter(i => i.currency === 'USD').reduce((sum, i) => sum + Number(i.amount), 0) || 0,
    totalAmountLBP: allInvoices?.filter(i => i.currency === 'LBP').reduce((sum, i) => sum + Number(i.amount), 0) || 0,
  }
  
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <Link href={`/${locale}/invoices/new`}>
          <Button className="bg-[#cd1419] hover:bg-[#a81014]">
            <Plus className="mr-2 h-4 w-4" />
            {t('generate_invoice')}
          </Button>
        </Link>
      </div>
      
      <InvoiceStats stats={stats} />
      
      <Card>
        <CardHeader>
          <CardTitle>{t('all_invoices')}</CardTitle>
        </CardHeader>
        <CardContent>
          <InvoiceFilters locale={locale} />
          <Suspense fallback={<div className="py-8 text-center">{t('loading')}</div>}>
            <InvoiceList 
              invoices={invoices || []} 
              locale={locale}
              totalPages={Math.ceil((count || 0) / pageSize)}
              currentPage={page}
            />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}