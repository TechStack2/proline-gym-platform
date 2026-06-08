'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  User, 
  Calendar, 
  Hash, 
  FileText,
  CreditCard,
  Banknote,
  Wallet,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Mail,
  Phone
} from 'lucide-react'
import { useTranslations } from 'next-intl'

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

interface PaymentDetailProps {
  payment: Payment
  locale: string
}

export function PaymentDetail({ payment, locale }: PaymentDetailProps) {
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
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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
      <Badge variant={config.variant} className="flex items-center gap-1 text-sm px-3 py-1">
        <Icon className="h-4 w-4" />
        {t(status)}
      </Badge>
    )
  }
  
  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'cash':
        return <Banknote className="h-5 w-5" />
      case 'card':
        return <CreditCard className="h-5 w-5" />
      case 'transfer':
        return <Wallet className="h-5 w-5" />
      case 'check':
        return <Wallet className="h-5 w-5" />
      default:
        return <CreditCard className="h-5 w-5" />
    }
  }
  
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {t('student_info')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">{t('name')}</p>
            <p className="font-medium text-lg">
              {payment.students?.first_name} {payment.students?.last_name}
            </p>
          </div>
          {payment.students?.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{payment.students.email}</span>
            </div>
          )}
          {payment.students?.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{payment.students.phone}</span>
            </div>
          )}
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hash className="h-5 w-5" />
            {t('payment_info')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t('amount')}</span>
            <span className="font-bold text-2xl">
              {formatCurrency(payment.amount, payment.currency)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t('currency')}</span>
            <span className="font-medium">{payment.currency}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t('status')}</span>
            {getStatusBadge(payment.status)}
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t('payment_method')}</span>
            <div className="flex items-center gap-2">
              {getMethodIcon(payment.payment_method)}
              <span>{t(payment.payment_method)}</span>
            </div>
          </div>
          {payment.reference_number && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t('reference_number')}</span>
              <span className="font-mono">{payment.reference_number}</span>
            </div>
          )}
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t('dates')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t('payment_date')}</span>
            <span>{formatDate(payment.payment_date)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t('created_at')}</span>
            <span>{formatDate(payment.created_at)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t('updated_at')}</span>
            <span>{formatDate(payment.updated_at)}</span>
          </div>
        </CardContent>
      </Card>
      
      {payment.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t('notes')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{payment.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}