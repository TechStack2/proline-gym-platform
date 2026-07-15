import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { localizedName } from '@/lib/billing/reconcile'
import { IssueInvoiceForm } from './issue-invoice-form'

export const dynamic = 'force-dynamic'

type Props = { params: { locale: string } }

export default async function NewInvoicePage({ params: { locale } }: Props) {
  const tn = await getTranslations('invoiceNew')
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

  // FX-PER-GYM: rates are per-gym now — scope to the caller's gym (the new RLS
  // enforces this too; the .eq is defense-in-depth + explicit intent).
  const { data: { user } } = await supabase.auth.getUser()
  const { data: prof } = await supabase.from('profiles').select('gym_id').eq('id', user?.id ?? '').single()
  const gymId = prof?.gym_id ?? ''
  const { data: rate } = await supabase
    .from('exchange_rates')
    .select('rate, rate_date')
    .eq('gym_id', gymId)
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  // BILL-LOCALIZE: the gym's per-gym tax rate (000074) + TVA registration drive an
  // HONEST issuance hint — no hardcoded "11% TVA".
  const { data: gymTax } = await supabase
    .from('gyms')
    .select('tax_rate, tva_registration_number')
    .eq('id', gymId)
    .maybeSingle()
  const taxRate = Number(gymTax?.tax_rate ?? 0)
  const tvaRegistered = !!gymTax?.tva_registration_number

  return (
    <div className={`space-y-6 p-6 ${isRTL ? 'rtl text-right' : ''}`}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{tn('title')}</h1>
        <p className="text-muted-foreground">{tn('subtitle')}</p>
      </div>
      <IssueInvoiceForm
        locale={locale}
        students={students}
        exchangeRate={rate?.rate != null ? Number(rate.rate) : null}
        rateDate={rate?.rate_date ?? null}
        taxRate={taxRate}
        tvaRegistered={tvaRegistered}
      />
    </div>
  )
}
