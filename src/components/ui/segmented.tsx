import { cn } from '@/lib/utils';

/**
 * DS 2.0 §2 (W3b, DA-19/26) — THE segmented-control recipe.
 *
 * Four competing in-page tab styles coexisted on staff (Reports underline,
 * Members white pills, Money icon pills, Schedule bordered toggles) and the
 * shared active state ('bg-white … shadow-sm') inverted perception in dark:
 * `--c-white` flips to the darkest ground, so the SELECTED pill rendered dimmer
 * than its unselected neighbours (DA-26). One tray + one item recipe fixes both:
 * light is byte-identical (white pill on gray-50 tray), dark lifts the active
 * pill two steps above the tray (`dark:bg-gray-200` — the inverted ramp makes
 * that the elevated surface) instead of sinking it.
 *
 * Deliberately CLASS EXPORTS, not a component: every call site keeps its own
 * element (Link vs button), its own testids and its own aria — only the visual
 * recipe converges.
 */
export const segmentedTrayCls =
  'flex max-w-full gap-0 overflow-x-auto rounded-xl border bg-gray-50 p-1 [&>*]:shrink-0';

export function segmentedItemCls(active: boolean, className?: string): string {
  return cn(
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
    active
      ? 'bg-white text-primary-700 shadow-sm dark:bg-gray-200'
      : 'text-gray-500 hover:text-gray-800',
    className,
  );
}
