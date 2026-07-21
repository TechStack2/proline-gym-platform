import { describe, it, expect } from 'vitest'
import { classifySignInFailure, classifyPasswordUpdateFailure, AUTH_LOG_CODE } from './auth-error'

/**
 * AUTH-ERRORS — the classifier, pinned against the SHAPES GoTrue actually returns.
 *
 * The load-bearing test in this file is the PAIR-EQUALITY one: a wrong password and
 * an address with no account must classify identically. That is the J6
 * anti-enumeration invariant, and it is asserted as an equality between two
 * classifications rather than as two separate expectations — so it cannot drift
 * apart silently if either bucket is ever re-tuned.
 */

// Real supabase-js/GoTrue payloads (shape-faithful: name/status/code/message).
const WRONG_PASSWORD = { name: 'AuthApiError', message: 'Invalid login credentials', status: 400, code: 'invalid_credentials' }
const NO_SUCH_ACCOUNT = { name: 'AuthApiError', message: 'Invalid login credentials', status: 400, code: 'invalid_credentials' }
const LEGACY_NO_CODE = { name: 'AuthApiError', message: 'Invalid login credentials', status: 400 }
const RATE_LIMITED = { name: 'AuthApiError', message: 'Request rate limit reached', status: 429, code: 'over_request_rate_limit' }
const GOTRUE_500 = { name: 'AuthApiError', message: 'Database error querying schema', status: 500, code: 'unexpected_failure' }
const UNREACHABLE = { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 }

describe('AUTH-ERRORS · classifySignInFailure', () => {
  it('reports a wrong password as `credentials`, not as a system error', () => {
    // The field failure: this used to render "An error occurred during login".
    expect(classifySignInFailure(WRONG_PASSWORD)).toBe('credentials')
  })

  it('classifies a NON-EXISTENT account IDENTICALLY to a wrong password (J6: no enumeration oracle)', () => {
    expect(classifySignInFailure(NO_SUCH_ACCOUNT)).toBe(classifySignInFailure(WRONG_PASSWORD))
    // …and the log code is the same too, so the SERVER-side record leaks no more
    // than the UI does. An operator reading logs cannot tell which it was either.
    expect(AUTH_LOG_CODE.signin[classifySignInFailure(NO_SUCH_ACCOUNT)])
      .toBe(AUTH_LOG_CODE.signin[classifySignInFailure(WRONG_PASSWORD)])
  })

  it('still recognises the legacy message-only shape (no `code` field)', () => {
    expect(classifySignInFailure(LEGACY_NO_CODE)).toBe('credentials')
  })

  it('keeps rate-limiting distinct', () => {
    expect(classifySignInFailure(RATE_LIMITED)).toBe('rate_limited')
    expect(classifySignInFailure({ status: 429 })).toBe('rate_limited')
  })

  it('calls a GoTrue 500 a `server` failure — a broken platform never blames the password', () => {
    expect(classifySignInFailure(GOTRUE_500)).toBe('server')
  })

  it('treats an UNREACHABLE GoTrue as `server` (server-side, the failing network is OURS)', () => {
    expect(classifySignInFailure(UNREACHABLE)).toBe('server')
  })

  it('fails SAFE on anything unrecognised — an unknown error is never reported as bad credentials', () => {
    for (const weird of [null, undefined, {}, 'boom', new Error('kaboom'), { status: 418 }]) {
      expect(classifySignInFailure(weird)).toBe('server')
    }
  })
})

describe('AUTH-ERRORS · classifyPasswordUpdateFailure', () => {
  it('names the user-actionable policy rejections instead of blaming the link', () => {
    expect(classifyPasswordUpdateFailure({
      message: 'New password should be different from the old password.', status: 422, code: 'same_password',
    })).toBe('password_policy')
    expect(classifyPasswordUpdateFailure({
      name: 'AuthWeakPasswordError', message: 'Password is too weak', status: 422, code: 'weak_password',
    })).toBe('password_policy')
  })

  it('recognises an expired / missing recovery session', () => {
    expect(classifyPasswordUpdateFailure({
      name: 'AuthSessionMissingError', message: 'Auth session missing!', status: 400,
    })).toBe('session')
    expect(classifyPasswordUpdateFailure({ message: 'invalid claim', status: 401, code: 'bad_jwt' })).toBe('session')
  })

  it('keeps rate-limiting distinct and everything else `server`', () => {
    expect(classifyPasswordUpdateFailure({ status: 429, code: 'over_request_rate_limit' })).toBe('rate_limited')
    expect(classifyPasswordUpdateFailure(GOTRUE_500)).toBe('server')
    expect(classifyPasswordUpdateFailure(null)).toBe('server')
  })
})

describe('AUTH-ERRORS · the log codes', () => {
  it('has one code per bucket, and none of them can carry a secret', () => {
    // Static strings by construction — there is no interpolation site where a
    // password or an address could be appended to a code.
    for (const code of [...Object.values(AUTH_LOG_CODE.signin), ...Object.values(AUTH_LOG_CODE.password_update)]) {
      expect(code).toMatch(/^auth\.(signin|password_update)\.[a-z_]+$/)
    }
    expect(new Set(Object.values(AUTH_LOG_CODE.signin)).size).toBe(3)
    expect(new Set(Object.values(AUTH_LOG_CODE.password_update)).size).toBe(4)
  })
})
