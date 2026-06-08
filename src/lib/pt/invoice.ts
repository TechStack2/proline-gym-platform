/**
 * PT auto-billing helper (Cycle 5 / Prompt 22, gap M-A3).
 *
 * Pure builder for the dual-currency invoice created when a PT request is
 * approved. The DB triggers (`trg_generate_invoice_number`,
 * `trg_calculate_invoice_totals`) overwrite `invoice_number` and the tax/total
 * columns on INSERT, so the placeholders here are intentional — they exist only
 * to satisfy the NOT NULL / typed Insert contract.
 */
import type { Database } from '@/types/database';

type InvoiceInsert = Database['public']['Tables']['invoices']['Insert'];

export type PtInvoiceParams = {
  gymId: string;
  studentId: string;
  priceUsd: number;
  priceLbp?: number | null;
  /** Latest gym exchange rate (USD→LBP); null if none on record. */
  exchangeRate?: number | null;
  /** ISO date (yyyy-mm-dd) of that rate. */
  rateDate?: string | null;
  /** ISO date (yyyy-mm-dd); defaults to 30 days out. */
  dueDate?: string;
  packageNameEn?: string | null;
  packageNameAr?: string | null;
  packageNameFr?: string | null;
};

/** A PT package is billed only when it has a positive price. */
export function shouldBillPtPackage(priceUsd: number): boolean {
  return Number.isFinite(priceUsd) && priceUsd > 0;
}

function defaultDueDate(): string {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

export function buildPtInvoiceInsert(params: PtInvoiceParams): InvoiceInsert {
  const {
    gymId, studentId, priceUsd, priceLbp, exchangeRate, rateDate, dueDate,
    packageNameEn, packageNameAr, packageNameFr,
  } = params;

  const amountLbp =
    priceLbp != null
      ? priceLbp
      : exchangeRate != null && exchangeRate > 0
        ? Math.round(priceUsd * exchangeRate)
        : 0;

  return {
    gym_id: gymId,
    student_id: studentId,
    invoice_type: 'pt_package',
    amount_usd: priceUsd,
    amount_lbp: amountLbp,
    exchange_rate: exchangeRate ?? null,
    rate_date: rateDate ?? null,
    due_date: dueDate ?? defaultDueDate(),
    status: 'pending',
    notes_en: packageNameEn ? `PT package: ${packageNameEn}` : null,
    notes_ar: packageNameAr ? `باقة تدريب خاص: ${packageNameAr}` : null,
    notes_fr: packageNameFr ? `Forfait coaching privé : ${packageNameFr}` : null,
    // Overwritten by DB triggers on INSERT — present only for the typed contract.
    invoice_number: '',
    total_usd: priceUsd,
  };
}
