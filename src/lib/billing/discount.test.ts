import { describe, it, expect } from 'vitest'
import { computeDiscount } from './discount'

/**
 * DISCOUNT R4 — the %↔value math + rounding boundaries. USD is authoritative; the
 * percent is a display cross-computation.
 */
describe('computeDiscount', () => {
  it('empty input is a no-op (0 discount, valid, full due remains)', () => {
    expect(computeDiscount('pct', '', 100)).toEqual({ discountUsd: 0, pct: 0, dueAfter: 100, valid: true })
    expect(computeDiscount('value', '   ', 100)).toEqual({ discountUsd: 0, pct: 0, dueAfter: 100, valid: true })
  })

  it('% mode computes the value against the due', () => {
    const r = computeDiscount('pct', '10', 100)
    expect(r.discountUsd).toBe(10)
    expect(r.pct).toBe(10)
    expect(r.dueAfter).toBe(90)
    expect(r.valid).toBe(true)
  })

  it('value mode computes the equivalent percent', () => {
    const r = computeDiscount('value', '25', 100)
    expect(r.discountUsd).toBe(25)
    expect(r.pct).toBe(25)
    expect(r.dueAfter).toBe(75)
    expect(r.valid).toBe(true)
  })

  it('rounds money and percent to 2dp (non-round due)', () => {
    // 10% of 33.33 = 3.333 → 3.33
    const a = computeDiscount('pct', '10', 33.33)
    expect(a.discountUsd).toBe(3.33)
    expect(a.dueAfter).toBe(30) // 33.33 - 3.33
    // $3.34 off 33.33 → 10.02%
    const b = computeDiscount('value', '3.34', 33.33)
    expect(b.pct).toBe(10.02)
    expect(b.discountUsd).toBe(3.34)
  })

  it('the exact full-due discount is valid (dueAfter 0)', () => {
    const r = computeDiscount('value', '100', 100)
    expect(r.discountUsd).toBe(100)
    expect(r.dueAfter).toBe(0)
    expect(r.valid).toBe(true)
  })

  it('a discount larger than the due is INVALID (blocks submit)', () => {
    expect(computeDiscount('value', '100.01', 100).valid).toBe(false)
    expect(computeDiscount('pct', '101', 100).valid).toBe(false) // >100%
    expect(computeDiscount('pct', '100', 100).valid).toBe(true)  // 100% == due, ok
  })

  it('negative / non-numeric is invalid', () => {
    expect(computeDiscount('value', '-5', 100).valid).toBe(false)
    expect(computeDiscount('pct', 'abc', 100).valid).toBe(false)
  })

  it('100% of the due equals the due (boundary)', () => {
    const r = computeDiscount('pct', '100', 80)
    expect(r.discountUsd).toBe(80)
    expect(r.dueAfter).toBe(0)
    expect(r.valid).toBe(true)
  })
})
