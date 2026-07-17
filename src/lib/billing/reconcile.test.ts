import { describe, it, expect } from 'vitest'
import { displayInvoiceStatus, statusLabel, STATUS_BADGE, OPEN_INVOICE_STATUSES } from './reconcile'

/**
 * CANCEL-FLOW — a VOID is stored as status='cancelled' + voided_at set; the display
 * layer surfaces it as the pseudo-status 'void'. These pin that mapping + the
 * "never owed" invariant a voided invoice must satisfy.
 */
describe('displayInvoiceStatus — VOID pseudo-status', () => {
  it('a voided invoice (voided_at set) displays as void, regardless of raw status', () => {
    expect(displayInvoiceStatus('cancelled', '2026-07-18T10:00:00Z')).toBe('void')
    // defensive: even a stale status + voided_at → void
    expect(displayInvoiceStatus('pending', '2026-07-18T10:00:00Z')).toBe('void')
  })
  it('a non-voided invoice keeps its raw status', () => {
    expect(displayInvoiceStatus('paid', null)).toBe('paid')
    expect(displayInvoiceStatus('cancelled', null)).toBe('cancelled') // e2e-reset / legacy cancel, not a VOID
    expect(displayInvoiceStatus('overdue', undefined)).toBe('overdue')
  })
  it('the void variant has a label + badge in every locale', () => {
    expect(statusLabel('void', 'en')).toBe('Void')
    expect(statusLabel('void', 'ar')).toBe('ملغاة')
    expect(statusLabel('void', 'fr')).toBe('Annulée')
    expect(STATUS_BADGE['void']).toBeTruthy()
  })
  it('void is NOT an open/owed status (excluded from outstanding)', () => {
    expect((OPEN_INVOICE_STATUSES as readonly string[]).includes('void')).toBe(false)
    expect((OPEN_INVOICE_STATUSES as readonly string[]).includes('cancelled')).toBe(false)
  })
})
