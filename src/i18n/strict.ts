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
 * WHY A SENTINEL AND NOT A THROW. §2.7 specifies "onError throws in CI/e2e
 * builds". It was implemented that way first and the evidence argued against it:
 * in run 29708539112 a throwing handler turned a single missing key into a 500 on
 * the landing route, so `npm run start` never satisfied Playwright's readiness
 * probe and the ENTIRE union gate died on `Timed out waiting for config.webServer`
 * — zero tests ran, and the log carried only a minified digest, not the key. A
 * gate whose failure mode is "the suite cannot start, and will not tell you why"
 * is a gate that gets switched off. The sentinel keeps the app up, keeps every
 * other test meaningful, and names the offender. Same intent, better failure mode.
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
