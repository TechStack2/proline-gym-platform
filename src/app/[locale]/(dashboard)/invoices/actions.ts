'use server';

/**
 * Billing server actions (Cycle 5 / Phase 1 / D1).
 *
 * Thin wrappers over the canonical SECURITY DEFINER services (000031):
 *   - issue_invoice  — the single issuance path (TVA/number via triggers,
 *     emits invoice_issued).
 *   - record_payment — the single settlement path (locks the invoice, blocks
 *     overpayment, recomputes status from Σ payments, emits payment_received).
 *   - refund_invoice / void_invoice — reference-only status transitions, audited.
 *
 * The actions run in a staff session, so the RPCs' is_staff()/get_user_gym_id()
 * gates and the invoices/payments RLS are the guardrails. No notification is
 * emitted here — the RPCs emit (best-effort) so issuance is uniform whether the
 * caller is TS (here) or SQL (convert_lead_to_member).
 */
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';
import { actionError } from '@/lib/errors/action-error';

type InvoiceRow = Database['public']['Tables']['invoices']['Row'];
type PaymentMethod = Database['public']['Enums']['payment_method_enum'];
type InvoiceType = Database['public']['Enums']['invoice_type_enum'];

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function issueInvoice(input: {
  studentId: string;
  invoiceType: InvoiceType;
  amountUsd: number;
  amountLbp?: number;
  exchangeRate?: number | null;
  rateDate?: string | null;
  membershipId?: string | null;
  dueDate?: string | null;
  notesEn?: string | null;
  notesAr?: string | null;
  notesFr?: string | null;
}): Promise<Result<InvoiceRow>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };
  const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single();
  if (!profile?.gym_id) return { ok: false, error: 'no_gym' };

  const { data, error } = await supabase.rpc('issue_invoice', {
    p_gym_id: profile.gym_id,
    p_student_id: input.studentId,
    p_invoice_type: input.invoiceType,
    p_amount_usd: input.amountUsd,
    p_amount_lbp: input.amountLbp ?? 0,
    p_exchange_rate: input.exchangeRate ?? null,
    p_rate_date: input.rateDate ?? null,
    p_membership_id: input.membershipId ?? null,
    p_due_date: input.dueDate ?? null,
    p_notes_en: input.notesEn ?? null,
    p_notes_ar: input.notesAr ?? null,
    p_notes_fr: input.notesFr ?? null,
  });
  if (error) return { ok: false, error: actionError(error) };
  revalidatePath('/invoices');
  return { ok: true, data: data as InvoiceRow };
}

export async function recordPayment(input: {
  invoiceId: string;
  amountUsd: number;
  amountLbp?: number;
  method: PaymentMethod;
  reference?: string | null;
  exchangeRate?: number | null;
  paymentDate?: string | null;
  // OFF-3: client-generated idempotency key for offline-recorded payments. When
  // present, a re-push of the same key no-ops (record_payment returns the invoice
  // unchanged) → exactly one canonical payment. Online single-fire passes null.
  clientUuid?: string | null;
}): Promise<Result<InvoiceRow>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const { data, error } = await supabase.rpc('record_payment', {
    p_invoice_id: input.invoiceId,
    p_amount_usd: input.amountUsd,
    p_amount_lbp: input.amountLbp ?? 0,
    p_method: input.method,
    p_reference: input.reference ?? null,
    p_exchange_rate: input.exchangeRate ?? null,
    p_payment_date: input.paymentDate ?? null,
    p_client_uuid: input.clientUuid ?? null,
  });
  if (error) return { ok: false, error: actionError(error) };
  revalidatePath('/invoices');
  revalidatePath(`/invoices/${input.invoiceId}`);
  return { ok: true, data: data as InvoiceRow };
}

export async function refundInvoice(invoiceId: string, reason?: string): Promise<Result<InvoiceRow>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('refund_invoice', { p_invoice_id: invoiceId, p_reason: reason ?? null });
  if (error) return { ok: false, error: actionError(error) };
  revalidatePath('/invoices');
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true, data: data as InvoiceRow };
}

export async function voidInvoice(invoiceId: string, reason?: string): Promise<Result<InvoiceRow>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('void_invoice', { p_invoice_id: invoiceId, p_reason: reason ?? null });
  if (error) return { ok: false, error: actionError(error) };
  revalidatePath('/invoices');
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true, data: data as InvoiceRow };
}

/** Duplicate-reference soft check (E10): warn before recording a second payment
 *  with the same reference on the same invoice. Non-blocking. */
export async function referenceExists(invoiceId: string, reference: string): Promise<boolean> {
  if (!reference.trim()) return false;
  const supabase = await createClient();
  const { count } = await supabase
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('invoice_id', invoiceId)
    .eq('reference_number', reference.trim());
  return (count ?? 0) > 0;
}

/**
 * OFF-4 — the server's authoritative state for an invoice, for reconciling a
 * conflicted offline payment (show staff the real status + balance before they
 * re-submit corrected or discard). Gym-scoped by the invoices/payments RLS.
 */
export async function getInvoiceState(
  invoiceId: string,
): Promise<{ status: string; totalUsd: number; balanceUsd: number } | null> {
  const supabase = await createClient();
  const { data: inv } = await supabase
    .from('invoices').select('total_usd, status').eq('id', invoiceId).maybeSingle();
  if (!inv) return null;
  const { data: pays } = await supabase.from('payments').select('amount_usd').eq('invoice_id', invoiceId);
  const paid = (pays ?? []).reduce((s, p) => s + Number(p.amount_usd ?? 0), 0);
  return {
    status: inv.status as string,
    totalUsd: Number(inv.total_usd),
    balanceUsd: Number((Number(inv.total_usd) - paid).toFixed(2)),
  };
}

/**
 * OFF-4 — discard a conflicted offline payment intent WITH an audit trail (never a
 * silent drop). Writes the audit row server-side (000063); the client deletes the
 * Dexie queue intent only on success. A reason is mandatory.
 */
export async function discardOfflinePayment(input: {
  opId: string; invoiceId: string; amountUsd: number; reason: string;
}): Promise<Result<true>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };
  const { error } = await supabase.rpc('discard_offline_payment', {
    p_op_id: input.opId,
    p_invoice_id: input.invoiceId,
    p_amount_usd: input.amountUsd,
    p_reason: input.reason,
  });
  if (error) return { ok: false, error: actionError(error) };
  return { ok: true, data: true };
}
