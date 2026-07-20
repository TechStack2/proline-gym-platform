import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * AUTH-ERRORS — the sign-in ACTIONS, entered directly.
 *
 * The e2e proves what a person SEES. This proves what the action RETURNS, which is
 * the thing the copy is derived from — and it can assert the property that matters
 * most as an EQUALITY rather than as two hopeful expectations:
 *
 *   a wrong password and an address with no account must produce the SAME reason.
 *
 * If that ever drifts, the login screen becomes an account-existence oracle (J6),
 * and no amount of careful UI copy would put it back.
 *
 * The GoTrue answer is stubbed at the supabase client boundary, so these tests
 * pin OUR mapping — not GoTrue's behaviour, which auth-error.test.ts fixes
 * separately against its real payload shapes.
 */
const signIn = vi.fn()
const captured: Array<{ message: string; ctx: unknown }> = []

vi.mock('next/headers', () => ({ headers: () => new Map([['x-forwarded-for', '203.0.113.9']]) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { signInWithPassword: signIn } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  // The phone path resolves phone → synthetic email through the service role. No
  // profile matches here, so the action falls through to its "attempt a sign-in
  // against a non-existent address anyway" branch — which is the whole point:
  // an unknown phone must burn a real GoTrue attempt like a known one.
  createAdminClient: () => ({
    from: () => ({ select: () => ({ in: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }) }),
    auth: { admin: { getUserById: async () => ({ data: null, error: new Error('none') }) } },
  }),
}))
vi.mock('@sentry/nextjs', () => ({
  captureMessage: (message: string, ctx: unknown) => { captured.push({ message, ctx }) },
}))

import { signInWithEmail, signInWithPhone } from './actions'

/** The identical answer GoTrue gives for a wrong password AND for no such user. */
const INVALID_CREDENTIALS = {
  name: 'AuthApiError', message: 'Invalid login credentials', status: 400, code: 'invalid_credentials',
}
const GOTRUE_DOWN = {
  name: 'AuthApiError', message: 'Database error querying schema', status: 500, code: 'unexpected_failure',
}

/** A fresh identifier per case — the per-(IP+identifier) limiter is process-global. */
let n = 0
const freshEmail = () => `ae-${++n}-${process.pid}@nowhere.test`
const freshPhone = () => `0300000${String(1000 + ++n).slice(-4)}`

beforeEach(() => {
  signIn.mockReset()
  captured.length = 0
})

describe('AUTH-ERRORS · signInWithEmail', () => {
  it('reports a WRONG PASSWORD as `credentials` — not as a system failure', async () => {
    signIn.mockResolvedValue({ error: INVALID_CREDENTIALS })
    expect(await signInWithEmail(freshEmail(), 'wrong-pass')).toEqual({ ok: false, reason: 'credentials' })
  })

  it('gives a NON-EXISTENT account the IDENTICAL reason (J6 — no enumeration oracle)', async () => {
    signIn.mockResolvedValue({ error: INVALID_CREDENTIALS })
    const wrongPassword = await signInWithEmail(freshEmail(), 'wrong-pass')
    const noSuchAccount = await signInWithEmail(freshEmail(), 'wrong-pass')
    // Asserted as an EQUALITY: the two cases cannot be re-tuned apart by accident.
    expect(noSuchAccount).toEqual(wrongPassword)
  })

  it('reports a GoTrue outage as `server` — a broken platform never blames the password', async () => {
    signIn.mockResolvedValue({ error: GOTRUE_DOWN })
    expect(await signInWithEmail(freshEmail(), 'whatever')).toEqual({ ok: false, reason: 'server' })
  })

  it('reports the per-identifier limiter as `rate_limited` on the 6th attempt', async () => {
    signIn.mockResolvedValue({ error: INVALID_CREDENTIALS })
    const email = freshEmail()
    for (let i = 1; i <= 5; i++) {
      expect((await signInWithEmail(email, 'wrong-pass')).reason, `attempt ${i}`).toBe('credentials')
    }
    expect((await signInWithEmail(email, 'wrong-pass')).reason).toBe('rate_limited')
  })

  it('succeeds with no reason attached', async () => {
    signIn.mockResolvedValue({ error: null })
    expect(await signInWithEmail(freshEmail(), 'right-pass')).toEqual({ ok: true })
  })

  it('treats empty input as `credentials` without consulting GoTrue', async () => {
    expect(await signInWithEmail('', 'pw')).toEqual({ ok: false, reason: 'credentials' })
    expect(await signInWithEmail('someone@nowhere.test', '')).toEqual({ ok: false, reason: 'credentials' })
    expect(signIn).not.toHaveBeenCalled()
  })
})

describe('AUTH-ERRORS · signInWithPhone', () => {
  it('gives an UNKNOWN phone the same `credentials` reason as a wrong password', async () => {
    signIn.mockResolvedValue({ error: INVALID_CREDENTIALS })
    expect(await signInWithPhone(freshPhone(), 'wrong-pass')).toEqual({ ok: false, reason: 'credentials' })
  })

  it('reports a GoTrue outage on the phone door as `server` too', async () => {
    signIn.mockResolvedValue({ error: GOTRUE_DOWN })
    expect(await signInWithPhone(freshPhone(), 'wrong-pass')).toEqual({ ok: false, reason: 'server' })
  })
})

describe('AUTH-ERRORS · what reaches Sentry', () => {
  it('captures ONLY server failures, and only the code — never the identifier or the password', async () => {
    signIn.mockResolvedValue({ error: INVALID_CREDENTIALS })
    await signInWithEmail('someone@real.test', 'hunter2-the-secret')
    expect(captured, 'a wrong password is a user event, not an error — it must not burn the free-tier quota')
      .toHaveLength(0)

    signIn.mockResolvedValue({ error: GOTRUE_DOWN })
    await signInWithEmail('someone@real.test', 'hunter2-the-secret')
    expect(captured).toHaveLength(1)
    expect(captured[0].message).toBe('auth.signin.server')
    const blob = JSON.stringify(captured[0])
    expect(blob, 'the password never leaves the process').not.toContain('hunter2')
    expect(blob, 'nor the identifier').not.toContain('someone@real.test')
  })
})
