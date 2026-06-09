# Analysis — Billing Triggers & Notifications, the Lebanese Cash/OMT/Whish Reality

> **Created:** 2026-06-09 · **Auditor:** Project Auditor (read-only) · **Amends:** [`journey-billing-and-payment.md`](./journey-billing-and-payment.md) (D1).
> **Why:** before building D1, pin down the *logic* — **what triggers an invoice, how it's managed, what notifications fire and what they're tied to** — for a Lebanese gym that runs on **cash (USD & LBP), OMT, and Whish**, no card processing. Reviewed from three lenses: **gym management, member, coach**, with best-practice protocols + edge cases.

---

## 1. The core reframe: an invoice is an OBLIGATION, a payment is its SETTLEMENT

In a card-on-file gym (Mindbody/Glofox), "charge" and "pay" are one automated act. **In a cash/OMT/Whish gym they are two distinct events, often separated in time and place:**
- **Invoice = the obligation** ("this member owes $X for Y"), created when the member **commits** (signs up / renews / gets a PT pack approved / registers for a camp / a walk-in buys).
- **Payment = the settlement**, which may arrive **later** (member pays next visit), **remotely** (OMT/Whish transfer + reference), **in parts** (installments), or in **mixed currency** (part USD cash + part LBP).

So the system must hold a **pending obligation** and **reconcile** settlements against it over time. This is why the cosmetic as-is (payment that never reconciles the invoice — D1 §3) is the core break: it conflates nothing because the two halves were never linked.

---

## 2. How invoicing is TRIGGERED — tie it to COMMITMENT EVENTS, not to a billing page

Invoices are **never** created "in the billing module for their own sake." Each one is a **consequence of a commitment event owned by another journey:**

| Trigger event (owning journey) | Invoice type | When issued |
|---|---|---|
| Lead **convert** (A1, ✅) | `membership` | at onboarding |
| Membership **renewal** (D3, Phase 4) | `membership` | at renewal / before expiry |
| **PT approval** (22-R, ✅) | `pt_package` | on approve |
| **Camp registration** (E1) | `camp` | on register |
| **Rental booking** (E2) | `rental` | on book |
| **Manual / ad-hoc** (reception) | any | walk-in / correction |

**Recommendation — a single canonical issuance service `issue_invoice(...)`** that every one of these sites calls. It (a) inserts the invoice (TVA + number via the existing triggers), (b) links the originating entity, (c) sets `due_date` per policy, and (d) emits **`invoice_issued`** consistently. This makes issuance uniform (dual-currency, numbering, notification) instead of each journey hand-rolling an insert. D1 owns this service; other journeys *call* it.

**The walk-in "pay-now" case (very common in Lebanon):** issue + settle in **one motion** — `issue_invoice` immediately followed by `record_payment`, so the invoice is born `paid`. The UI should offer "Issue & record payment" as one action at the front desk, not two screens.

---

## 3. How invoicing is MANAGED — lifecycle, reconciliation, cash discipline

**Status lifecycle (cash model):** `pending` → (`partial`) → `paid`; plus `overdue` (due_date passed — *reminder*, not auto-charge; **D3/Phase 4**), `cancelled`, `refunded`. Status is **always derived from payments** (the reconciliation contract, D1 §5), never hand-set.

**Who manages:** reception issues + records + reconciles; owner oversees totals. **Coaches are excluded from billing entirely** (privacy + RLS — see §6).

**Management surfaces the gym actually needs:**
- **Outstanding view** — who owes what (pending/partial), sortable by amount/age. (The "soft dunning" worklist; the *automated* reminders are D3/Phase 4.)
- **Cash reconciliation** — daily totals **by method** (cash USD, cash LBP, OMT, Whish) so the front desk can reconcile the drawer + verify transfers. (Full analytics = Phase 4; a per-day/per-method tally is in-scope value for D1.)

---

## 4. Lebanese payment protocols (the mechanics that shape the model)

| Method (`payment_method_enum`) | Mechanics | System implication |
|---|---|---|
| **cash_usd / cash_lbp** | physical handover at the desk | record amount + currency; dual-currency split possible (part USD + part LBP) |
| **omt / whish** | member pays at an OMT/Whish agent (or app) → gets a **reference number** → sends it to the gym → gym **verifies** the transfer arrived | `reference_number` (in schema) + a **verification step** before it counts as settled |
| **bank_transfer / bob_finance** | slower, referenced | same: reference + verify |

**Three protocol realities the model must respect:**
1. **Dual-currency at payment time.** Invoice total is in **USD (stable)**; a payment in LBP records `amount_lbp` + the **`exchange_rate` used that day** and its `amount_usd` equivalent. Reconciliation sums `amount_usd` (canonical). LBP volatility ⇒ the rate is per-payment, not global.
2. **OMT/Whish is "claim then verify," not instant.** A member messages "I sent it, ref 12345." Best practice: record the payment with its reference but **don't count it as settled until staff verifies receipt** — otherwise a mistyped/false reference over-credits the member. → a **`verified`/pending-verification** distinction on transfer payments.
3. **Receipts are expected and currently manual.** A **printable + WhatsApp-able receipt** (gym, member, invoice #, amount USD+LBP, method, reference, date, balance) replaces the handwritten slip — high perceived value, Arabic-RTL.

---

## 5. How NOTIFICATIONS should be triggered — tie them to DOMAIN EVENTS, and face the channel reality

**Tie notifications to billing domain events, not UI clicks.** The event set:

| Event (what it's tied to) | Recipient | Notes |
|---|---|---|
| **`invoice_issued`** | member (+guardian) | the obligation exists — "you owe $X, due Y" |
| **`payment_received`** | member (+guardian) | a settlement landed — show amount + **remaining balance** (covers partial) |
| **`invoice_paid`** (fully settled) | member (+guardian) | optional distinct event when balance hits 0 (else fold into `payment_received` with balance=0) |
| **`payment_pending_verification`** | staff | an OMT/Whish claim needs verifying (the gym's worklist) |
| **`invoice_overdue`** | member (+guardian) | **D3/Phase 4** (time-triggered) — reminder, not a charge |
| **`invoice_refunded/voided`** | member (+guardian) | recovery event |

**Two hard truths that shape the design:**

**(a) The notification substrate can't reach login-less members yet.** `notifications.user_id` FKs `auth.users`, so a **gym-managed, login-less member cannot receive any in-app notification** (24-R finding; see [[notifications-fk-blocks-loginless]]). Most cash-gym members are login-less. Therefore:
- The **durable artifact is `portal/billing` + the receipt**, not the bell. Status/balance/receipt must be fully self-evident there (works today).
- Producers stay **best-effort** (try/catch; never block the financial write — the 23-R lesson).
- The **real member channel in Lebanon is WhatsApp** — `invoice_issued`/`payment_received` are exactly the producers that the WhatsApp adapter (Phase 6 / G1) will plug into. Design the event payloads now so WhatsApp delivery drops on top later.
- **Fix to schedule:** relax `notifications.user_id` → `profiles(id)` (or provision real logins, catalog A4) so the in-app path works for login-less members too.

**(b) What each notification is *tied to* (the wiring):**
- `invoice_issued` → fired **inside `issue_invoice`** (so every issuance path notifies uniformly).
- `payment_received` → fired **inside `record_payment`** *after* the atomic reconcile, with the post-payment **remaining balance** in the params.
- `payment_pending_verification` → fired when an OMT/Whish payment is recorded unverified (staff worklist).
- Recipient resolution reuses 24-R's `studentNotificationRecipients` (member + guardians). **Coaches are never billing recipients.**

---

## 6. The three perspectives

**Gym management (owner/reception)** — needs: fast issuance (incl. walk-in issue+pay in one motion); record any method incl. **split-currency**; **verify OMT/Whish** references before counting them; an **outstanding-balances** worklist; a **per-method daily tally** to reconcile the drawer; partial/installment support; rare refund/void with audit. Pain today: payments don't reconcile, `/invoices` is DOA, nothing reminds them who owes.

**Member (+ parent)** — needs: see what they owe + due date; pay easily (cash at desk, or OMT/Whish remotely + send reference); a **receipt/confirmation** (WhatsApp-able); see history + remaining balance. Reality: often **login-less** → relies on the receipt + (future) WhatsApp, and on `portal/billing` once provisioned. Parents pay for minors (guardian recipient).

**Coach** — **deliberately out of billing.** A coach delivers classes/PT; they must **not** see financial data (RLS keeps `invoices`/`payments` staff-only). The only billing-adjacent signal a coach legitimately needs is **"is this member in good standing / is their PT paid"** before delivering — and even that is better expressed as the PT assignment being `active`/credits available (C1), **not** by exposing invoices. → **No coach billing surface; no coach billing notifications.** (Explicitly noted so a future slice doesn't leak finances to coaches.)

---

## 7. Edge cases (Lebanese-specific, additive to D1 §8)

| # | Case | Designed behavior |
|---|---|---|
| L1 | **OMT/Whish unverified** | record with `reference_number` as **pending-verification**; **excluded from the reconciled balance** until staff marks it verified; `payment_pending_verification` → staff. |
| L2 | **False/duplicate reference** | duplicate `reference_number` on the same/any invoice → warn + require staff confirm (prevents over-credit). |
| L3 | **Split-currency payment** | one invoice settled by multiple payment rows (e.g. $20 cash_usd + 1.8M cash_lbp); reconcile on Σ`amount_usd`. |
| L4 | **Rate drift (LBP volatility)** | each payment records its own `exchange_rate`/`rate_date`; the member settles the **USD** obligation, LBP is the vehicle at that day's rate; documented, not averaged. |
| L5 | **LBP rounding** | reconcile on USD-canonical with a small epsilon; LBP shown for cash handling only. |
| L6 | **Walk-in issue+pay** | one-motion `issue_invoice`+`record_payment`; invoice born `paid`; single receipt. |
| L7 | **Pay before issue** | not allowed — a payment always targets an existing invoice (`record_payment(p_invoice_id, …)`); walk-ins use L6. |
| L8 | **Refund (cash returned out-of-band)** | `refund_invoice` sets status + audit + reference; no gateway refund; cash handed back is referenced, not processed. |
| L9 | **Overpayment** | blocked (D1 decided); no account-credit ledger in V1. |

---

## 8. Recommended amendments to the D1 design

1. **Two canonical services, not ad-hoc inserts:** **`issue_invoice(...)`** (the single issuance path; emits `invoice_issued`; called by convert/PT/camp/manual) + **`record_payment(...)`** (single settlement path; atomic reconcile; emits `payment_received`). Both staff-only, gym-scoped, audited.
2. **OMT/Whish verification state:** add a `verified` boolean (or `verified_at`/`verified_by`) to `payments`; **only verified payments count toward reconciliation**; cash is implicitly verified at the desk; `payment_pending_verification` → staff worklist.
3. **Notifications tied to events** (§5), **best-effort + login-aware**, recipients = member(+guardian), **never coaches**; payloads shaped for the future WhatsApp adapter.
4. **Management surfaces:** outstanding-balances worklist + per-method daily tally (cash USD/LBP/OMT/Whish), in addition to repairing the DOA `/invoices` page.
5. **Walk-in "issue & pay" one-motion** action at the front desk.
6. **Schedule the FK fix** (`notifications.user_id` → `profiles`) so member billing notifications can actually land for login-less members; until then, `portal/billing` + receipt is the source of truth.

These tighten D1 from "record a payment that updates a status" into "a cash-gym billing engine that mirrors how money actually moves in Lebanon."

---

## 9. Open forks for the user (these change D1's scope)

1. **OMT/Whish verification:** add a **`verified` state** (record-then-verify; unverified excluded from balance) — *recommended, matches reality* — vs **verify-then-record** (staff only records after confirming; simpler, no new column).
2. **Centralized issuance retrofit:** make `issue_invoice` the **single path** and retrofit convert (23-R) + PT-approval (22-R) to call it — *recommended for consistency* — vs **D1 adds issuance for manual/walk-in only** and leaves the existing auto-issuers as-is (less churn, but two issuance styles).
3. **Per-method cash-reconciliation tally in D1** (daily totals by method) — *recommended, high front-desk value* — vs **defer all reconciliation analytics to Phase 4** (keep D1 to record→reconcile→receipt + outstanding list).
