import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  ArrowLeft, 
  Printer, 
  CreditCard, 
  Banknote, 
  Wallet,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  User,
  Calendar,
  Hash,
  FileText
} from 'lucide-react'
import Link from 'next/link'
import { PaymentDetail } from '../components/payment-detail'

export const dynamic = 'force-dynamic'

interface PaymentDetailPageProps {
  params: { locale: string; id: string }
}

export default async function PaymentDetailPage({ params: { locale, id } }: PaymentDetailPageProps) {
  const t = await getTranslations('payments')
  const supabase = await createClient()
  
  const { data: payment, error } = await supabase
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
    `)
    .eq('id', id)
    .single()
  
  if (error || !payment) {
    notFound()
  }
  
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/${locale}/payments`}>
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('payment_detail')}</h1>
            <p className="text-muted-foreground">{t('payment_detail_description')}</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          {t('print')}
        </Button>
      </div>
      
      <PaymentDetail payment={payment} locale={locale} />
    </div>
  )
}