/**
 * DS2-FMT §2.7 — the missing-key CI gate (runtime half).
 *
 * DA-5 shipped `MISSING_MESSAGE: pt.unlinked_sessions` to production: it threw on
 * every coach/pt load and printed the raw key above the sessions list. next-intl's
 * default is to log and render the key path — survivable in dev, invisible in a
 * screenshot review, embarrassing in front of a member.
 *
 * When `NEXT_PUBLIC_I18N_STRICT=1` (set for the CI e2e build), a missing message
 * throws instead, so the run fails on the key rather than on someone noticing.
 * The flag is `NEXT_PUBLIC_` because the same switch has to reach the client
 * bundle — a missing key in a client component must fail the same way.
 *
 * Only MISSING_MESSAGE throws. next-intl routes several benign conditions through
 * the same channel (environment fallbacks, insufficient paths); escalating those
 * would turn the gate into noise.
 */
export const I18N_STRICT = process.env.NEXT_PUBLIC_I18N_STRICT === '1';

type IntlError = Error & { code?: string };

/** Rethrow a missing message; leave every other next-intl error to the default. */
export function throwOnMissingMessage(error: IntlError): void {
  if (error.code === 'MISSING_MESSAGE') throw error;
  console.error(error);
}
