import { describe, it, expect } from 'vitest'
import { dualMoney } from './currency'
import { paidLbp, balanceLbp, outstandingLbp, paidLbpByInvoice } from './reconcile'

describe('dualMoney — honest dual-currency layout per preference', () => {
  it('USD pref: USD primary; LBP secondary only when recorded', () => {
    expect(dualMoney(50, 4450000, 'USD')).toEqual({ primary: '$50.00', secondary: '4,450,000 LBP' })
    expect(dualMoney(50, 0, 'USD')).toEqual({ primary: '$50.00', secondary: null })
  })
  it('LBP pref: LBP primary, USD secondary (always both)', () => {
    expect(dualMoney(50, 4450000, 'LBP')).toEqual({ primary: '4,450,000 LBP', secondary: '$50.00' })
    // even a zero USD is shown (the drawer honestly holds $0)
    expect(dualMoney(0, 4450000, 'LBP')).toEqual({ primary: '4,450,000 LBP', secondary: '$0.00' })
  })
  it('BOTH pref: both lines ALWAYS, even a 0 in either column', () => {
    expect(dualMoney(50, 4450000, 'BOTH')).toEqual({ primary: '$50.00', secondary: '4,450,000 LBP' })
    expect(dualMoney(50, 0, 'BOTH')).toEqual({ primary: '$50.00', secondary: '0 LBP' })
  })
  it('never cross-converts — the two figures are the stored columns verbatim', () => {
    // a nonsense rate pair proves no conversion happens
    expect(dualMoney(10, 999, 'BOTH')).toEqual({ primary: '$10.00', secondary: '999 LBP' })
  })
})

describe('paidLbp / balanceLbp — the LBP twins (refund + discount flow through)', () => {
  it('sums the recorded amount_lbp', () => {
    expect(paidLbp([{ amount_usd: 0, amount_lbp: 2_000_000 }, { amount_usd: 0, amount_lbp: 1_500_000 }])).toBe(3_500_000)
  })
  it('a refund (negative amount_lbp) nets to zero — balance returns to full', () => {
    const pays = [{ amount_usd: 50, amount_lbp: 5_000_000 }, { amount_usd: -50, amount_lbp: -5_000_000 }]
    expect(paidLbp(pays)).toBe(0)
    expect(balanceLbp(5_000_000, pays)).toBe(5_000_000)
  })
  it('a discounted (net) LBP payment settles the discounted total', () => {
    // invoice total_lbp cut to 4,000,000 by a discount; member pays that net amount
    expect(balanceLbp(4_000_000, [{ amount_usd: 0, amount_lbp: 4_000_000 }])).toBe(0)
  })
  it('sub-1 LBP residue clamps to 0; a USD-priced invoice (total_lbp 0) has no LBP balance', () => {
    expect(balanceLbp(1_000_000, [{ amount_usd: 0, amount_lbp: 999_999.6 }])).toBe(0)
    expect(balanceLbp(0, [{ amount_usd: 40, amount_lbp: 0 }])).toBe(0)
  })
})

describe('outstandingLbp — Σ open-invoice LBP balances, as recorded', () => {
  const invoices = [
    { id: 'a', status: 'pending', total_usd: 100, total_lbp: 9_000_000 },
    { id: 'b', status: 'partial', total_usd: 50, total_lbp: 4_500_000 },
    { id: 'c', status: 'paid', total_usd: 30, total_lbp: 2_700_000 }, // not open → excluded
    { id: 'd', status: 'overdue', total_usd: 20, total_lbp: 0 },       // USD-priced → 0 LBP
  ]
  it('sums only OPEN invoices, netting their LBP payments; USD-priced adds nothing', () => {
    const pays = [
      { invoice_id: 'a', amount_usd: 0, amount_lbp: 3_000_000 }, // a: 9M − 3M = 6M
      { invoice_id: 'b', amount_usd: 0, amount_lbp: 0 },          // b: 4.5M
      { invoice_id: 'c', amount_usd: 0, amount_lbp: 2_700_000 },  // c excluded (paid)
    ]
    expect(outstandingLbp(invoices, pays)).toBe(6_000_000 + 4_500_000 + 0)
    expect(paidLbpByInvoice(pays).get('a')).toBe(3_000_000)
  })
  it('a refunded (net-zero) open invoice shows its full LBP balance again', () => {
    const pays = [
      { invoice_id: 'a', amount_usd: 0, amount_lbp: 9_000_000 },
      { invoice_id: 'a', amount_usd: 0, amount_lbp: -9_000_000 },
    ]
    // b + a(full) ; d is 0
    expect(outstandingLbp(invoices, pays)).toBe(9_000_000 + 4_500_000)
  })
})
