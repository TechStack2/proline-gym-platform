/**
 * AUTH-STUCK — client-side transport guards for the auth mint sites.
 *
 * Field failure (prod, 2026-07-20): a network drop mid sign-in made the server-
 * action await REJECT; the exception escaped the submit handler, setLoading(false)
 * never ran, and the button spun forever with no message. These helpers make that
 * class of failure impossible to hide:
 *
 *   · withAuthTimeout — bounds any auth call so a hung request FAILS VISIBLY.
 *     15s: healthy prod round-trips are <1s (GoTrue + action both measured), so
 *     15s is generous for a slow mobile link yet short enough that a user is
 *     never staring at an unexplained spinner for long.
 *   · isTransportError — classifies "the network failed" (fetch TypeError, GoTrue
 *     AuthRetryableFetchError, our timeout) apart from "the server answered".
 *     A transport error carries NO account signal, so surfacing it distinctly
 *     adds a third state without weakening the anti-enumeration posture.
 */

export const AUTH_ACTION_TIMEOUT_MS = 15_000

export class AuthTimeoutError extends Error {
  constructor() {
    super('auth action timed out')
    this.name = 'AuthTimeoutError'
  }
}

/** Race a promise against the auth timeout; rejects with AuthTimeoutError. */
export function withAuthTimeout<T>(p: Promise<T>, ms: number = AUTH_ACTION_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AuthTimeoutError()), ms)
    p.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

/**
 * True when the failure is the TRANSPORT (offline, DNS, aborted, timed out) —
 * i.e. the request never got a server answer. Accepts thrown values AND
 * supabase-js error objects (which wrap network failures instead of throwing).
 */
export function isTransportError(e: unknown): boolean {
  if (!e) return false
  if (e instanceof AuthTimeoutError) return true
  // fetch() network failure ("Failed to fetch" / "Load failed" / "NetworkError…")
  if (e instanceof TypeError) return true
  const err = e as { name?: unknown; message?: unknown; status?: unknown }
  const name = typeof err.name === 'string' ? err.name : ''
  if (name === 'AuthTimeoutError' || name === 'AuthRetryableFetchError' || name === 'AbortError') return true
  // GoTrue marks unreachable-server errors with status 0.
  if (err.status === 0) return true
  const msg = typeof err.message === 'string' ? err.message : ''
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed/i.test(msg)
}
