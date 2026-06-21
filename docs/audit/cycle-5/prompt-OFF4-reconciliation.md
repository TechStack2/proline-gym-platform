# CODER PROMPT OFF-4 — reconciliation & conflict resolution (make the offline writes TRUSTWORTHY)

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-off4-reconciliation` off `main` (≥ `ca90c1c`, has OFF-3). **Close the loop OFF-3 left open:** OFF-3 *records* offline + *surfaces* conflicts, but conflicts can't be **resolved**, and the queue isn't **reconciled against the server's authoritative state** on reconnect. This is the final offline slice — it makes the offline front desk **trustworthy**, not just functional.

## Why (roadmap + exactly what OFF-3 left)
The offline arc shipped OFF-1 (parity/PWA) → OFF-2 (reads) → OFF-3 (Tier-1 writes: payment + attendance, idempotent). Per `scoping-offline-parity.md` §6, **OFF-4 = server-authoritative reconciliation + conflict/coherence hardening** — the L3 "Managed" reliability bar for a desk that genuinely runs offline (the demo's lead must-have). Audited gaps in the merged OFF-3:
- **`payments.ts`** flags a server-rejected write `status:'conflict'` + keeps it with `last_error`, and **`flushPayments` deliberately skips conflict rows on every future flush** — so a rejected money record **accumulates forever with no resolution path**.
- **`outbox.ts`** reports a `conflicts` count but the desk can only *see* them, not *act* on them.
- No **reconnect reconciliation against server truth** (roster/invoice changed server-side while offline) and no proven **SW cold-open** (the installed PWA reopened offline) hydration of the queue.

## Build — resolve, reconcile, survive cold-open (on the EXISTING outbox; no parallel mechanism)
1. **Conflict resolution loop (headliner):** the desk's pending-sync surface lets staff **resolve** a `conflict` row — for each, show the rejection reason (`last_error`) + the **server's current state** (e.g., the invoice's real balance/status) and offer bounded actions: **re-submit corrected** (re-queue with the *same* `op_id` so idempotency holds, or a new op against the current state), or **discard with an audit reason** (never a silent delete — write an audit trail). After resolution the row leaves the conflict set. **Money records are never dropped without an explicit, audited staff action** (the locked decision).
2. **Reconnect reconciliation against server truth (Tier-3):** on reconnect, before/with the flush, reconcile each pending intent against the **server's authoritative state** — the realistic case: the underlying entity changed while offline (invoice paid/cancelled by someone else, student unenrolled from the class). A pending write whose premise no longer holds becomes a **reviewable conflict** (with the reason), not a silent failure or a wrong write. Server stays the source of truth; the client intent reconciles to it.
3. **SW cold-open robustness:** the installed PWA cold-opening **offline** (front desk closes the lid, reopens with no connection) correctly hydrates the Dexie queue + the **pending-sync bar shows the real pending/conflict counts** from a cold service-worker start — nothing is lost, the desk reads the last prime + sees what's queued.

Reuse OFF-3's `outbox.ts`/`payments.ts`/attendance queue + the existing idempotent writers — **generalize, don't fork**. RLS untouched (authed, gym-scoped). Any new writer (e.g., a discard-with-reason audit) is SECURITY DEFINER + `is_staff()` + gym-scoped, REVOKE PUBLIC + GRANT authenticated, additive-only via VF.

## Out of scope (defer / don't touch)
- **OFF-3b** (lead-capture + draft-registration offline) — separate slice; OFF-4 hardens the *existing* OFF-3 writes, doesn't add new offline write types.
- **Group-flush ordering / deep Tier-3 server-canonical-id assignment for brand-new offline-created entities** — only if it falls out cleanly; else leave a flagged extension point.
- The portal-360 work (Lane B); the OFF-2 read path + G2 attendance happy-path + OFF-3 happy-path (keep green — no regression).

## Verify (e2e — extend the G2/OFF-3 `setOffline` harness)
1. **Resolve a conflict:** drive a payment to `conflict` (offline-record against an invoice that gets over-settled/cancelled online) → it surfaces with reason + server state → staff **re-submits corrected** OR **discards with reason** → the conflict clears, the audit trail exists, and **no duplicate/no silent drop** (server has exactly the intended canonical state).
2. **Reconnect reconciliation:** an offline write whose premise changed server-side (invoice already paid / student unenrolled) reconciles to a **reviewable conflict**, not a bad write or a hang.
3. **SW cold-open:** with items queued, simulate a cold open offline → the pending-sync bar shows the correct pending + conflict counts; reads still work; on reconnect the queue flushes/reconciles correctly.
4. `/ar` clean (RTL, new resolution strings, no MISSING_MESSAGE); **G2 ✓, OFF-2 ✓, OFF-3 happy-path ✓** (no regression); full suite green. (Run the new spec in **isolation first** — a hung wait takes the whole serial suite down; bound every wait.)

## Acceptance
1. Conflicts are **resolvable** (re-submit corrected / discard-with-audit) — never accumulate unresolved, never silently dropped; the queue **reconciles against server truth** on reconnect; the queue + pending bar **survive an offline SW cold-open**; green in E2E CI (run ID/URL).
2. Builds on OFF-3's outbox (no parallel sync); reuses idempotent writers; RLS untouched; schema additive-only via VF (HTTP 201, flagged); i18n ar/en/fr; RTL.

## Hygiene
Branch `prompt-off4-reconciliation` off `main` (≥ `ca90c1c`); **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; never weaken RLS; if a migration is needed apply via Verify-Foundation (`-f apply=true -f migrations='…'`, confirm HTTP 201) and say so; **DO NOT merge** — report "OFF-4 ready" + CI run ID; the auditor merges. **Anchor any new playwright `testMatch`** (the unanchored substring collision is what hung off3↔f3 — see the saved gotcha).

## Update the progress file
Append to `docs/audit/audit-cycle-update.md` → `## Cycle 6 / OFF-4 — reconciliation & conflict resolution`: the resolution loop (re-submit/discard-with-audit), the reconnect reconciliation model, the SW cold-open proof, any migration (+ VF run/HTTP 201), CI run ID/URL, an explicit **"conflicts resolvable + reconciled against server truth + survive cold-open; G2/OFF-2/OFF-3 no-regression: PASS/FAIL"** line, and a DRAG READ (where OFF-3b + group-flush/deep-Tier-3 attach). This **closes the offline arc** — note that.
