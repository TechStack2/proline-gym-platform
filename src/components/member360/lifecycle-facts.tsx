import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * MEMBER-360-ACTIONABLE §3.3 — the ONE lifecycle fact grid every product card
 * wears: origin · window · money-next · money-last (PT variant: sold · valid ·
 * invoice · next session). Staff eyes learn one scan pattern.
 *
 * §2.1 drillability: a fact with an `href` is a doorway (press state + focus
 * ring per §2.8 — facts drill, they don't dead-end at a label); a fact without
 * one is a terminal fact.
 */
export type LifecycleFact = {
  key: string
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  /** where this fact drills (§2.1) — omit only for terminal facts */
  href?: string
  testid?: string
  tone?: 'warning' | 'danger'
}

export function LifecycleFacts({ facts, testid }: { facts: LifecycleFact[]; testid?: string }) {
  return (
    <div
      data-testid={testid ?? 'lifecycle-facts'}
      className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-gray-100 sm:grid-cols-4"
    >
      {facts.map((f) => {
        const body = (
          <>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">{f.label}</p>
            <p
              className={cn(
                'mt-0.5 truncate text-xs font-semibold text-gray-800',
                f.tone === 'warning' && 'text-warning-600',
                f.tone === 'danger' && 'text-danger-600',
              )}
            >
              {f.value}
              {f.sub != null && <span className="ms-1 font-normal text-gray-400">{f.sub}</span>}
            </p>
          </>
        )
        return f.href ? (
          <Link
            key={f.key}
            href={f.href}
            data-testid={f.testid ?? `fact-${f.key}`}
            className="block bg-white px-2.5 py-1.5 transition-colors hover:bg-gray-50 active:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--shell-accent)]"
          >
            {body}
          </Link>
        ) : (
          <div key={f.key} data-testid={f.testid ?? `fact-${f.key}`} className="bg-white px-2.5 py-1.5">
            {body}
          </div>
        )
      })}
    </div>
  )
}
