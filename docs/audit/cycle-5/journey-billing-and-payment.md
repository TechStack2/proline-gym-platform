# Journey Design — Billing & Payment (Invoice → Notify → Pay → Reconcile → Receipt)

> **Created:** 2026-06-09 · **Auditor:** Project Auditor (read-only — design, not code)
> **Status:** DESIGN — awaiting sign-off before the rebuild prompt.
> **This is D1 in** [`../journey-catalog.md`](../journey-catalog.md) — the **record→reconcile** half of money. It rounds out Phase 1: it's where every invoice (from Lead-convert, PT-approval, manual, or a future renewal) gets **paid and reconciled**. The **time-triggered dunning/overdue/renewal automation is D3 / Phase 4** and out of scope here.
> **Method:** as-is verified against code + schema; to-be targets **L3 Managed**.
> **Decided forks:** partial payments = **full support**; overpayment = **blocked**; receipts = **printable view in scope**.

---

## 0. Why this journey, why now (strategic context)

**Benchmark** ([`industry-benchmark.md`](../industry-benchmark.md)): Billing *record* is **4/5 "At Par / Ahead"** (dual-currency invoices) — but **reconciliation is 1/5** and the payment→invoice link is **cosmetic**. PRO LINE is **cash/OMT/Whish by design** (no card processing — [CLAUDE.md](../../CLAUDE.md) #5), so the industry "autopay + dunning" best practice **translates** to *record → reconcile → reference-track → reminder*. This journey delivers the **record→reconcile** core.

**Roadmap** ([`platform-elevation-roadmap.md`](../platform-elevation-roadmap.md)): **Phase 1** connective tissue (the payment handoff) + an owned **leaf-rot repair** (the DOA `/invoices` page, per [[strangle-validated-leaf-rot]]).
- **Do NOT build now (Phase 4 / D3):** expiry/renewal nudges, overdue/dunning reminders, `auto_renew` consumption, cash-reconciliation *analytics*. **Account-credit balances** (overpayment surplus) are deferred (we **block** overpayment).
- **Leapfrog lanes:** dual-currency is first-class here (the differentiator); Arabic-RTL receipt; WhatsApp-friendly `payment_received` (the producer is the future WhatsApp plug-in point).

---

## 0.1 Origination layer (how an INVOICE enters the system)

D1 is the convergence point for every invoice, regardless of source:
- **Auto (event-driven):** Lead **convert** → membership invoice (✅ 23-R); **PT approval** → pt_package invoice (✅ 22-R); membership **renewal** → renewal invoice (**Phase 4**, deferred).
- **Staff-manual:** `invoice-form` ([invoice-form.tsx](../../src/app/[locale]/(dashboard)/invoices/components/invoice-form.tsx)) — ad-hoc invoice.
- **Automated (recurring):** scheduled renewal/dues run → **Phase 4**.

D1 owns what happens **after** issue (notify → pay → reconcile → receipt), and standardizes the **`invoice_issued`** handoff across these origination sites.

---

## 1. Journey at a glance

```
  INVOICE ISSUED ──invoice_issued──▶ member sees it (portal/billing)
   (convert/PT/manual/renewal)             │
        │                                  ▼  member pays cash / OMT / Whish (with reference)
        ▼                          ┌──────────────────────────────┐
   status=pending                  │ staff RECORDS payment         │
        │                          │ record_payment RPC (atomic):  │
        │                          │  insert payment + RECONCILE    │
        │   ┌──────── reconcile ───┤  status from Σpayments vs total│
        ▼   ▼                      └──────────────┬────────────────┘
   pending → PARTIAL → PAID (+paid_at)            ▼
        │                              payment_received → member + RECEIPT (printable)
        ▼                                          │
   admin reconciliation view (who owes what) ◀─────┘     refund/void → status=refunded (restore)
```

**Happy path:** issue → notify → pay → record (auto-reconcile) → receipt + notify. **Branches:** partial (installments), overpayment (blocked), dual-currency payment, refund/void, payment-against-cancelled (blocked).

---

## 2. The cast & the surfaces

| Actor | Role | Surface |
|---|---|---|
| **Reception / Owner** | records payments, reconciles, refunds, issues manual invoices | `(dashboard)/payments` ([payment-form](../../src/app/[locale]/(dashboard)/payments/components/payment-form.tsx)); `(dashboard)/invoices` (**DOA → repair**) |
| **Member / parent** | sees invoices + status + receipts | `portal/billing` ([page](../../src/app/[locale]/portal/billing/page.tsx)) |
| **System** | fires handoffs | bell + `/notifications` |

---

## 3. As-is teardown (verified — the rip-out / fix list)

### Record payment · **L1 (cosmetic — doesn't reconcile)**
- `payment-form` inserts a `payments` row ([payment-form.tsx:56](../../src/app/[locale]/(dashboard)/payments/components/payment-form.tsx#L56)) but performs **no `invoices.status` update**, and **no DB trigger** links payments→invoice (only `trg_audit_payments`). → an invoice stays **`pending` forever** after it's paid. The billing loop is cosmetic, exactly like the pre-23-R convert.
- The insert sets `status: 'completed'` — but `payments` has **no `status` column** (schema: invoice_id, student_id, received_by, amount_usd/lbp, exchange_rate, rate_date, payment_method, payment_date, reference_number, notes — [000003:167-181](../../supabase/migrations/000003_create_operational_tables.sql#L167)). → the insert is **likely failing** (DOA write). Verify + fix.

### Admin `/invoices` page · **DOA (L0)**
Triple breakage ([invoices/page.tsx:33-60](../../src/app/[locale]/(dashboard)/invoices/page.tsx#L33)): selects `membership_plans.name` (only `name_ar/en/fr` exist); orders by `issue_date` (no such column — invoices has `created_at`/`due_date`/`paid_at`); searches embedded `students.*` via a top-level `.or()` (the broken pattern from 23-R). The page cannot render its list.

### Handoffs · **absent (L0)**
No `invoice_issued` / `payment_received` producers (grep empty).

### Works (don't regress)
- Member billing **visibility** — `portal/billing` lists invoices (status/total/due/paid_at) + payments + active membership ([portal/billing/page.tsx:16-34](../../src/app/[locale]/portal/billing/page.tsx#L16)). Benchmark 3/5.
- Invoice **creation** — auto (convert/PT) + manual (invoice-form); TVA/number via triggers ([000005:173-217](../../supabase/migrations/000005_create_triggers.sql#L173)).

**Verdict:** invoices get *created* and *shown*, but **payment doesn't reconcile them, the admin list is DOA, and nothing notifies.** The money loop doesn't close.

---

## 4. The data spine (verified schema)

```
invoices (total_usd, total_lbp, status, due_date, paid_at, invoice_type, student_id, gym_id)
   ▲  reconcile (Σ payments vs total)                │ invoice_issued
   │                                                 ▼
payments (invoice_id, amount_usd, amount_lbp, exchange_rate, payment_method,    member (portal/billing)
   reference_number, received_by, payment_date)      │ payment_received
exchange_rates (USD↔LBP)        audit_logs ◀── payment/refund moves
```

| Table | Key columns | Source |
|---|---|---|
| `invoices` | `total_usd`, `total_lbp`, **`status`** (pending/paid/overdue/cancelled/refunded/**partial**), `due_date`, `paid_at` | [000003:134-159](../../supabase/migrations/000003_create_operational_tables.sql#L134); status enum [000001:39-41](../../supabase/migrations/000001_create_enums.sql#L39) |
| `payments` | `invoice_id`, `amount_usd`, `amount_lbp`, `exchange_rate`, **`payment_method`** (cash_usd/cash_lbp/omt/whish/bank_transfer/bob_finance), **`reference_number`**, `received_by`, `payment_date` | [000003:167-181](../../supabase/migrations/000003_create_operational_tables.sql#L167); methods [000001:34-36](../../supabase/migrations/000001_create_enums.sql#L34) |
| `exchange_rates` | USD↔LBP rate + date | dual-currency normalization |
| `audit_logs` | old/new JSONB, changed_by | payment/refund audit |

**The canonical amount is `amount_usd`** (invoices carry `total_usd`; payments carry `amount_usd` + the `exchange_rate` used). Reconciliation sums `payments.amount_usd` vs `invoices.total_usd`.

---

## 5. The reconciliation contract (the heart)

A new **`record_payment(p_invoice_id, p_amount_usd, p_amount_lbp, p_method, p_reference, p_exchange_rate, p_payment_date)`** RPC (staff-only, gym-scoped, SECURITY DEFINER) is the **single writer of payment + invoice status**:
1. **Lock** the invoice; reject if `status ∈ {cancelled, refunded}`.
2. Compute `paid_so_far = Σ payments.amount_usd` for the invoice; **block overpayment**: reject if `paid_so_far + p_amount_usd > total_usd` (small rounding epsilon allowed).
3. Insert the `payments` row (method, reference, received_by, rate).
4. **Recompute status atomically:** `new_total ≥ total_usd` → `paid` + `paid_at=now()`; `> 0` → `partial`; else `pending`.
5. Write `audit_logs`.

Status is thus **always derived from payments** — it can never drift. Refund/void is a sibling RPC with the same lock + recompute + audit.

---

## 6. To-be transactions (L3 Managed)

Notifications via the **sanctioned F2 pattern** (authed client, recipient `profile_id`, RETURNING-free; guardian fan-out for minors).

### T1 — Issue (origination)
- Standardize **`invoice_issued`** → member (+guardian) at each issue site. **In scope now:** the manual `invoice-form` path. **Light retrofit:** convert (23-R) + PT-approval (22-R) RPCs emit it too (one call each) — or flagged as an immediate follow-up if it risks those surfaces.
- **Acceptance:** issuing an invoice notifies the member; it appears in `portal/billing` as `pending`.

### T2 — Record payment (the reconcile)
- `record_payment` (§5): atomic insert + status recompute; **blocks overpayment**; **fixes the `status` column bug** in the form.
- **Notifies:** **`payment_received`** → member (+guardian), with amount + remaining balance.
- **Acceptance:** recording a payment flips the invoice pending→partial→paid correctly (sum-based), sets `paid_at` on full payment, blocks overpayment, and notifies.

### T3 — Receipt (printable)
- A printable/shareable **receipt view** (gym, member, invoice #, line items, **amount in USD + LBP**, method, reference, date), Arabic-RTL. Reachable from the payment + the member's `portal/billing`.
- **Acceptance:** a recorded payment yields a correct dual-currency receipt.

### T4 — Admin reconciliation view (+ `/invoices` repair)
- **Repair the DOA `/invoices` page** (fix `name`→`name_*`, `issue_date`→`created_at`/`due_date`, embedded `.or()`→a proper search). Add a **reconciliation view**: per-member outstanding balance, pending/partial/paid, totals — the "who owes what" rollup (cash-model reconciliation; analytics dashboards stay Phase 4).
- **Acceptance:** `/invoices` renders + searches; staff can see outstanding balances.

### T5 — Refund / Void (edge/recovery)
- `refund_invoice` / `void_invoice` (staff-only): set `status='refunded'`/`cancelled`, record a reversing audit entry (and a negative/refund payment row if money was returned). Guarded; audited.
- **Acceptance:** a paid invoice can be refunded/voided with an audit trail; status reflects it.

### T6 — Member visibility (state-back)
- `portal/billing` shows each invoice's **live reconciled status**, payment history, **remaining balance**, and the receipt link.
- **Acceptance:** the member sees accurate status + balance that reconcile with the payments.

---

## 7. Cross-portal propagation matrix

| Transaction | Admin | Member portal | Notifications |
|---|---|---|---|
| T1 Issue | invoice in list (pending) | invoice appears | `invoice_issued` → member |
| T2 Record | status auto-reconciles; balance ↓ | status pending→partial→paid; balance ↓ | `payment_received` → member |
| T3 Receipt | printable receipt | receipt link | — |
| T4 Reconcile | `/invoices` works + outstanding view | — | — |
| T5 Refund/Void | status refunded/cancelled + audit | status reflects | (optional) |
| T6 Visibility | — | live status + balance + history | bell reflects |

---

## 8. Error recovery & edge cases (first-class)

| # | Case | Designed behavior |
|---|---|---|
| E1 | **Overpayment** | rejected (`paid_so_far + new > total_usd`), clear message; no account-credit ledger (deferred). |
| E2 | **Partial / installments** | each payment recomputes status; `partial` until Σ ≥ total, then `paid` + `paid_at`. |
| E3 | **Dual-currency payment** | a payment in LBP (cash_lbp/omt/whish) carries its `amount_usd` + `exchange_rate`; reconciliation sums `amount_usd`. Rate drift between invoice and payment is honored via the payment's recorded rate; documented. |
| E4 | **Duplicate payment** (same reference re-entered) | warn on a duplicate `reference_number` for the same invoice; staff confirm or cancel (avoids double-credit). |
| E5 | **Payment on cancelled/refunded invoice** | rejected by the RPC. |
| E6 | **Concurrent payments** (two staff) | invoice row lock serializes; the second sees the updated balance / overpayment block. |
| E7 | **Refund after paid** | `refund_invoice` reverses status + records the reversal; auditable; restores nothing to credits (cash returned out-of-band, referenced). |
| E8 | **Zero / negative amount** | rejected. |
| E9 | **Rounding (LBP)** | reconcile on `amount_usd` (canonical) with a small epsilon; LBP shown for cash handling, not the source of truth. |
| E10 | **`status` column bug** | the form's bogus `payments.status` insert is removed; payment shape matches the schema. |
| E11 | **Partial failure** | insert + status recompute are one transaction → payment and status never diverge. |
| E12 | **Notify failure non-fatal** | the atomic payment/reconcile is fatal; `payment_received` is best-effort after (23-R lesson). |

---

## 9. As-is → To-be gap + maturity ladder

| Transaction | As-is | Target | Gap |
|---|:--:|:--:|---|
| T1 Issue | L1 | **L3** | standardize `invoice_issued` |
| T2 Record/Reconcile | L1 (cosmetic) | **L3** | `record_payment` atomic + sum-based status; overpayment block; fix status-col bug; `payment_received` |
| T3 Receipt | L0 | **L3** | printable dual-currency receipt |
| T4 Reconcile view | L0 (DOA) | **L3** | repair `/invoices`; outstanding-balance view |
| T5 Refund/Void | L0 | **L3** | guarded + audited refund/void |
| T6 Visibility | 3 | **L3** | live reconciled status + balance |

**In scope:** `record_payment` + `refund/void` RPCs, the `/invoices` DOA repair, the reconciliation view, the receipt view, the two notification producers, and a behavior-green e2e spec (incl. E1/E2/E3/E5).
**Deferred:** dunning/overdue/renewal automation (D3/Phase 4), account-credit balances, retention/cash analytics dashboards (Phase 4).

---

## 10. Open decisions for the user

Forks decided (partial-support; block overpayment; printable receipt). Defaults I'll take unless redirected:
1. **`invoice_issued` retrofit scope:** wire it on the manual path now + add a one-line emit to the convert (23-R) and PT-approval (22-R) RPCs. *Default = yes, light retrofit* (so every issued invoice notifies). If you'd rather not touch those RPCs, I'll scope `invoice_issued` to the manual path only and flag the rest.
2. **Reconciliation canonical currency:** sum on `amount_usd`. *Default = USD canonical* (matches `total_usd`).
3. **Refund money handling:** status + audit + reference only (cash returned out-of-band, Lebanese model); no payment-gateway refund. *Default = reference-only.*

---

## 11. Rebuild-slice definition (seeds the coder prompt — not the prompt itself)

**One sequential slice on the current base** (runs after C1).
- **Migrations:** `record_payment` (atomic, sum-based reconcile, overpayment-blocked, audited); `refund_invoice`/`void_invoice`; confirm/repair the `payments` insert contract (drop the bogus `status`).
- **UI:** fix `payment-form` to call `record_payment`; **repair the DOA `/invoices` page** + add the outstanding-balance reconciliation view; a **printable receipt** view; surface live status/balance in `portal/billing`; Arabic-RTL; i18n (ar/en/fr) for `invoice_issued`/`payment_received` + new strings, no `MISSING_MESSAGE`.
- **Notifications:** `invoice_issued` (issue sites) + `payment_received` (on payment), sanctioned pattern + guardian fan-out.
- **Behavior-green e2e:** issue → `invoice_issued`; record full payment → `paid` + `payment_received` + receipt; record partial → `partial` then `paid`; **overpayment blocked (E1)**; dual-currency payment reconciles (E3); payment-on-cancelled rejected (E5). Cloud DB, CI; fail loudly.
- **Strategic-context block** + **F2 hygiene** + a candid **drag read** (does the strong billing base make reconcile clean, or does the DOA `/invoices` + missing linkage fight us?).

---

*Awaiting sign-off. On approval the D1 prompt is written, to run after C1 (sequential). With D1, Phase 1 (Connective Tissue) is complete — next we re-score the portals and decide Phase 2 entry.*
