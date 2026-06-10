import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { FileText, DollarSign, CheckCircle, Clock, AlertCircle, Printer } from 'lucide-react'
import { balanceUsd } from '@/lib/billing/reconcile'

type Props = { params: { locale: string } }

export default async function PortalBillingPage({ params: { locale } }: Props) {
  const isRTL = locale === 'ar'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: student } = await supabase.from('students').select('id').eq('profile_id', user.id).single()

  const { data: invoices } = await supabase.from('invoices')
    .select('id, invoice_number, invoice_type, total_usd, total_lbp, status, due_date, paid_at, created_at')
    .eq('student_id', student?.id).order('created_at', { ascending: false }).limit(20)

  const { data: payments } = await supabase.from('payments')
    .select('id, invoice_id, amount_usd, amount_lbp, payment_method, payment_date, reference_number')
    .eq('student_id', student?.id).order('payment_date', { ascending: false }).limit(50)

  // Reconcile each invoice's balance from this member's payments (canonical USD).
  const paidByInvoice = new Map<string, number>()
  for (const p of (payments ?? []) as any[]) {
    if (!p.invoice_id) continue
    paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount_usd ?? 0))
  }
  const invBalance = (inv: { id: string; total_usd: number | null }) =>
    balanceUsd(inv.total_usd, [{ amount_usd: paidByInvoice.get(inv.id) ?? 0 }])

  const { data: membership } = await supabase.from('student_memberships')
    .select('status, end_date, membership_plans:plan_id (name_en, name_ar, name_fr, price_usd)')
    .eq('student_id', student?.id).eq('status', 'active').maybeSingle()

  const mplans: any = (membership as any)?.membership_plans
  const mplan = Array.isArray(mplans) ? mplans[0] : mplans
  const membershipNameVal = mplan ? (isRTL ? mplan.name_ar : (locale === 'fr' ? mplan.name_fr : mplan.name_en)) : null

  const statusIcons: Record<string,any> = { paid: CheckCircle, pending: Clock, overdue: AlertCircle, cancelled: AlertCircle, refunded: DollarSign, partial: Clock }
  const statusColors: Record<string,string> = { paid: 'bg-green-100 text-green-700', pending: 'bg-yellow-100 text-yellow-700', overdue: 'bg-red-100 text-red-700', cancelled: 'bg-gray-100 text-gray-500', refunded: 'bg-blue-100 text-blue-700', partial: 'bg-orange-100 text-orange-700' }
  const statusLabels: Record<string,string> = { paid: isRTL?'مدفوع':'Paid', pending: isRTL?'معلق':'Pending', overdue: isRTL?'متأخر':'Overdue', cancelled: isRTL?'ملغي':'Cancelled', refunded: isRTL?'مسترجع':'Refunded', partial: isRTL?'جزئي':'Partial' }
  const fmtDate = (d: string) => new Date(d).toLocaleDateString(isRTL ? 'ar-LB' : 'en-US')

  return (
    <div className={cn('p-4 space-y-6', isRTL && 'rtl')}>
      {membership && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-sm text-gray-900 mb-3">{isRTL ? 'العضوية' : 'Membership'}</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-700">{membershipNameVal}</p>
              <p className="text-xs text-gray-500">{isRTL?'تنتهي في':'Expires'}: {fmtDate(membership.end_date)}</p>
            </div>
            <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">{isRTL?'نشطة':'Active'}</span>
          </div>
        </div>
      )}

      <div>
        <h3 className="font-semibold text-sm text-gray-900 mb-3">{isRTL ? 'الفواتير' : 'Invoices'}</h3>
        {invoices && invoices.length > 0 ? (
          <div className="space-y-2">
            {invoices.map((inv: any) => {
              const Icon = statusIcons[inv.status] || FileText
              const bal = invBalance(inv)
              return (
                <div key={inv.id} className="rounded-xl bg-white p-4 shadow-sm flex items-center justify-between"
                  data-testid="portal-invoice" data-invoice-number={inv.invoice_number} data-status={inv.status}>
                  <div className="flex items-center gap-3">
                    <div className={cn('rounded-full p-2', inv.status==='paid'?'bg-green-50':inv.status==='overdue'?'bg-red-50':'bg-gray-50')}>
                      <Icon className={cn('h-4 w-4', inv.status==='paid'?'text-green-600':inv.status==='overdue'?'text-red-600':'text-gray-500')} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">#{inv.invoice_number?.slice(-8)}</p>
                      <p className="text-xs text-gray-500">{fmtDate(inv.created_at)}</p>
                      <Link href={`/${locale}/invoices/${inv.id}/receipt`} data-testid="portal-receipt-link"
                        className="mt-0.5 inline-flex items-center gap-1 text-xs text-[#cd1419] hover:underline">
                        <Printer className="h-3 w-3" /> {isRTL ? 'الإيصال' : 'Receipt'}
                      </Link>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">${inv.total_usd?.toFixed(2)}</p>
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', statusColors[inv.status])} data-testid="portal-invoice-status">{statusLabels[inv.status]}</span>
                    <p className="mt-0.5 text-xs" data-testid="portal-invoice-balance">
                      <span className={bal > 0 ? 'text-red-600' : 'text-green-600'}>{isRTL ? 'الرصيد' : 'Balance'}: ${bal.toFixed(2)}</span>
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <FileText className="mx-auto h-10 w-10 text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">{isRTL?'لا توجد فواتير':'No invoices'}</p>
          </div>
        )}
      </div>

      <div>
        <h3 className="font-semibold text-sm text-gray-900 mb-3">{isRTL ? 'سجل المدفوعات' : 'Payment History'}</h3>
        {payments && payments.length > 0 ? (
          <div className="space-y-2">
            {payments.map((pay: any) => (
              <div key={pay.id} className="rounded-xl bg-white p-3 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">${pay.amount_usd?.toFixed(2)}{pay.amount_lbp ? ` / LBP ${pay.amount_lbp?.toLocaleString()}` : ''}</p>
                  <p className="text-xs text-gray-400">{pay.payment_method?.replace(/_/g,' ')} — {fmtDate(pay.payment_date)}</p>
                </div>
                <DollarSign className="h-4 w-4 text-green-500" />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <DollarSign className="mx-auto h-10 w-10 text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">{isRTL?'لا توجد مدفوعات':'No payments yet'}</p>
          </div>
        )}
      </div>
    </div>
  )
}
