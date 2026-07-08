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
 * Server boundary: a raw error → a stable key OR a passed-through curated message.
 * Always logs the raw error first. SQLSTATE 23505/23503/42501 → a friendly key; a
 * PL/pgSQL RAISE (SQLSTATE P0001) → its message verbatim (our own user-facing domain
 * copy — see the P0001 note below); everything else unmapped → 'generic'. Accepts
 * `unknown` so every catch/`{ error }` shape works. Returns `string` (a key or the
 * passthrough prose); callers store it in `error: string`.
 */
export function actionError(error: unknown): string {
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
  // P0001 = a PL/pgSQL RAISE EXCEPTION — our OWN curated, user-facing domain message
  // ("Slot taken — pick another time", "Camp is full", "Assignment has no remaining
  // credits"). It is NOT SQLSTATE/constraint jargon, and both the UI and the e2e gate
  // rely on the exact wording, so pass it through verbatim. (RAISE prose we DO map —
  // overpayment/forbidden above — keeps its friendly key; localizing the rest is a
  // separate effort.) This is the fix for the ERROR-COPY regression that flattened
  // every RAISE — slot-taken / camp-full / exhausted-credits — to 'generic'.
  if (e.code === 'P0001' && msg) return msg;
  return 'generic';
}

/**
 * Client boundary: translate a stable action-error key via the `errors` namespace,
 * with a safe generic fallback for ANY key not in it. `t` = useTranslations('errors').
 * Clients pass `res.error` straight in — they never interpolate the raw string.
 */
export function errorText(t: (key: string) => string, key: string | null | undefined): string {
  if (!key) return t('generic');
  if (ERROR_KEY_SET.has(key)) return t(key);
  // A P0001 domain message passed through by actionError (curated prose, e.g. "Slot
  // taken — pick another time") — show it as-is. Prose has whitespace/uppercase; an
  // unknown snake_case key does NOT, so a stray key still collapses to 'generic' and
  // never renders raw. actionError never emits a raw SQLSTATE string here.
  if (/[\sA-Z]/.test(key)) return key;
  return t('generic');
}
