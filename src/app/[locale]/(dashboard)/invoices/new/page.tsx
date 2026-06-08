import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { InvoiceForm } from '../components/invoice-form'

export const dynamic = 'force-dynamic'

interface NewInvoicePageProps {
  params: { locale: string }
}

export default async function NewInvoicePage({ params: { locale } }: NewInvoicePageProps) {
  const t = await getTranslations('invoices')
  const supabase = await createClient()
  
  // Fetch students for the dropdown
  const { data: students } = await supabase
    .from('students')
    .select('id, first_name, last_name')
    .order('first_name', { ascending: true })
  
  // Fetch membership plans
  const { data: membershipPlans } = await supabase
    .from('membership_plans')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true })
  
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('generate_invoice')}</h1>
        <p className="text-muted-foreground">{t('generate_invoice_description')}</p>
      </div>
      
      <InvoiceForm 
        students={students || []} 
        membershipPlans={membershipPlans || []} 
        locale={locale} 
      />
    </div>
  )
}