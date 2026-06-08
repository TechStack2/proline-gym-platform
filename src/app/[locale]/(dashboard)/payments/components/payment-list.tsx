'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { 
  Eye, 
  CreditCard, 
  Banknote, 
  Wallet, 
  CheckCircle2, 
  XCircle, 
  Clock,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

interface Payment {
  id: string
  student_id: string
  amount: number
  currency: 'USD' | 'LBP'
  payment_method: 'cash' | 'card' | 'transfer' | 'check'
  reference_number?: string
  notes?: string
  status: 'completed' | 'pending' | 'failed' | 'refunded'
  payment_date: string
  created_at: string
  updated_at: string
  students?: {
    id: string
    first_name: string
    last_name: string
    email?: string
    phone?: string
  }
}

interface PaymentListProps {
  payments: Payment[]
  locale: string
  totalPages: number
  currentPage: number
}

export function PaymentList({ payments, locale, totalPages, currentPage }: PaymentListProps) {
  const t = useTranslations('payments')
  
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency === 'USD' ? 'USD' : 'LBP',
      minimumFractionDigits: currency === 'USD' ? 2 : 0,
      maximumFractionDigits: currency === 'USD' ? 2 : 0,
    }).format(amount)
  }
  
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString(locale === 'ar' ? 'ar-SA' : locale === 'fr' ? 'fr-FR' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }
  
  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline', icon: any }> = {
      completed: { variant: 'default', icon: CheckCircle2 },
      pending: { variant: 'secondary', icon: Clock },
      failed: { variant: 'destructive', icon: XCircle },
      refunded: { variant: 'outline', icon: RefreshCw },
    }
    
    const config = variants[status] || { variant: 'outline' as const, icon: Clock }
    const Icon = config.icon
    
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {t(status)}
      </Badge>
    )
  }
  
  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'cash':
        return <Banknote className="h-4 w-4" />
      case 'card':
        return <CreditCard className="h-4 w-4" />
      case 'transfer':
        return <Wallet className="h-4 w-4" />
      case 'check':
        return <Wallet className="h-4 w-4" />
      default:
        return <CreditCard className="h-4 w-4" />
    }
  }
  
  if (payments.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t('no_payments')}</p>
      </div>
    )
  }
  
  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left font-medium">{t('student')}</th>
              <th className="p-3 text-left font-medium">{t('amount')}</th>
              <th className="p-3 text-left font-medium">{t('method')}</th>
              <th className="p-3 text-left font-medium">{t('reference')}</th>
              <th className="p-3 text-left font-medium">{t('status')}</th>
              <th className="p-3 text-left font-medium">{t('date')}</th>
              <th className="p-3 text-left font-medium">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} className="border-b hover:bg-muted/50 transition-colors">
                <td className="p-3">
                  <div className="font-medium">
                    {payment.students?.first_name} {payment.students?.last_name}
                  </div>
                  {payment.students?.email && (
                    <div className="text-sm text-muted-foreground">{payment.students.email}</div>
                  )}
                </td>
                <td className="p-3">
                  <div className="font-medium">{formatCurrency(payment.amount, payment.currency)}</div>
                  <div className="text-sm text-muted-foreground">{payment.currency}</div>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {getMethodIcon(payment.payment_method)}
                    <span>{t(payment.payment_method)}</span>
                  </div>
                </td>
                <td className="p-3">
                  <span className="text-sm text-muted-foreground">
                    {payment.reference_number || '-'}
                  </span>
                </td>
                <td className="p-3">{getStatusBadge(payment.status)}</td>
                <td className="p-3">
                  <span className="text-sm">{formatDate(payment.payment_date)}</span>
                </td>
                <td className="p-3">
                  <Link href={`/${locale}/payments/${payment.id}`}>
                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4 mr-1" />
                      {t('view')}
                    </Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('page_info', { current: currentPage, total: totalPages })}
          </p>
          <div className="flex gap-2">
            <Link href={`/${locale}/payments?page=${currentPage - 1}`}>
              <Button variant="outline" size="sm" disabled={currentPage <= 1}>
                <ChevronLeft className="h-4 w-4" />
                {t('previous')}
              </Button>
            </Link>
            <Link href={`/${locale}/payments?page=${currentPage + 1}`}>
              <Button variant="outline" size="sm" disabled={currentPage >= totalPages}>
                {t('next')}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}