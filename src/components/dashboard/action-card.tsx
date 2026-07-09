import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

/**
 * ActionCard (FD-1) — the Today 2.0 card framework. Today is not a dashboard of
 * charts; every card is "a number · drill-down rows · a one-tap action", and a
 * card with nothing to say collapses to a single "✓ none today" line so a quiet
 * day is a short page.
 *
 * DOCKING CONTRACT (how future slices add a card, ~20 lines in today/page.tsx):
 *   1. fetch the card's rows (gym-scoped, server-side);
 *   2. render <ActionCard icon title count emptyText testid> with one
 *      <ActionRow href action> per item (+ optional footer);
 *   3. insert it at its priority position in the stack.
 * Known docks: PT-1 refill nudge (after the PT card) · ML-1 renewals action on
 * the expiring card · ML-1 dunning card (after Money).
 */
export function ActionCard({
  icon: Icon, title, count, badge, emptyText, emptyHref, testid, isRTL, footer, children,
}: {
  icon: any
  title: string
  /** Drives collapse: 0 ⇒ the single ✓ line. */
  count: number
  /** Headline next to the title; defaults to `count`. */
  badge?: string
  emptyText: string
  /**
   * DRILL-360: when set, the zero-state "✓ none" line becomes a drill link to the
   * owning surface, so a quiet card is never a dead-end — every 360 card exposes a
   * drill even at count 0 (e.g. conversion → /leads). Omit to keep a plain line.
   */
  emptyHref?: string
  testid: string
  isRTL: boolean
  footer?: React.ReactNode
  children?: React.ReactNode
}) {
  if (count === 0 && !footer) {
    const body = (
      <>
        <Check className="h-4 w-4 text-green-500" />
        <span className={cn(isRTL && 'font-arabic')}>{title} — {emptyText}</span>
      </>
    )
    return emptyHref ? (
      <Link
        href={emptyHref}
        data-testid={`card-empty-${testid}`}
        className="flex items-center gap-2 rounded-2xl border bg-white px-5 py-3.5 text-sm text-gray-400 shadow-elevation-1 transition-colors hover:bg-gray-50"
      >
        {body}
      </Link>
    ) : (
      <p
        data-testid={`card-empty-${testid}`}
        className="flex items-center gap-2 rounded-2xl border bg-white px-5 py-3.5 text-sm text-gray-400 shadow-elevation-1"
      >
        {body}
      </p>
    )
  }
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-elevation-1" data-testid={`card-${testid}`} data-count={count}>
      <h2 className={cn('mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
        <Icon className="h-4 w-4 text-primary-600" /> {title}
        <span
          data-testid={`card-count-${testid}`}
          className={cn('rounded-full px-2 py-0.5 text-xs font-bold',
            count > 0 ? 'bg-[#cd1419] text-primary-foreground' : 'bg-gray-100 text-gray-500')}
        >
          {badge ?? count}
        </span>
      </h2>
      {count === 0 ? (
        emptyHref ? (
          <Link href={emptyHref} data-testid={`card-empty-${testid}`}
            className="flex items-center gap-2 py-1 text-sm text-gray-400 transition-colors hover:text-gray-600">
            <Check className="h-4 w-4 text-green-500" /> {emptyText}
          </Link>
        ) : (
          <p data-testid={`card-empty-${testid}`} className="flex items-center gap-2 py-1 text-sm text-gray-400">
            <Check className="h-4 w-4 text-green-500" /> {emptyText}
          </p>
        )
      ) : (
        <div className="space-y-2">{children}</div>
      )}
      {footer}
    </section>
  )
}

/**
 * One drill-down row: the body is the drill link, `action` is the one-tap
 * action rendered beside it (a Link/anchor — NOT nested inside the drill link).
 */
export function ActionRow({
  href, testid, action, children,
}: {
  href: string
  testid?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      data-testid={testid}
      className="flex items-center justify-between gap-3 rounded-xl border bg-gray-50/60 px-3 py-2.5 transition-colors hover:bg-gray-50"
    >
      <Link href={href} className="min-w-0 flex-1">{children}</Link>
      {action}
    </div>
  )
}
