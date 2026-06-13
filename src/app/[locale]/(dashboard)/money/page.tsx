import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { getDailyTally } from '@/lib/billing/daily-tally'
import { balanceUsd, METHOD_LABEL } from '@/lib/billing/reconcile'
import { InvoicesView } from '../invoices/invoices-view'
import { PaymentsView } from '../payments/payments-view'
import { DollarSign, FileText, Banknote, RefreshCw, Heart } from 'lucide-react'
import { ProcessRenewalsButton } from '@/components/dashboard/lifecycle-buttons'
import { OwnerFinances } from './money-owner-dashboard'
import { WinbackView } from './winback-view'
import { getWinbackQueue } from '@/lib/finances/winback'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Props = {
  params: { locale: string }
  searchParams: { tab?: string; search?: string; status?: string; method?: string; from?: string; to?: string; aging?: string }
}

/**
 * /money — ONE ledger (IA-2). The issue → settle → reconcile workflow (D1) was
 * split across two sibling tabs; this unifies it: Overview (the cash drawer —
 * today's per-method tally + outstanding obligations) · Invoices · Payments
 * (the existing verified surfaces re-homed; /invoices + /payments redirect in).
 * D3 dunning lands in Overview later.
 */
export default async function MoneyPage({ params: { locale }, searchParams }: Props) {
  const isRTL = locale === 'ar'
  const t = await getTranslations('money')
  const tab = ['invoices', 'payments', 'winback'].includes(searchParams.tab ?? '') ? searchParams.tab! : 'overview'

  const TabLink = ({ k, label, icon: Icon }: { k: string; label: string; icon: any }) => (
    <Link
      href={`/${locale}/money${k === 'overview' ? '' : `?tab=${k}`}`}
      data-testid={`money-tab-${k}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
        tab === k ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
      )}
    >
      <Icon className="h-4 w-4" /> {label}
    </Link>
  )

  return (
    <div className={cn('space-y-6 p-4 md:p-0', isRTL && 'rtl text-right')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={cn('text-2xl font-bold text-gray-900', isRTL && 'font-arabic')}>{t('title')}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{t('subtitle')}</p>
        </div>
        <div className="inline-flex rounded-xl border bg-gray-50 p-1" data-testid="money-tabs">
          <TabLink k="overview" label={t('overview')} icon={DollarSign} />
          <TabLink k="invoices" label={t('invoices')} icon={FileText} />
          <TabLink k="payments" label={t('payments')} icon={Banknote} />
          <TabLink k="winback" label={t('winback')} icon={Heart} />
        </div>
      </div>

      {tab === 'overview' && <MoneyOverview locale={locale} />}
      {tab === 'invoices' && <InvoicesView locale={locale} searchParams={searchParams} />}
      {tab === 'payments' && <PaymentsView locale={locale} searchParams={searchParams} />}
      {tab === 'winback' && <WinbackTab locale={locale} />}
    </div>
  )
}

async function WinbackTab({ locale }: { locale: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
  if (!profile?.gym_id) return null
  const rows = await getWinbackQueue(supabase, profile.gym_id, locale)
  return <WinbackView rows={rows} locale={locale} />
}

async function MoneyOverview({ locale }: { locale: string }) {
  const isRTL = locale === 'ar'
  const t = await getTranslations('money')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
    : { data: null }
  const gymId = profile?.gym_id as string | undefined

  // The cash drawer: today's per-method tally (shared D1 logic).
  const tally = await getDailyTally(supabase)

  // Outstanding obligations: pending/partial/overdue invoices reconciled against
  // their payments (D1 canon — balance from Σ amount_usd).
  const { data: openInvoices } = await supabase
    .from('invoices')
    .select('id, total_usd, status')
    .in('status', ['pending', 'partial', 'overdue'])
    .limit(500)
  const ids = (openInvoices ?? []).map((i) => i.id)
  const { data: pays } = ids.length
    ? await supabase.from('payments').select('invoice_id, amount_usd').in('invoice_id', ids)
    : { data: [] as { invoice_id: string; amount_usd: number | null }[] }
  const paidBy = new Map<string, number>()
  for (const p of pays ?? []) paidBy.set(p.invoice_id, (paidBy.get(p.invoice_id) ?? 0) + Number(p.amount_usd ?? 0))
  const outstanding = (openInvoices ?? []).reduce(
    (s, inv) => s + balanceUsd(inv.total_usd, [{ amount_usd: paidBy.get(inv.id) ?? 0 }]), 0)

  // ML-1: open renewal invoices (the system-issued ones) reconciled.
  const { data: renewalRows } = await supabase
    .from('renewal_invoices')
    .select('invoice_id, invoices:invoice_id!inner (id, total_usd, status, gym_id)')
  const openRenewalInvs = ((renewalRows ?? []) as any[])
    .map((r) => (Array.isArray(r.invoices) ? r.invoices[0] : r.invoices))
    .filter((i: any) => i && ['pending', 'partial', 'overdue'].includes(i.status))
  const renewalOutstanding = openRenewalInvs.reduce(
    (s2: number, i: any) => s2 + balanceUsd(i.total_usd, [{ amount_usd: paidBy.get(i.id) ?? 0 }]), 0)

  return (
    <>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-2xl border bg-white p-4 shadow-sm" data-testid="money-renewals">
        <p className="flex items-center gap-1 text-xs text-gray-500"><RefreshCw className="h-3 w-3" /> {t('renewalsOutstanding')}</p>
        <p className="mt-1 text-2xl font-bold text-amber-600" data-testid="money-renewals-usd">${renewalOutstanding.toFixed(2)}</p>
        <p className="mt-0.5 text-xs text-gray-400">{t('renewalsOpen', { count: openRenewalInvs.length })}</p>
        <div className="mt-2"><ProcessRenewalsButton /></div>
      </div>
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <p className="text-xs text-gray-500">{t('outstanding')}</p>
        <p className="mt-1 text-2xl font-bold text-red-600" data-testid="money-outstanding">${outstanding.toFixed(2)}</p>
        <p className="mt-0.5 text-xs text-gray-400">{t('openInvoices', { count: (openInvoices ?? []).length })}</p>
        <Link href={`/${locale}/money?tab=invoices`} className="mt-2 inline-block text-xs font-medium text-primary-600 hover:underline">
          {t('viewInvoices')}
        </Link>
      </div>
      <div className="rounded-2xl border bg-white p-4 shadow-sm sm:col-span-2">
        <p className="mb-2 text-xs text-gray-500">{t('todayTally')}</p>
        <div className="flex flex-wrap gap-3 text-sm" data-testid="money-tally">
          {tally.size === 0 ? (
            <span className="text-gray-400">{t('noPaymentsToday')}</span>
          ) : (
            [...tally.entries()].map(([method, v]) => (
              <span key={method} className="rounded-full bg-muted px-3 py-1">
                {(isRTL ? METHOD_LABEL[method]?.ar : METHOD_LABEL[method]?.en) || method}: ${v.usd.toFixed(2)}
                {v.lbp ? ` · ${v.lbp.toLocaleString()} LBP` : ''}
              </span>
            ))
          )}
        </div>
        <Link href={`/${locale}/money?tab=payments`} className="mt-3 inline-block text-xs font-medium text-primary-600 hover:underline">
          {t('viewPayments')}
        </Link>
      </div>
    </div>
    {gymId && <OwnerFinances locale={locale} gymId={gymId} />}
    </>
  )
}
