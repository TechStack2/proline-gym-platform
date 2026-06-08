'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Eye, 
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

interface Invoice {
  id: string
  invoice_number: string
  student_id: string
  membership_plan_id?: string
  amount: number
  currency: 'USD' | 'LBP'
  issue_date: string
  due_date: string
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  notes?: string
  created_at: string
  updated_at: string
  students?: {
    id: string
    first_name: string
    last_name: string
    email?: string
    phone?: string
  }
  membership_plans?: {
    id: string
    name: string
    price_usd: number
    price_lbp: number
    duration_days: number
    max_classes_per_week: number
  }
}

interface InvoiceListProps {
  invoices: Invoice[]
  locale: string
  totalPages: number
  currentPage: number
}

export function InvoiceList({ invoices, locale, totalPages, currentPage }: InvoiceListProps) {
  const t = useTranslations('invoices')
  
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
      paid: { variant: 'default', icon: CheckCircle2 },
      sent: { variant: 'secondary', icon: Clock },
      overdue: { variant: 'destructive', icon: AlertTriangle },
      draft: { variant: 'outline', icon: FileText },
      cancelled: { variant: 'outline', icon: XCircle },
    }
    
    const config = variants[status] || { variant: 'outline' as const, icon: FileText }
    const Icon = config.icon
    
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {t(status)}
      </Badge>
    )
  }
  
  if (invoices.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t('no_invoices')}</p>
      </div>
    )
  }
  
  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left font-medium">{t('invoice_number')}</th>
              <th className="p-3 text-left font-medium">{t('student')}</th>
              <th className="p-3 text-left font-medium">{t('amount')}</th>
              <th className="p-3 text-left font-medium">{t('issue_date')}</th>
              <th className="p-3 text-left font-medium">{t('due_date')}</th>
              <th className="p-3 text-left font-medium">{t('status')}</th>
              <th className="p-3 text-left font-medium">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="border-b hover:bg-muted/50 transition-colors">
                <td className="p-3">
                  <div className="font-mono font-medium">{invoice.invoice_number}</div>
                </td>
                <td className="p-3">
                  <div className="font-medium">
                    {invoice.students?.first_name} {invoice.students?.last_name}
                  </div>
                  {invoice.students?.email && (
                    <div className="text-sm text-muted-foreground">{invoice.students.email}</div>
                  )}
                </td>
                <td className="p-3">
                  <div className="font-medium">{formatCurrency(invoice.amount, invoice.currency)}</div>
                  <div className="text-sm text-muted-foreground">{invoice.currency}</div>
                </td>
                <td className="p-3">
                  <span className="text-sm">{formatDate(invoice.issue_date)}</span>
                </td>
                <td className="p-3">
                  <span className="text-sm">{formatDate(invoice.due_date)}</span>
                </td>
                <td className="p-3">{getStatusBadge(invoice.status)}</td>
                <td className="p-3">
                  <Link href={`/${locale}/invoices/${invoice.id}`}>
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
            <Link href={`/${locale}/invoices?page=${currentPage - 1}`}>
              <Button variant="outline" size="sm" disabled={currentPage <= 1}>
                <ChevronLeft className="h-4 w-4" />
                {t('previous')}
              </Button>
            </Link>
            <Link href={`/${locale}/invoices?page=${currentPage + 1}`}>
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