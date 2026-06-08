import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Search, 
  Plus, 
  DollarSign, 
  Calendar, 
  Filter,
  ArrowUpDown,
  Download,
  CreditCard,
  Banknote,
  Wallet,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw
} from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { PaymentList } from './components/payment-list'
import { PaymentStats } from './components/payment-stats'
import { PaymentFilters } from './components/payment-filters'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PaymentsPageProps {
  params: { locale: string }
  searchParams: { 
    search?: string
    status?: string
    method?: string
    currency?: string
    date_from?: string
    date_to?: string
    page?: string
  }
}

export default async function PaymentsPage({ params: { locale }, searchParams }: PaymentsPageProps) {
  const t = await getTranslations('payments')
  const supabase = await createClient()
  
  // Build query
  let query = supabase
    .from('payments')
    .select(`
      *,
      students (
        id,
        first_name,
        last_name,
        email,
        phone
      )
    `, { count: 'exact' })
    .order('payment_date', { ascending: false })
  
  // Apply filters
  if (searchParams.search) {
    query = query.or(`students.first_name.ilike.%${searchParams.search}%,students.last_name.ilike.%${searchParams.search}%,reference_number.ilike.%${searchParams.search}%`)
  }
  
  if (searchParams.status) {
    query = query.eq('status', searchParams.status)
  }
  
  if (searchParams.method) {
    query = query.eq('payment_method', searchParams.method)
  }
  
  if (searchParams.currency) {
    query = query.eq('currency', searchParams.currency)
  }
  
  if (searchParams.date_from) {
    query = query.gte('payment_date', searchParams.date_from)
  }
  
  if (searchParams.date_to) {
    query = query.lte('payment_date', searchParams.date_to)
  }
  
  // Pagination
  const page = parseInt(searchParams.page || '1')
  const pageSize = 20
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  
  query = query.range(from, to)
  
  const { data: payments, error, count } = await query
  
  // Get stats
  const today = new Date().toISOString().split('T')[0]
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  
  const { data: todayPayments } = await supabase
    .from('payments')
    .select('amount, currency')
    .eq('status', 'completed')
    .gte('payment_date', today)
  
  const { data: monthPayments } = await supabase
    .from('payments')
    .select('amount, currency')
    .eq('status', 'completed')
    .gte('payment_date', firstDayOfMonth)
  
  const { data: pendingPayments } = await supabase
    .from('payments')
    .select('amount, currency')
    .eq('status', 'pending')
  
  // Calculate stats
  const calculateTotal = (payments: any[] | null, currency: string) => {
    return payments?.filter(p => p.currency === currency).reduce((sum, p) => sum + Number(p.amount), 0) || 0
  }
  
  const stats = {
    todayUSD: calculateTotal(todayPayments, 'USD'),
    todayLBP: calculateTotal(todayPayments, 'LBP'),
    monthUSD: calculateTotal(monthPayments, 'USD'),
    monthLBP: calculateTotal(monthPayments, 'LBP'),
    pendingUSD: calculateTotal(pendingPayments, 'USD'),
    pendingLBP: calculateTotal(pendingPayments, 'LBP'),
  }
  
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <Link href={`/${locale}/payments/new`}>
          <Button className="bg-[#cd1419] hover:bg-[#a81014]">
            <Plus className="mr-2 h-4 w-4" />
            {t('record_payment')}
          </Button>
        </Link>
      </div>
      
      <PaymentStats stats={stats} />
      
      <Card>
        <CardHeader>
          <CardTitle>{t('all_payments')}</CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentFilters locale={locale} />
          <Suspense fallback={<div className="py-8 text-center">{t('loading')}</div>}>
            <PaymentList 
              payments={payments || []} 
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