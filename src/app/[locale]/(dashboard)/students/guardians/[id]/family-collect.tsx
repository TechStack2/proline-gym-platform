'use client'

/**
 * MEMBER-360-ACTIONABLE §4.1 — "Collect family balance": ONE tap into the
 * payment flow pre-scoped to this family, oldest obligations first and
 * pre-selected. Confirm records a full-balance payment per selected invoice
 * through the SAME verified `recordPayment` action (D1) — one call per invoice,
 * sequential, loud per-invoice failure. The payer identity needs no client arg:
 * every guardian-billed invoice is already payer-stamped by issuance (000037).
 *
 * Two triggers share one dialog: the family-balance STAT (§2.1 — the stat IS
 * the 1-tap door) and the primary button in the actions row.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Ltr } from '@/components/ui/bdi'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/use-toast'
import { Loader2 } from 'lucide-react'
import { VARIANT_TINT } from '@/lib/status-vocabulary'
import { recordPayment } from '../../../invoices/actions'
import { useErrorText } from '@/lib/errors/use-error-text'

export type FamilyCollectRow = {
  invoiceId: string
  invoiceNumber: string
  childName: string
  ageDays: number
  bucketVariant: 'neutral' | 'warning' | 'danger'
  bucketLabel: string
  balanceUsd: number
  exchangeRate: number | null
}

const METHODS = ['cash_usd', 'cash_lbp', 'omt', 'whish', 'bank_transfer', 'bob_finance'] as const
type Method = (typeof METHODS)[number]

export function FamilyCollect({
  rows, familyBalance, oldestDays, locale, statLabel, oldestChip, children,
}: {
  /** oldest-due-first (the pre-selection order guarantee) */
  rows: FamilyCollectRow[]
  familyBalance: number
  oldestDays: number
  locale: string
  statLabel: string
  oldestChip: string | null
  /** the actions-row trigger button (second door to the same dialog) */
  children?: React.ReactNode
}) {
  const t = useTranslations('guardians.collect')
  const tm = useTranslations('member360.actions')
  const errText = useErrorText()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, startTransition] = useTransition()
  const [checked, setChecked] = useState<Set<string>>(() => new Set(rows.map((r) => r.invoiceId)))
  const [method, setMethod] = useState<Method>('cash_usd')

  const selected = rows.filter((r) => checked.has(r.invoiceId))
  const total = Math.round(selected.reduce((s, r) => s + r.balanceUsd, 0) * 100) / 100
  const owes = familyBalance > 0.005

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const submit = () =>
    startTransition(async () => {
      let okCount = 0
      for (const r of selected) {
        const res = await recordPayment({
          invoiceId: r.invoiceId, amountUsd: r.balanceUsd, method,
          reference: null, exchangeRate: r.exchangeRate,
        })
        if (!res.ok) {
          toast({ title: t('partialFail', { n: okCount, number: r.invoiceNumber }), description: errText((res as any).error), variant: 'destructive' })
          router.refresh()
          return
        }
        okCount += 1
      }
      toast({ title: t('collected', { n: okCount }), variant: 'success' })
      setOpen(false)
      router.refresh()
    })

  return (
    <>
      {/* §4.1 — ONE grid cell: the stat tile (a 1-tap door when owed) with the
          labeled collect trigger stacked under it. Calm at zero. */}
      <div className="rounded-2xl border bg-white px-4 py-3 shadow-elevation-1">
        <button
          type="button"
          data-testid="guardian-family-collect-stat"
          onClick={() => owes && setOpen(true)}
          disabled={!owes}
          className={cn(
            'block w-full text-start',
            owes && 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--shell-accent)]',
          )}
        >
          <p className="text-[11px] uppercase tracking-wide text-gray-400">{statLabel}</p>
          <p className={cn('mt-0.5 text-xl font-bold tabular-nums', owes ? 'text-danger-600' : 'text-gray-500')}
            data-testid="guardian-family-outstanding" data-amount={familyBalance.toFixed(2)}>
            <Ltr>{`$${familyBalance.toFixed(2)}`}</Ltr>
          </p>
          {owes && oldestChip && (
            <p className="mt-1">
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', VARIANT_TINT[oldestDays > 30 ? 'danger' : 'warning'])}>
                {oldestChip}
              </span>
            </p>
          )}
        </button>
        {children != null && owes && (
          <div className="mt-2" onClick={() => setOpen(true)}>{children}</div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen} title={t('title')} description={t('subtitle')}
        variant="responsive" data-testid="family-collect-dialog"
        footer={
          <>
            <span className="me-auto text-sm font-semibold text-gray-800" data-testid="family-collect-total">
              <Ltr>{`$${total.toFixed(2)}`}</Ltr>
            </span>
            <Button size="sm" data-testid="family-collect-submit" disabled={busy || selected.length === 0}
              onClick={submit} className="bg-primary-700 hover:bg-primary-800">
              {busy && <Loader2 className="me-1 h-4 w-4 animate-spin" />}
              {t('confirm', { n: selected.length })}
            </Button>
          </>
        }>
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.invoiceId}>
              <label className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50"
                data-testid="family-collect-row" data-invoice-id={r.invoiceId} data-checked={checked.has(r.invoiceId) || undefined}>
                <input type="checkbox" checked={checked.has(r.invoiceId)} onChange={() => toggle(r.invoiceId)} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-gray-800">{r.childName}</span>
                  <span className="block font-mono text-[10px] text-gray-400">{r.invoiceNumber}</span>
                </span>
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', VARIANT_TINT[r.bucketVariant])}>
                  {r.bucketLabel}
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums"><Ltr>{`$${r.balanceUsd.toFixed(2)}`}</Ltr></span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-gray-600">{tm('method')}</label>
          <Select data-testid="family-collect-method" value={method} onChange={(e) => setMethod(e.target.value as Method)} className="h-9">
            {METHODS.map((m) => <option key={m} value={m}>{tm(`methods.${m}`)}</option>)}
          </Select>
        </div>
      </Dialog>
    </>
  )
}
