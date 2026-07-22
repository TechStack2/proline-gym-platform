import { describe, it, expect } from 'vitest'
import { displayInvoiceStatus, statusLabel, OPEN_INVOICE_STATUSES } from './reconcile'
import { statusEntry } from '../status-vocabulary'

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
  it('the void variant has a label in every locale + a struck-through vocabulary entry', () => {
    expect(statusLabel('void', 'en')).toBe('Void')
    expect(statusLabel('void', 'ar')).toBe('ملغاة')
    expect(statusLabel('void', 'fr')).toBe('Annulée')
    // W3b: colour comes from the status vocabulary, not a class map (DA-32).
    expect(statusEntry('invoice', 'void').strikethrough).toBe(true)
    expect(statusEntry('invoice', 'void').variant).toBe('neutral')
  })
  it('void is NOT an open/owed status (excluded from outstanding)', () => {
    expect((OPEN_INVOICE_STATUSES as readonly string[]).includes('void')).toBe(false)
    expect((OPEN_INVOICE_STATUSES as readonly string[]).includes('cancelled')).toBe(false)
  })
})
