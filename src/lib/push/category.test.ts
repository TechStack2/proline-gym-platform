import { describe, it, expect } from 'vitest'
import { categoryForType, categoryEnabled, PREF_COLUMN } from './category'

describe('categoryForType (PUSH-1 map)', () => {
  it('maps the tick-driven time reminders to schedule', () => {
    for (const t of ['renewal_due', 'renewal_reminder', 'membership_expiring', 'membership_lapsed', 'registration_suspended', 'pt_refill_due']) {
      expect(categoryForType(t)).toBe('schedule')
    }
  })
  it('maps billing documents to informational', () => {
    expect(categoryForType('invoice_issued')).toBe('informational')
    expect(categoryForType('invoice_overdue')).toBe('informational')
  })
  it('maps the owner-named operational events (payment recorded / registration approved / requests) to operational', () => {
    for (const t of ['payment_received', 'class_approved', 'class_requested', 'lead_new', 'pt_requested', 'member_request']) {
      expect(categoryForType(t)).toBe('operational')
    }
  })
  it('defaults unknown/empty types to operational (fail-safe ON)', () => {
    expect(categoryForType('some_new_future_type')).toBe('operational')
    expect(categoryForType(null)).toBe('operational')
    expect(categoryForType(undefined)).toBe('operational')
  })
})

describe('categoryEnabled (default ON)', () => {
  it('is ON when the pref is true, null, undefined, or the profile is missing', () => {
    expect(categoryEnabled('operational', { push_operational: true })).toBe(true)
    expect(categoryEnabled('operational', { push_operational: null })).toBe(true)
    expect(categoryEnabled('operational', {})).toBe(true)
    expect(categoryEnabled('operational', null)).toBe(true)
  })
  it('is OFF only when the pref is explicitly false', () => {
    expect(categoryEnabled('operational', { push_operational: false })).toBe(false)
    expect(categoryEnabled('schedule', { push_schedule: false })).toBe(false)
    expect(categoryEnabled('informational', { push_informational: false })).toBe(false)
  })
  it('reads the right column per category', () => {
    expect(PREF_COLUMN.operational).toBe('push_operational')
    expect(PREF_COLUMN.schedule).toBe('push_schedule')
    expect(PREF_COLUMN.informational).toBe('push_informational')
    // a false on ONE category does not disable the others
    expect(categoryEnabled('schedule', { push_operational: false })).toBe(true)
  })
})
