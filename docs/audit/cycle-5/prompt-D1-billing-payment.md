# CODER PROMPT D1 — Billing & Payment: Clean Build (single sequential slice)

> **For:** Coding agent (ONE agent, sequential) · **Issued by:** Project Auditor · **Sequence:** Phase 1, **after TI** (the suite is now deterministic — ephemeral per-run gym). Branch `prompt-d1-billing` off `main`. **D1 CLOSES Phase 1.**
> **Strangler framing:** build ONE journey on the current base + report a candid **drag read**.
> **The spec is the design doc + the Lebanese re-review — read both first; binding:**
> 📎 [`docs/audit/cycle-5/journey-billing-and-payment.md`](./journey-billing-and-payment.md)
> 📎 [`docs/audit/cycle-5/analysis-billing-triggers-and-notifications-lebanon.md`](./analysis-billing-triggers-and-notifications-lebanon.md)
> Hand verbatim. Self-contained.

---

## Role, Skill, Lens
- **Act as `architect` + `database-reviewer`** (`/Arsenal/ecc/agents/`): `architect` models the two canonical services (issue + settle); `database-reviewer` verifies the reconcile RPC is atomic, sum-based, overpayment-safe, and that status can never drift from payments. `tdd-guide` for the notification side-effects.
- **Apply superpower `test-driven-development`**: failing assertions first — "a full payment flips the invoice to paid + sets paid_at"; "two partials → partial then paid"; "overpayment is rejected"; "a dual-currency payment reconciles on amount_usd"; "payment on a cancelled invoice is rejected". Then `verification-before-completion`: **green in the e2e harness in CI**, not `tsc`/`build`.
- **Lens:** invoice = **obligation**, payment = **settlement** (two events, cash model). Vertical slice: issue → notify → pay → reconcile → receipt → state-back. **L3 Managed**.

## Strategic context — what this closes / does NOT
**Benchmark** ([`industry-benchmark.md`](../industry-benchmark.md)): billing *record* is 4/5 but **reconcile is 1/5** and the payment→invoice link is **cosmetic** (a payment never updates the invoice; `/invoices` admin page is DOA). This delivers the **record→reconcile** core → L3, and closes **Phase 1**.
- **Do NOT build now (Phase 4 / D3):** expiry/renewal nudges, overdue/dunning reminders, `auto_renew`, retention/cash *analytics dashboards*, **account-credit balances** (overpayment is **blocked**, not banked).
- **Leapfrog lanes:** dual-currency is first-class here; Arabic-RTL receipt; WhatsApp-friendly `payment_received` (the future WhatsApp plug-in point).

## ⚠️ Notification reality (login-less members)
`notifications.user_id` FKs `auth.users`, so **login-less gym-managed members can't receive in-app notifications** (a converted member from 23-R is login-less). Therefore: producers are **best-effort** (try/catch; never block the financial write); the **durable truth is `portal/billing` + the receipt**, which must be fully self-evident. (The FK fix is a separate scheduled item — do NOT solve it here.)

## Sanctioned NOTIFICATION pattern (F2)
`createNotification` / `createNotificationForRole` directly from the staff Server Action, authed client + recipient `profile_id`, **RETURNING-free**. Guardian fan-out for minors. **Coaches are NEVER billing recipients** (RLS keeps `invoices`/`payments` staff-only).

---

## What you are building (design §5–§6 + the Lebanese decisions §8/§10)

### Two canonical services (single paths — no ad-hoc inserts)
1. **`issue_invoice(...)`** — the **single issuance path** (staff-only, gym-scoped): inserts the invoice (TVA + number via existing triggers), links the originating entity, sets `due_date`, and emits **`invoice_issued`** → member (+guardian, best-effort). **Retrofit convert (23-R `convert_lead_to_member`) + PT-approval (22-R `approvePtRequest`) to issue through this service** (preserve their existing behavior; just route invoice creation + the notification through `issue_invoice`). Camp/rental/renewal adopt it later.
2. **`record_payment(p_invoice_id, p_amount_usd, p_amount_lbp, p_method, p_reference, p_exchange_rate, p_payment_date)`** — the **single settlement path** (staff-only, gym-scoped): **lock** the invoice; reject if `status ∈ {cancelled, refunded}`; **block overpayment** (`Σ amount_usd + new > total_usd`, small epsilon); insert the payment; **recompute status atomically** — `Σ ≥ total_usd` → `paid` + `paid_at`; `> 0` → `partial`; else `pending`; write `audit_logs`; emit **`payment_received`** → member (+guardian) with the **remaining balance** in params. **Fix the bogus `payments.status` insert** in `payment-form` (no such column).

### Lebanese protocols (decided)
- **Verify-then-record** for OMT/Whish: staff records only after confirming the transfer; **no `verified` column / no pending-verification state** this slice. Cash is at-desk.
- **Dual-currency:** a payment may be `cash_lbp/omt/whish` (LBP, with `exchange_rate`/`rate_date`) or `cash_usd`; reconcile on **`amount_usd`** (canonical, matches `total_usd`); LBP rounding tolerated via epsilon. **Split-currency** = multiple payment rows on one invoice.
- **Walk-in "issue & pay" one-motion** front-desk action: `issue_invoice` immediately followed by `record_payment` → invoice born `paid`, single receipt.

### Surfaces
- **Repair the DOA `/invoices` page** (fix `membership_plans.name`→`name_*`, `issue_date`→`created_at`/`due_date`, the embedded `students.*` `.or()` search) + add an **outstanding-balances** view (who owes what) and a **per-method daily tally** (cash USD, cash LBP, OMT, Whish) for drawer reconciliation.
- **Printable receipt** view (gym, member, invoice #, line, **amount USD + LBP**, method, reference, date, balance), Arabic-RTL, reachable from the payment + `portal/billing`.
- `portal/billing`: live reconciled status + remaining balance + receipt link.
- **Refund/void** (`refund_invoice`/`void_invoice`, staff-only): status + audit + reference (cash returned out-of-band; **reference-only**, no gateway).
- **X1 gym selector** (added by TI) — leave intact; this slice doesn't touch it.

### i18n
- Add `notifications.invoice_issued`, `notifications.payment_received` (`.title`/`.body`, with balance param) + new UI strings to **ar/en/fr**; no `MISSING_MESSAGE`.

## Error recovery & edge cases (acceptance items)
Overpayment **rejected**; partial → `partial` then `paid`; **dual-currency reconcile on amount_usd**; payment on **cancelled/refunded** invoice rejected; **concurrent payments** serialized by the invoice row lock; duplicate `reference_number` → warn; LBP rounding epsilon; the `payments.status` bug removed; **partial-failure rolls back payment + status together**; notification best-effort (never un-settles).

## Lock it under the harness (now deterministic)
Add `e2e/billing.spec.ts` — runs **in the ephemeral run gym** using the TI helpers (`visibleShell`, `expectNotification` via the `/notifications` page, `runId`). Assert on the cloud DB: issue → `invoice_issued` + pending in `portal/billing`; full payment → `paid` + `paid_at` + `payment_received` + receipt; partial → `partial` then `paid`; **overpayment rejected**; **dual-currency payment reconciles**; payment on cancelled **rejected**. Idempotent; fail loudly.

## Acceptance Criteria
1. Full billing slice **green in E2E CI** (run ID + URL); screenshots.
2. `record_payment` is the single settlement writer; status is **always derived from payments** (never hand-set), atomic, overpayment-blocked.
3. `issue_invoice` is the single issuance path; convert + PT-approval route through it + fire `invoice_issued`.
4. `/invoices` renders + searches; outstanding-balances + per-method daily tally present; printable dual-currency receipt; `portal/billing` shows live status + balance.
5. Refund/void works (status + audit + reference). Notifications best-effort, member+guardian, **coaches excluded**.
6. `tsc` + `next build` clean. No RLS/auth weakened; billing stays staff-only; the `payments.status` bug fixed.

> **Honesty rule:** verify in the E2E CI run; if the sandbox can't run the browser, push so `e2e.yml` runs and report the actual run ID; do **not** fabricate.

## Hygiene
Scope every `git add` (never `-A`); `node_modules` gitignored; branch `prompt-d1-billing` off `main`; non-3000 dev port; use the TI helpers (don't re-introduce raw `:visible`); login `button[type="submit"]`.

## REQUIRED — Update the shared progress file
Append to **`audit-cycle-update.md`**, heading `## Cycle 5 / Phase 1 / Prompt D1 — Billing & Payment`. Include: a per-transaction PASS/FAIL table (issue/record/receipt/reconcile-view/refund/visibility) with **file:line**, the CI run ID/URL, migrations (the two RPCs + refund/void + the convert/PT retrofit), notification recipients (best-effort + login-aware note), the `/invoices` repair, an explicit **"Billing slice behavior-green: PASS/FAIL"** line, AND a candid **DRAG READ** (did the deterministic suite + the canonical-service idiom make this clean? did the DOA `/invoices` repair add cost?).

## Scope discipline & hand-back
Billing record→reconcile→receipt + the `/invoices` repair + reconciliation views only. No dunning/renewal automation, no account-credit, no analytics dashboards, no FK fix. Stop after updating `audit-cycle-update.md`; report behavior-green + drag read. **D1 closes Phase 1** → next the auditor re-scores Portals A–D vs the benchmark and proposes Phase-2 entry.

---

### Copy-paste pointer for the coder
```text
You are the coding agent for the PRO LINE Gym Platform.
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-d1-billing off main (git checkout main && git pull && git checkout -b prompt-d1-billing).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-D1-billing-payment.md
  docs/audit/cycle-5/journey-billing-and-payment.md                          (authoritative anatomy)
  docs/audit/cycle-5/analysis-billing-triggers-and-notifications-lebanon.md  (Lebanese logic — binding)

Build BILLING & PAYMENT (closes Phase 1). Today payment is cosmetic (a payments row that never
reconciles the invoice; inserts a non-existent payments.status column) and /invoices is DOA.
Two canonical services:
  issue_invoice(...) — the SINGLE issuance path (staff-only, gym-scoped): insert invoice (triggers do
    TVA/number), link entity, set due_date, emit invoice_issued (member+guardian, best-effort). RETROFIT
    convert_lead_to_member (23-R) + approvePtRequest (22-R) to issue through it (keep their behavior).
  record_payment(invoice, amount_usd, amount_lbp, method, reference, rate, date) — the SINGLE settlement
    path: lock invoice; reject if cancelled/refunded; BLOCK overpayment (Σamount_usd+new>total_usd, epsilon);
    insert payment; recompute status atomically (Σ>=total→paid+paid_at; >0→partial; else pending); audit;
    emit payment_received with remaining balance. FIX the bogus payments.status insert in payment-form.
Lebanese (decided): verify-then-record for OMT/Whish (NO verified state); dual-currency reconcile on
amount_usd (LBP at pay-day rate, epsilon rounding; split-currency = multiple rows); walk-in "issue & pay"
one-motion. Surfaces: REPAIR the DOA /invoices page (name→name_*, issue_date→created_at, embedded .or()
search) + outstanding-balances view + per-method daily tally (cash USD/LBP/OMT/Whish); printable dual-
currency receipt (Arabic-RTL); portal/billing live status+balance+receipt; refund_invoice/void_invoice
(reference-only, audited). Notifications: sanctioned pattern, RETURNING-free, member+guardian, COACHES
EXCLUDED; best-effort + login-aware (notifications.user_id FKs auth.users → login-less members can't
receive; portal/billing+receipt is the durable truth — do NOT fix the FK here). i18n ar/en/fr; no
MISSING_MESSAGE. Edge cases are acceptance items: overpayment rejected, partial→paid, dual-currency
reconcile, payment-on-cancelled rejected, concurrent lock, duplicate-reference warn, rounding epsilon,
partial-failure rollback. Add e2e/billing.spec.ts IN THE EPHEMERAL RUN GYM using the TI helpers
(visibleShell, expectNotification via /notifications page, runId): issue→invoice_issued; full pay→paid+
receipt; partial→partial→paid; overpayment rejected; dual-currency reconcile; pay-on-cancelled rejected.
Verify in the E2E CI run, not tsc; if the sandbox can't run the browser, push so e2e.yml runs and report
the real run ID; do NOT fabricate. Scope every git add (never -A); node_modules gitignored; use the TI
helpers (no raw :visible); don't weaken RLS/auth; keep billing staff-only.
When done, append to audit-cycle-update.md under "Cycle 5 / Phase 1 / Prompt D1 — Billing & Payment" with
a per-transaction PASS/FAIL table (file:line), CI run ID/URL, migrations (RPCs + convert/PT retrofit),
notification recipients, the /invoices repair, an explicit "Billing slice behavior-green: PASS/FAIL" line,
and a candid DRAG READ. Then STOP and tell me D1 is ready for review.
```
