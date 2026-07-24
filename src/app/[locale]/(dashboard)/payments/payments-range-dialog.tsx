'use client'

/**
 * MONEY-MOBILE R4 — the custom date-range affordance for the payments filter.
 *
 * §2.6/W4 doctrine: native date inputs leave the surface as quick-range CHIPS, but a
 * data-entry native stays WRAPPED inside a Dialog for the arbitrary-range case. This
 * is that wrapper: a chip-shaped trigger opens a bottom-sheet/centered Dialog holding
 * the two native `<input type="date">`s (testids pay-filter-from / pay-filter-to
 * preserved). Applying is a plain GET form navigation to /money?tab=payments so the
 * server view re-reads from the URL exactly as before; the current method is carried
 * as a hidden input so a custom range never drops the method filter.
 */
import { useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog } from '@/components/ui/dialog'

type Props = {
  locale: string
  from?: string
  to?: string
  method?: string
  labels: { trigger: string; title: string; from: string; to: string; apply: string; clear: string }
}

export function PaymentsRangeDialog({ locale, from, to, method, labels }: Props) {
  const [open, setOpen] = useState(false)
  const active = !!(from || to)
  const clearHref = `/${locale}/money?tab=payments${method ? `&method=${method}` : ''}`

  return (
    <>
      <button
        type="button"
        data-testid="pay-range-custom"
        data-active={active || undefined}
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex min-h-[36px] items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--shell-accent)]',
          active
            ? 'border-primary-700 bg-primary-700 text-primary-foreground'
            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
        )}
      >
        <CalendarRange className="h-3.5 w-3.5" /> {labels.trigger}
      </button>

      <Dialog open={open} onOpenChange={setOpen} variant="responsive" title={labels.title} data-testid="pay-range-dialog">
        <form method="get" action={`/${locale}/money`} className="space-y-4">
          <input type="hidden" name="tab" value="payments" />
          {method && <input type="hidden" name="method" value={method} />}
          <div className="space-y-1">
            <label htmlFor="pay-range-from" className="block text-xs text-muted-foreground">{labels.from}</label>
            <input id="pay-range-from" type="date" name="from" defaultValue={from ?? ''} data-testid="pay-filter-from"
              className="h-10 w-full rounded-md border px-3 text-sm" />
          </div>
          <div className="space-y-1">
            <label htmlFor="pay-range-to" className="block text-xs text-muted-foreground">{labels.to}</label>
            <input id="pay-range-to" type="date" name="to" defaultValue={to ?? ''} data-testid="pay-filter-to"
              className="h-10 w-full rounded-md border px-3 text-sm" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" data-testid="pay-range-apply"
              className="h-10 flex-1 rounded-md bg-primary-700 px-4 text-sm font-medium text-primary-foreground hover:bg-primary-800">
              {labels.apply}
            </button>
            <a href={clearHref} data-testid="pay-range-clear"
              className="h-10 rounded-md border px-4 text-sm leading-10 hover:bg-muted">
              {labels.clear}
            </a>
          </div>
        </form>
      </Dialog>
    </>
  )
}
