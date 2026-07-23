import { describe, it, expect } from 'vitest'
import { middleTruncateId } from './invoice-id'

describe('middleTruncateId (MONEY-MOBILE R3)', () => {
  it('elides the middle of a long canonical id, keeping INV + trailing sequence', () => {
    expect(middleTruncateId('INV-PROLINEGYM-2026-00009')).toBe('INV-…-00009')
  })

  it('leaves a short id that already fits untouched', () => {
    expect(middleTruncateId('INV-1')).toBe('INV-1')
    expect(middleTruncateId('INV-2026-0007')).toBe('INV-2026-0007') // 13 ≤ 16
  })

  it('truncates a canonical id past the 16-char max, keeping the ends', () => {
    expect(middleTruncateId('INV-SHORTGYM-0001')).toBe('INV-…-0001') // 17 > 16 → elide middle
  })

  it('handles empty / nullish safely', () => {
    expect(middleTruncateId('')).toBe('')
    expect(middleTruncateId(null)).toBe('')
    expect(middleTruncateId(undefined)).toBe('')
  })

  it('falls back to symmetric char truncation for a non-hyphenated long id', () => {
    const out = middleTruncateId('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    expect(out).toContain('…')
    expect(out.startsWith('ABC')).toBe(true)
    expect(out.endsWith('XYZ')).toBe(true)
  })
})
