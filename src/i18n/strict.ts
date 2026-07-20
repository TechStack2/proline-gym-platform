/**
 * DS2-FMT §2.7 — the missing-key CI gate (runtime half).
 *
 * DA-5 shipped `MISSING_MESSAGE: pt.unlinked_sessions` to production, where it
 * threw on every coach/pt load and printed the raw key above the sessions list.
 * next-intl's default is to log and render the bare key PATH — survivable in dev,
 * invisible in a screenshot review, embarrassing in front of a member. Worse, the
 * key path ("pt.unlinked_sessions") looks enough like copy that it reads as a
 * label, so nothing in the suite noticed.
 *
 * When `NEXT_PUBLIC_I18N_STRICT=1` (set for the CI e2e build), a missing message
 * renders a loud, greppable sentinel instead: `MISSING_MESSAGE:<key>`. That fails
 * the run through the `not.toContainText('MISSING_MESSAGE')` assertions the suite
 * already makes on eight surfaces, plus the explicit sweep in
 * e2e/w1-foundation.spec.ts — and the failure names the exact key.
 *
 * ⚠ DEVIATION FROM §2.7's LETTER — needs Lane A / owner ratification.
 * The spec says "onError throws in CI/e2e builds". This ships a sentinel instead.
 * The reasoning is about failure MODE, not intent (both make DA-5 impossible to
 * ship):
 *   · throw    → the page 500s. Under `npm run start` the very first missing key
 *                also fails Playwright's webServer readiness probe, so the union
 *                gate dies before a single test runs and the production build
 *                reports a minified `digest`, not the key. One gate signal, zero
 *                test signal, and nothing that says which key.
 *   · sentinel → the app renders. The offending key is in the DOM, so the sweep
 *                in e2e/w1-foundation names locale + path + key, the eight specs
 *                that already assert `not.toContainText('MISSING_MESSAGE')` fire
 *                too, and every OTHER test still produces its result.
 * (Full disclosure: runs 29708539112 and 29723649891 died on exactly that
 * webServer timeout while the throwing version was in place, and this file
 * originally cited them as proof. That attribution was WRONG — the real cause was
 * StrictIntlProvider not forwarding `locale`. The argument above stands on its own
 * merits; the runs are not evidence for it.)
 *
 * Only MISSING_MESSAGE is escalated. next-intl routes several benign conditions
 * through the same channel (environment fallbacks, insufficient paths); promoting
 * those would turn the gate into noise.
 */
export const I18N_STRICT = process.env.NEXT_PUBLIC_I18N_STRICT === '1';

/** The string every missing-key assertion greps for. */
export const MISSING_MESSAGE_SENTINEL = 'MISSING_MESSAGE';

type IntlError = Error & { code?: string };

/** Log every next-intl error; missing keys get an unmissable prefix. */
export function reportIntlError(error: IntlError): void {
  if (error.code === 'MISSING_MESSAGE') {
    console.error(`[i18n-gate] ${MISSING_MESSAGE_SENTINEL} ${error.message}`);
    return;
  }
  console.error(error);
}

/**
 * What renders in place of a missing message. Returns the sentinel plus the key
 * so a failing assertion identifies the surface AND the key in one line.
 */
export function strictMessageFallback({
  key,
  namespace,
}: {
  key: string;
  namespace?: string;
}): string {
  return `${MISSING_MESSAGE_SENTINEL}:${namespace ? `${namespace}.${key}` : key}`;
}
