'use client'

/**
 * G1 wa.me share button (the day-1 bridge). A link that opens the staff member's
 * own WhatsApp with a prefilled localized message — no backend, no credentials.
 * Docked on chase/renewal (Today), win-back, invoice/receipt and lead-reply rows.
 * Renders nothing without a phone. design-system styled (WhatsApp green).
 */
import { MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { waLink } from '@/lib/whatsapp/link'

export function WhatsAppShare({
  phone, message, label, testid = 'wa-share', variant = 'chip', countryCode,
}: {
  phone: string | null | undefined
  message: string
  label: string
  testid?: string
  variant?: 'chip' | 'button'
  countryCode?: string
}) {
  const href = waLink(phone, message, countryCode)
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testid}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 font-medium text-[#075E54] hover:bg-[#25D366]/10',
        variant === 'chip'
          ? 'rounded-full bg-[#25D366]/10 px-2.5 py-1 text-xs'
          : 'rounded-xl border border-[#25D366]/40 px-3 py-2 text-sm',
      )}
    >
      <MessageCircle className="h-3.5 w-3.5" /> {label}
    </a>
  )
}
