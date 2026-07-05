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
import { getEnabledProducts } from '@/lib/gym/products'
import { gymDisplayName } from '@/lib/whatsapp/identity'
import { OnlineOnlyNotice } from '@/components/offline/online-only-notice'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Props = {
  params: { locale: string }
  searchParams: { tab?: string; search?: string; status?: string; method?: string; from?: string; to?: string; aging?: string }
}

// FORM-FOCUS-SWEEP: hoisted to module scope (stable type) — was defined during render.
const TabLink = ({ locale, tab, k, label, icon: Icon }: { locale: string; tab: string; k: string; label: string; icon: any }) => (
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

  // NO-MEMBERSHIP-GAPS: win-back is membership-churn recovery — hide the tab (and
  // its deep link) when the gym doesn't sell membership.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: me } = user
    ? await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
    : { data: null }
  const products = await getEnabledProducts(supabase, me?.gym_id)

  const validTabs = ['invoices', 'payments', ...(products.membership ? ['winback'] : [])]
  const tab = validTabs.includes(searchParams.tab ?? '') ? searchParams.tab! : 'overview'

  return (
    <div className={cn('space-y-6', isRTL && 'rtl text-right')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={cn('hidden md:block text-2xl font-bold text-gray-900', isRTL && 'font-arabic')}>{t('title')}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{t('subtitle')}</p>
        </div>
        <div className="inline-flex rounded-xl border bg-gray-50 p-1" data-testid="money-tabs">
          <TabLink locale={locale} tab={tab} k="overview" label={t('overview')} icon={DollarSign} />
          <TabLink locale={locale} tab={tab} k="invoices" label={t('invoices')} icon={FileText} />
          <TabLink locale={locale} tab={tab} k="payments" label={t('payments')} icon={Banknote} />
          {products.membership && <TabLink locale={locale} tab={tab} k="winback" label={t('winback')} icon={Heart} />}
        </div>
      </div>

      {/* G2 scope guard: payments are ONLINE-ONLY (only attendance works offline). */}
      <OnlineOnlyNotice locale={locale} messageKey="paymentsNeedConnection" />

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
  // WL-TEMPLATES: the win-back wa.me message greets with this gym's localized name.
  const { data: gymRow } = await supabase.from('gyms').select('name_ar, name_en, name_fr').eq('id', profile.gym_id).maybeSingle()
  return <WinbackView rows={rows} locale={locale} gymName={gymDisplayName(gymRow, locale)} />
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

  // PERF-2: these four reads are mutually independent — the products flag, the cash
  // drawer tally, the open-invoice set, and the renewal-invoice set. Fire them as one
  // wave; only the payments reconciliation (below) depends on the open-invoice ids.
  //   products — NO-MEMBERSHIP-GAPS: the renewals card + ProcessRenewals are
  //   membership-cycle furniture, hidden for a classes+PT gym.
  const [products, tally, { data: openInvoices }, { data: renewalRows }] = await Promise.all([
    getEnabledProducts(supabase, gymId),
    getDailyTally(supabase), // the cash drawer: today's per-method tally (shared D1 logic)
    supabase
      .from('invoices')
      .select('id, total_usd, status')
      .in('status', ['pending', 'partial', 'overdue'])
      .limit(500),
    // ML-1: open renewal invoices (the system-issued ones), reconciled below.
    supabase
      .from('renewal_invoices')
      .select('invoice_id, invoices:invoice_id!inner (id, total_usd, status, gym_id)'),
  ])

  // Outstanding obligations: reconcile the open invoices against their payments
  // (D1 canon — balance from Σ amount_usd).
  const ids = (openInvoices ?? []).map((i) => i.id)
  const { data: pays } = ids.length
    ? await supabase.from('payments').select('invoice_id, amount_usd').in('invoice_id', ids)
    : { data: [] as { invoice_id: string; amount_usd: number | null }[] }
  const paidBy = new Map<string, number>()
  for (const p of pays ?? []) paidBy.set(p.invoice_id, (paidBy.get(p.invoice_id) ?? 0) + Number(p.amount_usd ?? 0))
  const outstanding = (openInvoices ?? []).reduce(
    (s, inv) => s + balanceUsd(inv.total_usd, [{ amount_usd: paidBy.get(inv.id) ?? 0 }]), 0)
  const openRenewalInvs = ((renewalRows ?? []) as any[])
    .map((r) => (Array.isArray(r.invoices) ? r.invoices[0] : r.invoices))
    .filter((i: any) => i && ['pending', 'partial', 'overdue'].includes(i.status))
  const renewalOutstanding = openRenewalInvs.reduce(
    (s2: number, i: any) => s2 + balanceUsd(i.total_usd, [{ amount_usd: paidBy.get(i.id) ?? 0 }]), 0)

  return (
    <>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {products.membership && (
      <div className="rounded-2xl border bg-white p-5 shadow-elevation-1" data-testid="money-renewals">
        <p className="flex items-center gap-1 text-xs text-gray-500"><RefreshCw className="h-3 w-3" /> {t('renewalsOutstanding')}</p>
        <p className="mt-1 text-2xl font-bold text-amber-600" data-testid="money-renewals-usd">${renewalOutstanding.toFixed(2)}</p>
        <p className="mt-0.5 text-xs text-gray-400">{t('renewalsOpen', { count: openRenewalInvs.length })}</p>
        <div className="mt-2"><ProcessRenewalsButton /></div>
      </div>
      )}
      <div className="rounded-2xl border bg-white p-5 shadow-elevation-1">
        <p className="text-xs text-gray-500">{t('outstanding')}</p>
        <p className="mt-1 text-2xl font-bold text-red-600" data-testid="money-outstanding">${outstanding.toFixed(2)}</p>
        <p className="mt-0.5 text-xs text-gray-400">{t('openInvoices', { count: (openInvoices ?? []).length })}</p>
        <Link href={`/${locale}/money?tab=invoices`} className="mt-2 inline-block text-xs font-medium text-primary-600 hover:underline">
          {t('viewInvoices')}
        </Link>
      </div>
      <div className="rounded-2xl border bg-white p-5 shadow-elevation-1 sm:col-span-2">
        <p className="mb-2 text-xs text-gray-500">{t('todayTally')}</p>
        <div className="flex flex-wrap gap-3 text-sm" data-testid="money-tally">
          {tally.size === 0 ? (
            <span className="text-gray-400">{t('noPaymentsToday')}</span>
          ) : (
            [...tally.entries()].map(([method, v]) => (
              <span key={method} className="rounded-full bg-muted px-3 py-1">
                {(locale === 'ar' ? METHOD_LABEL[method]?.ar : locale === 'fr' ? METHOD_LABEL[method]?.fr : METHOD_LABEL[method]?.en) || method}: ${v.usd.toFixed(2)}
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
