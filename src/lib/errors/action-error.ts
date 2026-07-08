/**
 * ERROR-COPY — the error boundary between raw DB/RPC failures and the user.
 *
 * Server actions map a raw Supabase/Postgres error to a STABLE KEY (never Postgres
 * prose, constraint names, or SQLSTATE) with `actionError()`; clients translate the
 * key with `errorText()` + the `errors` i18n namespace. A receptionist never sees
 * "42501" or a constraint name again. The RAW error is always `console.error`'d
 * server-side first — the operator trail until OBSERVE (Sentry) lands.
 *
 * OUT OF SCOPE (kept on their own paths): the app-level stable keys a few actions
 * return DIRECTLY ('coach_required', 'assignment_not_found' — pt/actions) which are
 * special-cased + translated at pt-client/inbox; and the run()-wrapped managers that
 * already show common.genericError. This module never touches those.
 */

/** The stable keys the `errors.*` namespace resolves. Anything else → 'generic'. */
export const ERROR_KEYS = ['generic', 'duplicate', 'in_use', 'not_allowed', 'overpayment'] as const;
export type ErrorKey = (typeof ERROR_KEYS)[number];

const ERROR_KEY_SET: ReadonlySet<string> = new Set(ERROR_KEYS);

// The one snake_case token Postgres actually RAISEs (000055 g1 whatsapp) → not_allowed.
const EXACT_MESSAGE: Readonly<Record<string, ErrorKey>> = { forbidden: 'not_allowed' };

// A couple of user-facing RAISE prose we keep SPECIFIC (else they'd flatten to generic).
// The overpayment guard's exact copy is asserted downstream (billing pay-error).
const MESSAGE_INCLUDES: ReadonlyArray<readonly [string, ErrorKey]> = [
  ['overpayment', 'overpayment'],
  ['exceeds the invoice balance', 'overpayment'],
];

/**
 * Server boundary: a raw error → a stable ErrorKey. Always logs the raw error first.
 * Mapped by SQLSTATE where possible; RAISE prose maps to 'generic' unless it's one of
 * our own known messages. Accepts `unknown` so every catch/`{ error }` shape works.
 */
export function actionError(error: unknown): ErrorKey {
  // Operator trail: the raw error stays SERVER-SIDE only, never returned to the client.
  console.error('[action-error]', error);
  const e = (error ?? {}) as { code?: string; message?: string };
  switch (e.code) {
    case '23505':
      return 'duplicate'; // unique_violation
    case '23503':
      return 'in_use'; // foreign_key_violation — the row is still referenced
    case '42501':
      return 'not_allowed'; // insufficient_privilege (RLS)
  }
  const msg = (e.message ?? '').trim();
  // Passthrough: a stable key re-thrown client-side via `new Error(actionErrorKey)`
  // (the throw+catch idiom) is already mapped — keep it instead of flattening to generic.
  if (ERROR_KEY_SET.has(msg)) return msg as ErrorKey;
  if (msg in EXACT_MESSAGE) return EXACT_MESSAGE[msg];
  for (const [needle, key] of MESSAGE_INCLUDES) {
    if (msg.includes(needle)) return key;
  }
  return 'generic';
}

/**
 * Client boundary: translate a stable action-error key via the `errors` namespace,
 * with a safe generic fallback for ANY key not in it. `t` = useTranslations('errors').
 * Clients pass `res.error` straight in — they never interpolate the raw string.
 */
export function errorText(t: (key: string) => string, key: string | null | undefined): string {
  return t(key && ERROR_KEY_SET.has(key) ? key : 'generic');
}
