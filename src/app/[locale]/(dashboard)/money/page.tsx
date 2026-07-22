import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { segmentedItemCls, segmentedTrayCls } from '@/components/ui/segmented'
import { getDailyTally } from '@/lib/billing/daily-tally'
import { getGymOutstanding } from '@/lib/billing/outstanding'
import { TallyError } from '@/components/money/tally-error'
import { METHOD_LABEL } from '@/lib/billing/reconcile'
import { gymCurrencyPref } from '@/lib/billing/gym-currency'
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
import { PageHeader } from '@/components/ui/page-header';
import { fmtMoney } from '@/lib/fmt'
import { Ltr } from '@/components/ui/bdi'

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
    className={segmentedItemCls(tab === k)}
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <PageHeader segment="money" />
          <p className="mt-0.5 text-sm text-gray-500">{t('subtitle')}</p>
        </div>
        {/* DA-20: scrollable at 390 — the 4th tab (Win-back) was fully offscreen with
            no affordance. flex + overflow-x-auto lets it scroll into view. */}
        <div className={segmentedTrayCls} data-testid="money-tabs">
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
  // drawer tally, the currency preference, and the outstanding roll-up. Fire them as
  // one wave.
  //   products — NO-MEMBERSHIP-GAPS: the renewals card + ProcessRenewals are
  //   membership-cycle furniture, hidden for a classes+PT gym.
  //   outstanding — MONEY-OUTSTANDING: one SECURITY DEFINER aggregate
  //   (get_gym_outstanding, 000109) that scopes to the session gym and sums the
  //   per-invoice balance COMPLETELY in SQL, replacing the old invoices.limit(500) +
  //   unbounded payments.in(ids) JS join that could silently truncate either side.
  const [products, tallyRes, pref, outstandingRes] = await Promise.all([
    getEnabledProducts(supabase, gymId),
    getDailyTally(supabase, { gymId }), // the cash drawer: today's per-method tally (shared D1 logic)
    gymCurrencyPref(supabase, gymId), // MONEY-LBP: order/emphasis of the dual totals
    getGymOutstanding(supabase, { gymId }), // both obligation cards, complete + gym-scoped
  ])
  // MONEY-TALLY: unwrap once. `tally` is only meaningful when the read succeeded —
  // the empty Map here is the render fallback for the ERROR branch below, never a
  // claim that nothing was collected.
  const tally = tallyRes.ok ? tallyRes.tally : new Map<string, { usd: number; lbp: number }>()

  // MONEY-OUTSTANDING: like the tally, a failed read is NOT a zero balance. When the
  // roll-up could not be read, `out` is null and BOTH obligation cards render the loud
  // error state below instead of a falsely-small "$0 owed".
  const out = outstandingRes.ok ? outstandingRes.totals : null
  const outMoney = out ? fmtMoney(out.usd, out.lbp, pref) : null
  const renewalMoney = out ? fmtMoney(out.renewalUsd, out.renewalLbp, pref) : null

  return (
    <>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {products.membership && (
      <div className="rounded-2xl border bg-white p-5 shadow-elevation-1" data-testid="money-renewals">
        <p className="flex items-center gap-1 text-xs text-gray-500"><RefreshCw className="h-3 w-3" /> {t('renewalsOutstanding')}</p>
        {/* MONEY-OUTSTANDING: a failed roll-up read must never wear the clothes of
            "nothing due" — same doctrine as the tally, on the obligations side. */}
        {!out || !renewalMoney ? (
          <TallyError
            testid="money-renewals-error"
            message={t('outstandingUnavailable')}
            retryLabel={t('tallyRetry')}
            retryHref={`/${locale}/money`}
            className="mt-1"
          />
        ) : (
          <>
            {/* DA-7: money swapped sides within one Arabic page ("$160.95" next to
                "80.00$") because an amount with no strong character takes the
                paragraph direction. <Ltr> isolates it; the symbol side is a property
                of the currency, fixed in both directions. */}
            {/* W3b zero doctrine (DA-38): a $0 renewals figure is a calm fact, not an
                amber alarm; the hue returns only when there is money to collect. */}
            <p className={cn('mt-1 text-2xl font-bold', out.renewalUsd > 0 || out.renewalLbp > 0 ? 'text-warning-600' : 'text-gray-500')} data-testid="money-renewals-usd"><Ltr>{renewalMoney.primary}</Ltr></p>
            {renewalMoney.secondary && (
              <p className={cn('text-sm font-semibold', out.renewalUsd > 0 || out.renewalLbp > 0 ? 'text-warning-500/90' : 'text-gray-400')} data-testid="money-renewals-lbp"><Ltr>{renewalMoney.secondary}</Ltr></p>
            )}
            <p className="mt-0.5 text-xs text-gray-400">{t('renewalsOpen', { count: out.renewalCount })}</p>
            <div className="mt-2"><ProcessRenewalsButton /></div>
          </>
        )}
      </div>
      )}
      <div className="rounded-2xl border bg-white p-5 shadow-elevation-1">
        <p className="text-xs text-gray-500">{t('outstanding')}</p>
        {!out || !outMoney ? (
          <TallyError
            testid="money-outstanding-error"
            message={t('outstandingUnavailable')}
            retryLabel={t('tallyRetry')}
            retryHref={`/${locale}/money`}
            className="mt-1"
          />
        ) : (
          <>
            {/* W3b zero doctrine (DA-38): zero owed is calm, not an alarm. */}
            <p className={cn('mt-1 text-2xl font-bold', out.usd > 0 || out.lbp > 0 ? 'text-danger-600' : 'text-gray-500')} data-testid="money-outstanding"><Ltr>{outMoney.primary}</Ltr></p>
            {outMoney.secondary && (
              <p className={cn('text-sm font-semibold', out.usd > 0 || out.lbp > 0 ? 'text-danger-500/90' : 'text-gray-400')} data-testid="money-outstanding-lbp"><Ltr>{outMoney.secondary}</Ltr></p>
            )}
            <p className="mt-0.5 text-xs text-gray-400">{t('openInvoices', { count: out.invoiceCount })}</p>
            <Link href={`/${locale}/money?tab=invoices`} className="mt-2 inline-block text-xs font-medium text-primary-600 hover:underline">
              {t('viewInvoices')}
            </Link>
          </>
        )}
      </div>
      <div className="rounded-2xl border bg-white p-5 shadow-elevation-1 sm:col-span-2">
        <p className="mb-2 text-xs text-gray-500">{t('todayTally')}</p>
        <div className="flex flex-wrap gap-3 text-sm" data-testid="money-tally">
          {/* MONEY-TALLY: three outcomes, three distinct renders. "Could not read the
              drawer" must never wear the clothes of "nobody has paid yet" — that
              equivalence is the defect this slice removes. */}
          {!tallyRes.ok ? (
            <TallyError
              testid="money-tally-error"
              message={t('tallyUnavailable')}
              retryLabel={t('tallyRetry')}
              retryHref={`/${locale}/money`}
            />
          ) : tally.size === 0 ? (
            <span className="text-gray-400" data-testid="money-tally-empty">{t('noPaymentsToday')}</span>
          ) : (
            [...tally.entries()].map(([method, v]) => {
              const m = fmtMoney(v.usd, v.lbp, pref)
              return (
              <span key={method} className="rounded-full bg-muted px-3 py-1" data-testid="money-tally-method" data-method={method}>
                {(locale === 'ar' ? METHOD_LABEL[method]?.ar : locale === 'fr' ? METHOD_LABEL[method]?.fr : METHOD_LABEL[method]?.en) || method}: <Ltr>{m.primary}</Ltr>
                {m.secondary ? <> · <Ltr>{m.secondary}</Ltr></> : ''}
              </span>
              )
            })
          )}
        </div>
        <Link href={`/${locale}/money?tab=payments`} className="mt-3 inline-block text-xs font-medium text-primary-600 hover:underline">
          {t('viewPayments')}
        </Link>
      </div>
    </div>
    {gymId && <OwnerFinances locale={locale} gymId={gymId} pref={pref} />}
    </>
  )
}
