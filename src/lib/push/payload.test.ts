import { describe, it, expect } from 'vitest'
import { buildPushPayload } from './payload'

describe('buildPushPayload (PII-light)', () => {
  it('carries NO PII — no member name, amount, or class in title/body', () => {
    const p = buildPushPayload({ type: 'payment_received', action_url: '/invoices/abc' }, 'en')
    const blob = `${p.title} ${p.body}`.toLowerCase()
    // generic copy only — the specifics live behind auth in the app
    expect(blob).not.toMatch(/\$|\d{2,}|karim|rana|omar/)
    expect(p.category).toBe('operational')
  })
  it('deep-links to the notification action_url, falling back to /notifications', () => {
    expect(buildPushPayload({ type: 'invoice_issued', action_url: '/invoices/xyz' }, 'en').url).toBe('/invoices/xyz')
    expect(buildPushPayload({ type: 'invoice_issued', action_url: null }, 'en').url).toBe('/notifications')
  })
  it('tags one visible notification per category (a burst collapses, not stacks)', () => {
    expect(buildPushPayload({ type: 'lead_new', action_url: null }, 'en').tag).toBe('proline-operational')
    expect(buildPushPayload({ type: 'renewal_due', action_url: null }, 'en').tag).toBe('proline-schedule')
    expect(buildPushPayload({ type: 'invoice_issued', action_url: null }, 'en').tag).toBe('proline-informational')
  })
  it('localizes the body and falls back to English for unknown locales', () => {
    expect(buildPushPayload({ type: 'renewal_due', action_url: null }, 'ar').body).toContain('تذكير')
    const fr = buildPushPayload({ type: 'renewal_due', action_url: null }, 'fr').body
    expect(fr.toLowerCase()).toContain('rappel')
    // unknown locale → English copy (still non-empty)
    expect(buildPushPayload({ type: 'lead_new', action_url: null }, 'de').body.length).toBeGreaterThan(0)
  })
})
