import { Ellipsis, type LucideIcon } from 'lucide-react'
import { assertTabCapacity } from './tab-capacity'

/**
 * DS 2.0 §4.4 — ONE nav source of truth per shell.
 *
 * Each shell declares a single ordered entry array; entries flagged
 * `mobilePrimary` become the mobile bottom tabs (≤4 + More), ALL entries become
 * the desktop rail. The mobile More-sheet lists exactly the non-primary entries
 * plus the utility row. An entry can therefore never exist in one form factor
 * and not the other — the drift class the audit found on the staff shell is
 * structurally unwritable here.
 */
export type ShellNavEntry = {
  key: string
  icon: LucideIcon
  /** Route path WITHOUT the locale prefix. */
  path: string
  /** Mobile bottom-bar membership (§3 ruling picks each shell's four). */
  mobilePrimary?: boolean
  badge?: number
  /**
   * Optional testid for the rail badge (testid-stability: the staff Inbox badge
   * has always been `inbox-badge` and ia-nav asserts it — the badge keeps its
   * name when the carrier chrome changes).
   */
  badgeTestId?: string
}

export type ShellNavSplit = {
  /** Mobile bottom bar: the primary entries + the `#more` trigger. */
  tabs: ShellNavEntry[]
  /** The folded entries — exactly what the More sheet lists (§4.4). */
  moreItems: ShellNavEntry[]
  /** Desktop rail: EVERY entry, in declared order (§4.1). */
  railItems: ShellNavEntry[]
}

export function splitShellNav(
  entries: readonly ShellNavEntry[],
  shell: string,
): ShellNavSplit {
  const primaries = entries.filter((e) => e.mobilePrimary)
  const tabs: ShellNavEntry[] = [
    ...primaries,
    { key: 'more', icon: Ellipsis, path: '#more' },
  ]
  // §2.2 capacity law: ≤5 INCLUDING More — asserted at the source, so a config
  // that grows a fifth primary fails the build that introduced it.
  assertTabCapacity(tabs, shell)
  return {
    tabs,
    moreItems: entries.filter((e) => !e.mobilePrimary),
    railItems: [...entries],
  }
}
