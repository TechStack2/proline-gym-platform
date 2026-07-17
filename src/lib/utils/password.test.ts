import { describe, it, expect } from 'vitest'
import { isPasswordValid, passwordStrength, PASSWORD_MIN_LENGTH } from './password'

/**
 * AUTH-EASE R3 — the one password policy is 8. Lock the boundary so a future edit
 * can't silently drift it back to 6 or 10.
 */
describe('password policy', () => {
  it('the minimum is 8', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8)
  })

  it('rejects 7 chars, accepts 8 (the money-path boundary)', () => {
    expect(isPasswordValid('abc1234')).toBe(false) // 7
    expect(isPasswordValid('abc12345')).toBe(true) // 8
  })

  it('below the minimum is always weak', () => {
    expect(passwordStrength('abc1234')).toBe('weak') // 7
    expect(passwordStrength('TigerPanda57')).not.toBe('weak') // a real temp
  })
})
