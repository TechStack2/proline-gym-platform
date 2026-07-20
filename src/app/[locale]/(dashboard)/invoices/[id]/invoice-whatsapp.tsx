'use client'

/**
 * WA-INVOICE — the invoice-detail WhatsApp panel. Two actions on a due invoice:
 * "Send invoice" and (softer) "Send reminder". Each is a wa.me deep link (opens the
 * staff member's own WhatsApp in a new tab) whose onClick ALSO records the handoff
 * (R3) so the trace below reads "Invoice: sent 2× · last …". No delivery is claimed
 * — the disclaimer says we log the handoff, not receipt.
 *
 * When the recipient has no phone on file the buttons are replaced by guidance
 * (never a dead button). Owner+reception gating is done by the server page; this
 * component only renders when allowed.
 */
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { MessageCircle, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { waLink } from '@/lib/whatsapp/link'
import { logInvoiceWhatsApp } from './whatsapp-actions'

type Props = {
  invoiceId: string
  phone: string | null
  dueMessage: string
  reminderMessage: string
  title: string
  sendInvoiceLabel: string
  sendReminderLabel: string
  disclaimer: string
  noPhone: string
  traceInvoice: string
  traceReminder: string
  traceNone: string
}

export function InvoiceWhatsApp(props: Props) {
  const { invoiceId, phone, dueMessage, reminderMessage } = props
  const router = useRouter()
  const [, startTransition] = useTransition()

  const log = (kind: 'invoice_due' | 'invoice_reminder') => {
    // Fire-and-refresh: the anchor's default action still opens WhatsApp; this just
    // records the handoff and refreshes the trace. Never preventDefault.
    startTransition(async () => {
      await logInvoiceWhatsApp(invoiceId, kind)
      router.refresh()
    })
  }

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm" data-testid="invoice-wa">
      <h2 className="mb-3 text-sm font-semibold">{props.title}</h2>

      {!phone ? (
        <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground" data-testid="invoice-wa-nophone">
          {props.noPhone}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <a
              href={waLink(phone, dueMessage)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => log('invoice_due')}
              data-testid="invoice-wa-send"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl border border-whatsapp/40 px-3 py-2 text-sm font-medium text-whatsapp-deep hover:bg-whatsapp/10',
              )}
            >
              <Send className="h-4 w-4" /> {props.sendInvoiceLabel}
            </a>
            <a
              href={waLink(phone, reminderMessage)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => log('invoice_reminder')}
              data-testid="invoice-wa-remind"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted',
              )}
            >
              <MessageCircle className="h-4 w-4" /> {props.sendReminderLabel}
            </a>
          </div>

          <div className="mt-3 space-y-0.5 text-xs text-muted-foreground" data-testid="invoice-wa-trace">
            {props.traceInvoice || props.traceReminder ? (
              <>
                {props.traceInvoice && <p data-testid="invoice-wa-trace-invoice">{props.traceInvoice}</p>}
                {props.traceReminder && <p data-testid="invoice-wa-trace-reminder">{props.traceReminder}</p>}
              </>
            ) : (
              <p data-testid="invoice-wa-trace-none">{props.traceNone}</p>
            )}
          </div>

          <p className="mt-2 text-[11px] text-muted-foreground" data-testid="invoice-wa-disclaimer">{props.disclaimer}</p>
        </>
      )}
    </section>
  )
}
