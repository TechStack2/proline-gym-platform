/**
 * DS 2.0 §2.2 — the tab-bar capacity law, in a pure module so it can be asserted
 * by a unit test as well as at render time.
 *
 * DA-3 measured what happens without it: the portal ships 7 flat tabs and the
 * coach 6, which truncate their Arabic labels at 390 and drop each target below a
 * comfortable thumb width. Five — including More — is the ceiling; anything that
 * does not fit belongs in the More sheet.
 */

/** ≤5 items INCLUDING the More entry. */
export const TAB_BAR_CAPACITY = 5;

export class TabCapacityError extends Error {
  constructor(shell: string, keys: readonly string[]) {
    super(
      `TabBar capacity exceeded for the "${shell}" shell: ${keys.length} tabs ` +
        `(${keys.join(', ')}) — the limit is ${TAB_BAR_CAPACITY} including "more". ` +
        `Fold the overflow into the More sheet (DS 2.0 §2.2/§3).`,
    );
    this.name = 'TabCapacityError';
  }
}

/**
 * Throw when a tab config exceeds capacity. Called from the config builder, so a
 * shell that grows a sixth tab fails the build/render that introduced it rather
 * than silently shipping a squeezed bar.
 */
export function assertTabCapacity(
  tabs: readonly { key: string }[],
  shell: string,
): void {
  if (tabs.length > TAB_BAR_CAPACITY) {
    throw new TabCapacityError(
      shell,
      tabs.map((t) => t.key),
    );
  }
}
