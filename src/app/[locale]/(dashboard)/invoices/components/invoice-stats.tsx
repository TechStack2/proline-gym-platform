'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, CheckCircle2, AlertTriangle, Clock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

interface InvoiceStatsProps {
  stats: {
    total: number
    paid: number
    overdue: number
    draft: number
    totalAmountUSD: number
    totalAmountLBP: number
  }
}

export function InvoiceStats({ stats }: InvoiceStatsProps) {
  const t = useTranslations('invoices')
  
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency === 'USD' ? 'USD' : 'LBP',
      minimumFractionDigits: currency === 'USD' ? 2 : 0,
      maximumFractionDigits: currency === 'USD' ? 2 : 0,
    }).format(amount)
  }
  
  const statCards = [
    {
      title: t('total_invoices'),
      value: stats.total.toString(),
      icon: FileText,
      description: t('all_invoices_count'),
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: t('paid_invoices'),
      value: stats.paid.toString(),
      icon: CheckCircle2,
      description: t('paid_invoices_count'),
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      title: t('overdue_invoices'),
      value: stats.overdue.toString(),
      icon: AlertTriangle,
      description: t('overdue_invoices_count'),
      color: 'text-red-600',
      bgColor: 'bg-red-100',
    },
    {
      title: t('total_amount'),
      value: `${formatCurrency(stats.totalAmountUSD, 'USD')}`,
      icon: Clock,
      description: t('total_invoice_amount'),
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
  ]
  
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {statCards.map((card, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <div className={cn('rounded-lg p-2', card.bgColor)}>
              <card.icon className={cn('h-4 w-4', card.color)} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            <p className="text-xs text-muted-foreground">{card.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}