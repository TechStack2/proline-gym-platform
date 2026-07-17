'use client'

/**
 * WA-INVOICE — compact per-row WhatsApp actions on the outstanding list. Same two
 * handoffs as the detail panel ("Send invoice" / "Send reminder"), rendered as small
 * chips; the full trace + disclaimer live on the invoice detail. Renders nothing when
 * the recipient has no phone (never a dead button — the detail page explains what's
 * missing). Reuses the shared log action so the honesty trail is identical.
 */
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Send, MessageCircle } from 'lucide-react'
import { waLink } from '@/lib/whatsapp/link'
import { logInvoiceWhatsApp } from './[id]/whatsapp-actions'

type Props = {
  invoiceId: string
  phone: string | null
  dueMessage: string
  reminderMessage: string
  sendLabel: string
  remindLabel: string
}

export function InvoiceRowWa({ invoiceId, phone, dueMessage, reminderMessage, sendLabel, remindLabel }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  if (!phone) return null

  const log = (kind: 'invoice_due' | 'invoice_reminder') =>
    startTransition(async () => {
      await logInvoiceWhatsApp(invoiceId, kind)
      router.refresh()
    })

  return (
    <span className="mt-1 flex flex-wrap gap-1.5" data-testid="invoice-row-wa">
      <a href={waLink(phone, dueMessage)} target="_blank" rel="noopener noreferrer"
        onClick={() => log('invoice_due')} data-testid="invoice-row-wa-send" title={sendLabel}
        className="inline-flex items-center gap-1 rounded-full bg-[#25D366]/10 px-2 py-0.5 text-[11px] font-medium text-[#075E54] hover:bg-[#25D366]/20">
        <Send className="h-3 w-3" /> {sendLabel}
      </a>
      <a href={waLink(phone, reminderMessage)} target="_blank" rel="noopener noreferrer"
        onClick={() => log('invoice_reminder')} data-testid="invoice-row-wa-remind" title={remindLabel}
        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted">
        <MessageCircle className="h-3 w-3" /> {remindLabel}
      </a>
    </span>
  )
}
