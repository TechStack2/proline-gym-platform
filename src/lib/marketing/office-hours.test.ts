import { describe, it, expect } from 'vitest'
import { defaultOfficeHours, normalizeOfficeHours, hasOfficeHours, DAY_KEYS } from './office-hours'

describe('office-hours model', () => {
  it('defaults span all 7 days with Sunday closed', () => {
    const d = defaultOfficeHours()
    expect(Object.keys(d).sort()).toEqual([...DAY_KEYS].sort())
    expect(d.mon).toEqual({ closed: false, open: '16:00', close: '21:00' })
    expect(d.sun.closed).toBe(true)
  })

  it('normalizeOfficeHours fills missing days from the default', () => {
    const oh = normalizeOfficeHours({ mon: { closed: false, open: '08:00', close: '20:00' } })
    expect(oh.mon).toEqual({ closed: false, open: '08:00', close: '20:00' })
    // an unspecified day falls back to the default for that day
    expect(oh.tue).toEqual({ closed: false, open: '16:00', close: '21:00' })
  })

  it('normalizeOfficeHours coerces a closed day and ignores junk fields', () => {
    const oh = normalizeOfficeHours({ fri: { closed: true }, sat: 'nonsense', bogus: 1 })
    expect(oh.fri.closed).toBe(true)
    expect(oh.sat).toEqual({ closed: false, open: '10:00', close: '14:00' }) // junk → default
  })

  it('normalizeOfficeHours returns the full default for null / non-object', () => {
    expect(normalizeOfficeHours(null)).toEqual(defaultOfficeHours())
    expect(normalizeOfficeHours(undefined)).toEqual(defaultOfficeHours())
    expect(normalizeOfficeHours('x')).toEqual(defaultOfficeHours())
  })

  it('hasOfficeHours gates the landing section (NULL → false → footer fallback)', () => {
    expect(hasOfficeHours(null)).toBe(false)
    expect(hasOfficeHours(undefined)).toBe(false)
    expect(hasOfficeHours({})).toBe(false)
    expect(hasOfficeHours({ mon: { closed: false, open: '16:00', close: '21:00' } })).toBe(true)
  })
})
