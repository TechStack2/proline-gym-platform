'use client'

/**
 * §2.6 (DA-33, W4) — the searchable-Dialog filter for LONG enumerable lists.
 *
 * The chip doctrine (W3a/W3b) covers sets of ≤ ~8: apply-on-tap chips,
 * tap-active-clears. Longer lists (a gym's belt ladder, a big class catalog)
 * get THIS: a chip-styled trigger showing the current selection, opening a
 * §2.5 Dialog with a search field + apply-on-tap option rows. Tapping the
 * active option clears it — the same tap-active-clears contract as the chips,
 * and the "clear" row wears the caller's "All …" label so clearing reads as a
 * selection, not an escape hatch.
 */
import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type FilterOption = { id: string; label: string }

export function SearchableFilterDialog({
  label, value, options, onSelect, searchPlaceholder, clearLabel, testid,
}: {
  /** The filter's name — trigger fallback text and the Dialog title. */
  label: string
  /** Currently-applied option id ('' = unfiltered). */
  value: string
  options: FilterOption[]
  /** Called with the picked id ('' to clear). The caller applies it — same URL mechanics as the chips. */
  onSelect: (id: string) => void
  searchPlaceholder: string
  /** The "All …" row that clears the filter. */
  clearLabel: string
  testid: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const active = options.find((o) => o.id === value)
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return options
    return options.filter((o) => o.label.toLowerCase().includes(needle))
  }, [options, q])

  const pick = (id: string) => {
    onSelect(id === value ? '' : id)
    setOpen(false)
    setQ('')
  }

  return (
    <>
      <button
        type="button"
        data-testid={testid}
        data-active={!!active}
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--shell-accent)]',
          active
            ? 'border-primary-700 bg-primary-700 text-primary-foreground'
            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
        )}
      >
        {active ? active.label : label}
      </button>

      <Dialog open={open} onOpenChange={setOpen} title={label} variant="responsive" data-testid={`${testid}-dialog`}>
        <input
          type="search"
          autoFocus
          data-testid={`${testid}-search`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          className="mb-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--shell-accent)]"
        />
        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          <button
            type="button"
            data-testid={`${testid}-clear`}
            onClick={() => pick('')}
            className={cn(
              'flex min-h-[44px] w-full items-center justify-between rounded-lg px-3 py-2 text-start text-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--shell-accent)]',
              !value ? 'tint-brand font-semibold' : 'text-gray-700 hover:bg-gray-50',
            )}
          >
            <span className="truncate">{clearLabel}</span>
            {!value && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
          </button>
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              data-testid={`${testid}-option`}
              data-id={o.id}
              data-active={o.id === value}
              onClick={() => pick(o.id)}
              className={cn(
                'flex min-h-[44px] w-full items-center justify-between rounded-lg px-3 py-2 text-start text-sm',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--shell-accent)]',
                o.id === value ? 'tint-brand font-semibold' : 'text-gray-700 hover:bg-gray-50',
              )}
            >
              <span className="truncate">{o.label}</span>
              {o.id === value && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </Dialog>
    </>
  )
}
