import { createClient } from '@/lib/supabase/server'
import { localizedName } from '@/lib/billing/reconcile'
import { IssueInvoiceForm } from './issue-invoice-form'

export const dynamic = 'force-dynamic'

type Props = { params: { locale: string } }

export default async function NewInvoicePage({ params: { locale } }: Props) {
  const isRTL = locale === 'ar'
  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('students')
    .select('id, profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)')
    .eq('is_active', true)

  const students = (rows ?? [])
    .map((r: any) => {
      const profRow = r.profiles
      const profile = Array.isArray(profRow) ? profRow[0] : profRow
      return { id: r.id as string, name: localizedName(profile, locale) }
    })
    .filter((s) => s.name)
    .sort((a, b) => a.name.localeCompare(b.name))

  const { data: rate } = await supabase
    .from('exchange_rates')
    .select('rate, rate_date')
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <div className={`space-y-6 p-6 ${isRTL ? 'rtl text-right' : ''}`}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{isRTL ? 'إصدار فاتورة' : 'New invoice'}</h1>
        <p className="text-muted-foreground">{isRTL ? 'أصدر فاتورة بعملتين عبر الخدمة الموحّدة.' : 'Issue a dual-currency invoice through the canonical service.'}</p>
      </div>
      <IssueInvoiceForm
        locale={locale}
        students={students}
        exchangeRate={rate?.rate != null ? Number(rate.rate) : null}
        rateDate={rate?.rate_date ?? null}
      />
    </div>
  )
}
