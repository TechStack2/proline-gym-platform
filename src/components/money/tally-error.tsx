import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * MONEY-TALLY — the cash drawer could not be read.
 *
 * This exists so the failure is impossible to mistake for a quiet day. The two
 * facts a gym owner needs are different facts: "nobody has paid yet today" is
 * information, and "we could not find out what was collected" is a warning that
 * the number on screen must not be trusted or acted on.
 *
 * Why NOT the §2 primitives, deliberately:
 *  · EmptyState encodes the calm-zero doctrine (neutral ink, no alarm hue, no CTA
 *    because a zero is not an action). Rendering a failed read through it would
 *    make the failure look exactly like the zero it must be distinguished from —
 *    the whole defect this slice fixes.
 *  · StatusChip labels a DOMAIN status from the status vocabulary (an invoice is
 *    overdue, a request is pending). A read failure is not a domain status and has
 *    no vocabulary entry; forcing one would put a fake status into that namespace.
 * So: a purpose-built inline warning with a real next action (retry), which is the
 * one case where a CTA is warranted.
 */
export function TallyError({
  message,
  retryLabel,
  retryHref,
  testid,
  className,
}: {
  message: string
  retryLabel: string
  retryHref: string
  testid: string
  className?: string
}) {
  return (
    <div
      data-testid={testid}
      role="alert"
      className={cn(
        'flex w-full items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800',
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{message}</span>
      <Link
        href={retryHref}
        data-testid={`${testid}-retry`}
        className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline"
      >
        {retryLabel}
      </Link>
    </div>
  )
}
