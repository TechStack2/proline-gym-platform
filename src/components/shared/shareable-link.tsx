'use client'

/**
 * J1 SETUP-HUB — a small, reusable "copy this link" affordance: a monospace URL,
 * a copy button (the inline navigator.clipboard idiom shared with InviteButton /
 * CampaignCard — no shared hook exists), and an OPTIONAL WhatsApp *broadcast*
 * share (`wa.me/?text=…`, no recipient — distinct from the phone-targeted
 * waLink helper). The absolute URL is built CLIENT-SIDE from the real request
 * origin (`window.location.origin`) so it reflects the current host, then a
 * caller-supplied path (already locale-prefixed). All labels are props so the
 * i18n'd hub and the English-only vendor tool can both reuse it.
 */
import { useState, useEffect } from 'react'
import { Copy, Check, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ShareableLink({
  path,
  origin: originProp,
  label,
  copyLabel,
  copiedLabel,
  shareMessage,
  shareLabel,
  testid = 'share-link',
}: {
  /** Locale-prefixed path (e.g. `/en?gym=slug`); origin is prepended. */
  path: string
  /**
   * INVITE-HOST: the gym's CANONICAL origin (from gymCanonicalOrigin), resolved
   * server-side and passed in so the shared link lands on the gym's own host.
   * When omitted, falls back to the current request origin (window.location).
   */
  origin?: string
  label: string
  copyLabel: string
  copiedLabel: string
  /** When set, renders a wa.me broadcast button whose text is `${shareMessage} ${url}`. */
  shareMessage?: string
  shareLabel?: string
  testid?: string
}) {
  const [runtimeOrigin, setRuntimeOrigin] = useState('')
  const [copied, setCopied] = useState(false)
  // SSR-safe origin read (campaigns-client pattern) — avoids a hydration mismatch.
  // Skipped when a canonical origin is supplied (server-resolved, authoritative).
  useEffect(() => {
    if (!originProp) setRuntimeOrigin(window.location.origin)
  }, [originProp])

  const origin = originProp || runtimeOrigin
  const url = origin ? `${origin}${path}` : path

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* noop */
    }
  }

  const waHref = shareMessage
    ? `https://wa.me/?text=${encodeURIComponent(`${shareMessage} ${url}`)}`
    : null

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <p className="mb-1 text-2xs font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <div className="flex items-center gap-2">
        <code
          data-testid={`${testid}-url`}
          dir="ltr"
          className="block flex-1 truncate rounded-lg bg-white px-2 py-1 text-xs text-gray-700"
        >
          {url}
        </code>
        <button
          type="button"
          data-testid={`${testid}-copy`}
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      {waHref && (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={`${testid}-wa`}
          className={cn(
            'mt-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5',
            'text-xs font-semibold text-primary-foreground transition-colors hover:bg-[#1ebe5b]',
          )}
        >
          <MessageCircle className="h-3.5 w-3.5" /> {shareLabel}
        </a>
      )}
    </div>
  )
}
