import { describe, it, expect } from 'vitest'
import { deriveMemberAttention, ATTENTION } from './attention'
import { agingBucketFor, daysPastDue } from '@/lib/finances/aging'

const TODAY = new Date('2026-07-23T12:00:00Z')
const iso = (daysFromToday: number) => {
  const d = new Date(TODAY)
  d.setUTCDate(d.getUTCDate() + daysFromToday)
  return d.toISOString().slice(0, 10)
}

const base = {
  overdueRenewals: [],
  openInvoices: [],
  ptAssignments: [],
  lastSeen: iso(-1),
  joinDate: iso(-100),
  today: TODAY,
}

describe('agingBucketFor — the per-invoice twin of 000110', () => {
  it('boundaries byte-match the SQL (due today = current; 30/60 edges)', () => {
    expect(agingBucketFor(iso(0), TODAY)).toBe('current')
    expect(agingBucketFor(iso(5), TODAY)).toBe('current') // future due
    expect(agingBucketFor(iso(-1), TODAY)).toBe('d1_30')
    expect(agingBucketFor(iso(-30), TODAY)).toBe('d1_30')
    expect(agingBucketFor(iso(-31), TODAY)).toBe('d31_60')
    expect(agingBucketFor(iso(-60), TODAY)).toBe('d31_60')
    expect(agingBucketFor(iso(-61), TODAY)).toBe('d60_plus')
  })
  it('daysPastDue floors at zero for future dates', () => {
    expect(daysPastDue(iso(3), TODAY)).toBe(0)
    expect(daysPastDue(iso(-21), TODAY)).toBe(21)
  })
})

describe('deriveMemberAttention — §3.2 mechanical rules', () => {
  it('quiet member ⇒ empty queue (the queue is absent when empty)', () => {
    expect(deriveMemberAttention(base)).toEqual([])
  })

  it('renewal past due ⇒ danger row with overdue days + collect target', () => {
    const items = deriveMemberAttention({
      ...base,
      overdueRenewals: [{ productLabel: 'Muay Thai Adults', dueDate: iso(-4), collectInvoiceId: 'inv-1', anchor: '#panel-registrations' }],
    })
    expect(items).toEqual([
      expect.objectContaining({ kind: 'renewal', severity: 'danger', overdueDays: 4, collectInvoiceId: 'inv-1' }),
    ])
  })

  it('invoice aging: > threshold queues, at/below does not, settled does not', () => {
    const items = deriveMemberAttention({
      ...base,
      openInvoices: [
        { id: 'a', invoiceNumber: 'INV-1', dueDate: iso(-ATTENTION.INVOICE_AGING_DAYS - 7), balanceUsd: 70 },
        { id: 'b', invoiceNumber: 'INV-2', dueDate: iso(-ATTENTION.INVOICE_AGING_DAYS), balanceUsd: 70 }, // exactly 7d — not yet
        { id: 'c', invoiceNumber: 'INV-3', dueDate: iso(-30), balanceUsd: 0 }, // settled
      ],
    })
    expect(items).toEqual([
      expect.objectContaining({ kind: 'invoice', invoiceId: 'a', ageDays: ATTENTION.INVOICE_AGING_DAYS + 7 }),
    ])
  })

  it('PT queues when expiring < 14d OR ≤ 2 sessions; not when spent/inactive', () => {
    type AttentionPt = {
      id: string; packageLabel: string; expiresAt: string | null
      sessionsRemaining: number; sessionsTotal: number; isActive: boolean
    }
    const pt = (over: Partial<AttentionPt>): AttentionPt => ({
      id: 'p', packageLabel: 'PT 10', expiresAt: iso(40), sessionsRemaining: 8, sessionsTotal: 10, isActive: true, ...over,
    })
    expect(deriveMemberAttention({ ...base, ptAssignments: [pt({ expiresAt: iso(10) })] }))
      .toEqual([expect.objectContaining({ kind: 'pt', reason: 'expiring' })])
    expect(deriveMemberAttention({ ...base, ptAssignments: [pt({ sessionsRemaining: 2 })] }))
      .toEqual([expect.objectContaining({ kind: 'pt', reason: 'low' })])
    expect(deriveMemberAttention({ ...base, ptAssignments: [pt({})] })).toEqual([])
    expect(deriveMemberAttention({ ...base, ptAssignments: [pt({ sessionsRemaining: 0 })] })).toEqual([])
    expect(deriveMemberAttention({ ...base, ptAssignments: [pt({ isActive: false, expiresAt: iso(2) })] })).toEqual([])
  })

  it('win-back at 14d absent; never-seen counts once membership is older than the window', () => {
    expect(deriveMemberAttention({ ...base, lastSeen: iso(-ATTENTION.ABSENCE_WINBACK_DAYS) }))
      .toEqual([expect.objectContaining({ kind: 'winback', absentDays: ATTENTION.ABSENCE_WINBACK_DAYS })])
    expect(deriveMemberAttention({ ...base, lastSeen: null, joinDate: iso(-20) }))
      .toEqual([expect.objectContaining({ kind: 'winback', absentDays: null })])
    expect(deriveMemberAttention({ ...base, lastSeen: null, joinDate: iso(-3) })).toEqual([])
  })

  it('orders renewal → invoice → pt → winback (severity order for the queue)', () => {
    const items = deriveMemberAttention({
      ...base,
      lastSeen: iso(-30),
      overdueRenewals: [{ productLabel: 'X', dueDate: iso(-2), collectInvoiceId: null, anchor: '#a' }],
      openInvoices: [{ id: 'a', invoiceNumber: 'I', dueDate: iso(-20), balanceUsd: 10 }],
      ptAssignments: [{ id: 'p', packageLabel: 'PT', expiresAt: iso(3), sessionsRemaining: 9, sessionsTotal: 10, isActive: true }],
    })
    expect(items.map((i) => i.kind)).toEqual(['renewal', 'invoice', 'pt', 'winback'])
  })
})
