import { describe, it, expect } from 'vitest'
import { createRateLimitStore, checkRateLimit, resetRateLimit, cleanupRateLimitStore, envLimit } from './rate-limit'

// LOGIN-LIMITER — window semantics the auth layers rely on. `now` is injectable,
// so the clock is simulated (no fake timers needed).
describe('checkRateLimit', () => {
  const WINDOW = 60_000

  it('allows up to the limit, blocks past it (per key)', () => {
    const store = createRateLimitStore()
    const t0 = 1_000_000
    for (let i = 1; i <= 5; i++) {
      expect(checkRateLimit(store, 'k', 5, WINDOW, t0 + i).allowed, `attempt ${i}`).toBe(true)
    }
    expect(checkRateLimit(store, 'k', 5, WINDOW, t0 + 6).allowed, 'attempt 6 blocked').toBe(false)
    expect(checkRateLimit(store, 'k', 5, WINDOW, t0 + 7).allowed, 'stays blocked in-window').toBe(false)
  })

  it('keys are independent — a second identifier from the same process is unaffected', () => {
    const store = createRateLimitStore()
    const t0 = 1_000_000
    for (let i = 1; i <= 6; i++) checkRateLimit(store, 'ip:phoneA', 5, WINDOW, t0 + i)
    expect(checkRateLimit(store, 'ip:phoneA', 5, WINDOW, t0 + 10).allowed).toBe(false)
    expect(checkRateLimit(store, 'ip:phoneB', 5, WINDOW, t0 + 11).allowed, 'other identifier unaffected').toBe(true)
  })

  it('the window expires — attempts re-allowed after resetAt', () => {
    const store = createRateLimitStore()
    const t0 = 1_000_000
    for (let i = 1; i <= 6; i++) checkRateLimit(store, 'k', 5, WINDOW, t0 + i)
    expect(checkRateLimit(store, 'k', 5, WINDOW, t0 + 100).allowed).toBe(false)
    expect(checkRateLimit(store, 'k', 5, WINDOW, t0 + WINDOW + 2).allowed, 'fresh window').toBe(true)
  })

  it('resetRateLimit clears a key (successful login ends the failed window)', () => {
    const store = createRateLimitStore()
    const t0 = 1_000_000
    for (let i = 1; i <= 6; i++) checkRateLimit(store, 'k', 5, WINDOW, t0 + i)
    expect(checkRateLimit(store, 'k', 5, WINDOW, t0 + 10).allowed).toBe(false)
    resetRateLimit(store, 'k')
    expect(checkRateLimit(store, 'k', 5, WINDOW, t0 + 11).allowed, 'cleared after success').toBe(true)
  })

  it('cleanup drops only expired entries', () => {
    const store = createRateLimitStore()
    const t0 = 1_000_000
    checkRateLimit(store, 'old', 5, WINDOW, t0)
    checkRateLimit(store, 'fresh', 5, WINDOW, t0 + WINDOW - 1_000)
    cleanupRateLimitStore(store, t0 + WINDOW + 1)
    expect(store.has('old')).toBe(false)
    expect(store.has('fresh')).toBe(true)
  })

  it('remaining + resetAt are reported', () => {
    const store = createRateLimitStore()
    const t0 = 1_000_000
    const first = checkRateLimit(store, 'k', 3, WINDOW, t0)
    expect(first).toEqual({ allowed: true, remaining: 2, resetAt: t0 + WINDOW })
    checkRateLimit(store, 'k', 3, WINDOW, t0 + 1)
    const third = checkRateLimit(store, 'k', 3, WINDOW, t0 + 2)
    expect(third.remaining).toBe(0)
    expect(third.allowed).toBe(true)
  })
})

describe('envLimit', () => {
  it('falls back on unset / junk / non-positive values', () => {
    delete process.env.__RL_TEST__
    expect(envLimit('__RL_TEST__', 30)).toBe(30)
    process.env.__RL_TEST__ = 'abc'
    expect(envLimit('__RL_TEST__', 30)).toBe(30)
    process.env.__RL_TEST__ = '0'
    expect(envLimit('__RL_TEST__', 30)).toBe(30)
    process.env.__RL_TEST__ = '1000'
    expect(envLimit('__RL_TEST__', 30)).toBe(1000)
    delete process.env.__RL_TEST__
  })
})
