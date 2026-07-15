import { describe, it, expect } from 'vitest'
import { classCompletenessGaps, isClassComplete } from './completeness'

describe('classCompletenessGaps', () => {
  const activeCoach = { is_active: true }

  it('a class with a schedule slot and an active coach is complete', () => {
    const cls = { schedules: [{ id: 's1' }], coach: activeCoach }
    expect(classCompletenessGaps(cls)).toEqual([])
    expect(isClassComplete(cls)).toBe(true)
  })

  it('flags a class with no schedule slots', () => {
    expect(classCompletenessGaps({ schedules: [], coach: activeCoach })).toEqual(['schedule'])
    expect(classCompletenessGaps({ schedules: null, coach: activeCoach })).toEqual(['schedule'])
    expect(classCompletenessGaps({ coach: activeCoach })).toEqual(['schedule'])
  })

  it('flags a deactivated or missing coach', () => {
    expect(classCompletenessGaps({ schedules: [{ id: 's1' }], coach: { is_active: false } })).toEqual(['coach'])
    expect(classCompletenessGaps({ schedules: [{ id: 's1' }], coach: null })).toEqual(['coach'])
  })

  it('reports both gaps, schedule first', () => {
    expect(classCompletenessGaps({ schedules: [], coach: { is_active: false } })).toEqual(['schedule', 'coach'])
    expect(isClassComplete({ schedules: [], coach: null })).toBe(false)
  })
})
