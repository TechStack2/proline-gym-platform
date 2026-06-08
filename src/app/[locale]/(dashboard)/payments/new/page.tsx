import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { PaymentForm } from '../components/payment-form'

export const dynamic = 'force-dynamic'

interface NewPaymentPageProps {
  params: { locale: string }
}

export default async function NewPaymentPage({ params: { locale } }: NewPaymentPageProps) {
  const t = await getTranslations('payments')
  const supabase = await createClient()
  
  // Fetch students for the dropdown
  const { data: students } = await supabase
    .from('students')
    .select('id, first_name, last_name')
    .order('first_name', { ascending: true })
  
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('record_payment')}</h1>
        <p className="text-muted-foreground">{t('record_payment_description')}</p>
      </div>
      
      <PaymentForm students={students || []} locale={locale} />
    </div>
  )
}