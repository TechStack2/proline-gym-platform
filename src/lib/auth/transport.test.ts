import { describe, it, expect } from 'vitest'
import { withAuthTimeout, isTransportError, AuthTimeoutError } from './transport'

describe('withAuthTimeout — a hung auth call fails visibly', () => {
  it('resolves a fast promise untouched', async () => {
    await expect(withAuthTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok')
  })
  it('propagates a fast rejection untouched', async () => {
    await expect(withAuthTimeout(Promise.reject(new Error('boom')), 50)).rejects.toThrow('boom')
  })
  it('rejects with AuthTimeoutError when the call hangs', async () => {
    const hung = new Promise(() => {}) // never settles — the field-failure shape
    await expect(withAuthTimeout(hung, 30)).rejects.toBeInstanceOf(AuthTimeoutError)
  })
})

describe('isTransportError — network failures vs server answers', () => {
  it('classifies the transport family as transport', () => {
    expect(isTransportError(new AuthTimeoutError())).toBe(true)
    expect(isTransportError(new TypeError('Failed to fetch'))).toBe(true) // Chrome offline
    expect(isTransportError(new TypeError('Load failed'))).toBe(true) // Safari offline
    expect(isTransportError({ name: 'AuthRetryableFetchError', message: '{}', status: 0 })).toBe(true) // GoTrue
    expect(isTransportError({ name: 'AbortError', message: 'aborted' })).toBe(true)
    expect(isTransportError({ message: 'TypeError: fetch failed' })).toBe(true) // wrapped
  })
  it('classifies real server answers as NOT transport (no posture change)', () => {
    expect(isTransportError({ name: 'AuthApiError', message: 'Invalid login credentials', status: 400 })).toBe(false)
    expect(isTransportError(new Error('An error occurred in the Server Components render'))).toBe(false)
    expect(isTransportError({ status: 500, message: 'internal' })).toBe(false)
    expect(isTransportError(null)).toBe(false)
    expect(isTransportError(undefined)).toBe(false)
  })
})
