import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * ERROR-OBSERVE — the capture path the client error boundaries invoke on mount.
 *
 * global-error.tsx and SegmentError both call `captureError(error)` in a useEffect.
 * This pins the two properties that matter: (1) it forwards the exact error to
 * Sentry.captureException, so the next PWA crash carries a stack; (2) it can NEVER
 * throw out of the boundary — a Sentry failure must not re-crash the last-resort
 * surface. The Sentry SDK is stubbed at the @sentry/nextjs boundary.
 */
const captureException = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}))

import { captureError } from './sentry'

describe('captureError', () => {
  beforeEach(() => {
    captureException.mockReset()
    captureException.mockImplementation(() => {})
  })

  it('forwards the exact error to Sentry.captureException', () => {
    const err = Object.assign(new Error('boom'), { digest: 'abc123' })
    captureError(err)
    expect(captureException).toHaveBeenCalledTimes(1)
    expect(captureException).toHaveBeenCalledWith(err)
  })

  it('never re-crashes the boundary when capture throws (the guard)', () => {
    captureException.mockImplementation(() => {
      throw new Error('sentry transport down')
    })
    expect(() => captureError(new Error('boom'))).not.toThrow()
  })

  it('captures a non-Error throw too (a boundary may receive anything)', () => {
    captureError('a string was thrown')
    expect(captureException).toHaveBeenCalledWith('a string was thrown')
  })
})
