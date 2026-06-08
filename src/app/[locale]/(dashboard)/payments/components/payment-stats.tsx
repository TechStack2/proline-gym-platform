'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DollarSign, TrendingUp, Clock, Wallet } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

interface PaymentStatsProps {
  stats: {
    todayUSD: number
    todayLBP: number
    monthUSD: number
    monthLBP: number
    pendingUSD: number
    pendingLBP: number
  }
}

export function PaymentStats({ stats }: PaymentStatsProps) {
  const t = useTranslations('payments')
  
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
      title: t('today_collections'),
      value: `${formatCurrency(stats.todayUSD, 'USD')} / ${formatCurrency(stats.todayLBP, 'LBP')}`,
      icon: DollarSign,
      description: t('collected_today'),
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      title: t('month_collections'),
      value: `${formatCurrency(stats.monthUSD, 'USD')} / ${formatCurrency(stats.monthLBP, 'LBP')}`,
      icon: TrendingUp,
      description: t('collected_this_month'),
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: t('pending_amounts'),
      value: `${formatCurrency(stats.pendingUSD, 'USD')} / ${formatCurrency(stats.pendingLBP, 'LBP')}`,
      icon: Clock,
      description: t('pending_collections'),
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100',
    },
    {
      title: t('total_revenue'),
      value: `${formatCurrency(stats.monthUSD + stats.todayUSD, 'USD')}`,
      icon: Wallet,
      description: t('total_collections'),
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