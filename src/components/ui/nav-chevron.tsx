import { ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * §2.7 (DA-56 decree, W4) — trailing row affordances:
 *   · a row that NAVIGATES to another surface on tap wears <NavChevron>;
 *   · a row that EXPANDS in place wears <DisclosureChevron> (rotates open);
 *   · a static row wears neither.
 * ExternalLink is reserved for genuinely external targets (new origin/tab).
 *
 * NavChevron flips in RTL (forward points INTO the reading direction); the
 * disclosure chevron rotates via `group-open:` — give the owning <details> the
 * `group` class.
 */
export function NavChevron({ className }: { className?: string }) {
  return (
    <ChevronRight
      aria-hidden="true"
      className={cn('h-4 w-4 shrink-0 text-gray-400 rtl:rotate-180', className)}
    />
  )
}

export function DisclosureChevron({ className }: { className?: string }) {
  return (
    <ChevronDown
      aria-hidden="true"
      className={cn('h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180', className)}
    />
  )
}
