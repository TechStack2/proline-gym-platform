import { describe, it, expect } from 'vitest'
import { generateTempPassword } from './temp-password'
import { isPasswordValid, PASSWORD_MIN_LENGTH } from '@/lib/utils/password'

/**
 * AUTH-EASE R1 — the friendly temp password is strong AND dictate-safe. Run every
 * assertion across many samples so a single lucky draw can't pass a broken generator.
 */
describe('generateTempPassword', () => {
  const SAMPLES = Array.from({ length: 500 }, () => generateTempPassword())

  it('is always at least the policy minimum (8) and clears the app validator', () => {
    for (const pw of SAMPLES) {
      expect(pw.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH)
      expect(isPasswordValid(pw)).toBe(true)
    }
  })

  it('contains NO ambiguous glyphs (l, 1, O, 0, I)', () => {
    for (const pw of SAMPLES) {
      expect(pw, `"${pw}" must avoid l/1/O/0/I`).not.toMatch(/[l1O0I]/)
    }
  })

  it('is TwoWords + 2 digits (2–9), giving upper+lower+digit variety', () => {
    for (const pw of SAMPLES) {
      // Two capitalised lowercase words, then exactly two digits from 2–9.
      expect(pw, `"${pw}" shape`).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+[2-9]{2}$/)
      expect(pw).toMatch(/[A-Z]/)
      expect(pw).toMatch(/[a-z]/)
      expect(pw).toMatch(/[2-9]/)
    }
  })

  it('is not trivially constant (draws vary)', () => {
    expect(new Set(SAMPLES).size).toBeGreaterThan(50)
  })
})
