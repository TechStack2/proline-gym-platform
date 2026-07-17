import { describe, it, expect } from 'vitest'
import { upcomingClassOccurrences, gapsToSlots, coachTrialSlots, type TrialScheduleRow } from './occurrences'

// 2026-01-05 is a Monday (getUTCDay 1); 2026-01-07 Wed (3).
const MON: TrialScheduleRow = {
  classId: 'c1', className: 'Boxing', coachId: 'k1', coachName: 'Sami',
  maxCapacity: 10, activeRegCount: 3, dayOfWeek: 1, startTime: '18:00:00', endTime: '19:00:00',
  validFrom: null, validUntil: null,
}
const WED_FULL: TrialScheduleRow = { ...MON, classId: 'c2', className: 'BJJ', dayOfWeek: 3, maxCapacity: 5, activeRegCount: 5, startTime: '19:00:00', endTime: '20:00:00' }

describe('upcomingClassOccurrences', () => {
  it('expands weekly schedules to dated occurrences in the window, sorted', () => {
    const occ = upcomingClassOccurrences([MON, WED_FULL], '2026-01-05', 14)
    const dows = occ.map((o) => new Date(o.date + 'T00:00:00Z').getUTCDay())
    expect(new Set(dows)).toEqual(new Set([1, 3])) // only Mon + Wed
    // sorted by date+time
    expect(occ).toEqual([...occ].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)))
    // first Monday occurrence is 2026-01-05 18:00, 7 spots left
    const firstMon = occ.find((o) => o.classId === 'c1')!
    expect(firstMon.date).toBe('2026-01-05')
    expect(firstMon.startTime).toBe('18:00')
    expect(firstMon.spotsLeft).toBe(7)
    expect(firstMon.full).toBe(false)
  })

  it('flags a full class (spotsLeft 0) but still lists it (overbookable)', () => {
    const occ = upcomingClassOccurrences([WED_FULL], '2026-01-05', 14)
    expect(occ.length).toBeGreaterThan(0)
    expect(occ.every((o) => o.full && o.spotsLeft === 0)).toBe(true)
  })

  it('honors valid_from / valid_until', () => {
    const bounded: TrialScheduleRow = { ...MON, validFrom: '2026-01-12', validUntil: '2026-01-12' }
    const occ = upcomingClassOccurrences([bounded], '2026-01-05', 14)
    expect(occ.map((o) => o.date)).toEqual(['2026-01-12']) // only the in-range Monday
  })

  it('null capacity → spotsLeft null, not full', () => {
    const occ = upcomingClassOccurrences([{ ...MON, maxCapacity: null }], '2026-01-05', 7)
    expect(occ[0].spotsLeft).toBeNull()
    expect(occ[0].full).toBe(false)
  })
})

describe('gapsToSlots', () => {
  it('grids a gap into slot-sized starts, dropping the partial tail', () => {
    expect(gapsToSlots([{ start: '09:00', end: '10:30' }], 60)).toEqual(['09:00']) // 09:00–10:00 fits; 10:00–11:00 doesn't
    expect(gapsToSlots([{ start: '09:00', end: '11:00' }], 60)).toEqual(['09:00', '10:00'])
    expect(gapsToSlots([{ start: '09:00', end: '10:00' }], 30)).toEqual(['09:00', '09:30'])
  })
})

describe('coachTrialSlots', () => {
  it('excludes class hours + existing PT (openAvailabilityGaps) then grids', () => {
    // Window Mon 09:00–12:00; a class 10:00–11:00 struck → gaps 09:00–10:00 + 11:00–12:00.
    const slots = coachTrialSlots({
      fromISO: '2026-01-05', days: 1, slotMinutes: 60,
      windows: [{ day_of_week: 1, start_time: '09:00', end_time: '12:00' }],
      overrides: [],
      busyByDate: { '2026-01-05': [{ start: '10:00', end: '11:00' }] },
    })
    expect(slots).toEqual([
      { date: '2026-01-05', time: '09:00' },
      { date: '2026-01-05', time: '11:00' },
    ])
  })

  it('no window on the weekday → no slots', () => {
    const slots = coachTrialSlots({
      fromISO: '2026-01-06', days: 1, slotMinutes: 60, // Tue
      windows: [{ day_of_week: 1, start_time: '09:00', end_time: '12:00' }], overrides: [], busyByDate: {},
    })
    expect(slots).toEqual([])
  })
})
