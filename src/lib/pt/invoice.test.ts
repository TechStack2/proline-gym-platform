import { describe, it, expect } from 'vitest';
import { buildPtInvoiceInsert, shouldBillPtPackage } from './invoice';

describe('shouldBillPtPackage', () => {
  it('bills positive-priced packages only', () => {
    expect(shouldBillPtPackage(200)).toBe(true);
    expect(shouldBillPtPackage(0)).toBe(false);
    expect(shouldBillPtPackage(-5)).toBe(false);
  });
});

describe('buildPtInvoiceInsert', () => {
  it('builds a dual-currency pt_package invoice with rate-derived LBP', () => {
    const inv = buildPtInvoiceInsert({
      gymId: 'gym-1',
      studentId: 'student-1',
      priceUsd: 200,
      priceLbp: null,
      exchangeRate: 90000,
      rateDate: '2026-06-08',
      dueDate: '2026-07-08',
      packageNameEn: 'Pack 5',
    });

    expect(inv.gym_id).toBe('gym-1');
    expect(inv.student_id).toBe('student-1');
    expect(inv.invoice_type).toBe('pt_package');
    expect(inv.amount_usd).toBe(200);
    expect(inv.amount_lbp).toBe(200 * 90000); // derived from the rate
    expect(inv.exchange_rate).toBe(90000);
    expect(inv.rate_date).toBe('2026-06-08');
    expect(inv.due_date).toBe('2026-07-08');
    expect(inv.status).toBe('pending');
    expect(inv.notes_en).toContain('Pack 5');
  });

  it('prefers an explicit LBP price over the rate-derived amount', () => {
    const inv = buildPtInvoiceInsert({
      gymId: 'gym-1',
      studentId: 'student-1',
      priceUsd: 200,
      priceLbp: 18_500_000,
      exchangeRate: 90000,
      rateDate: '2026-06-08',
    });
    expect(inv.amount_lbp).toBe(18_500_000);
  });

  it('leaves LBP at 0 and rate null when no rate is available', () => {
    const inv = buildPtInvoiceInsert({
      gymId: 'gym-1',
      studentId: 'student-1',
      priceUsd: 200,
      priceLbp: null,
      exchangeRate: null,
    });
    expect(inv.amount_lbp).toBe(0);
    expect(inv.exchange_rate).toBeNull();
    expect(inv.rate_date).toBeNull();
  });
});
