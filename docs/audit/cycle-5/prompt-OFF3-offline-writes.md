# CODER PROMPT OFF-3 — offline Tier-1 writes (the front desk RECORDS offline; reconciles on reconnect)

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-off3-offline-writes` off `main` (now `17e2813` — has OFF-2 + PHOTO-GATE). **Activate the SyncEngine WRITE path** so the front desk can *record* offline, queued in Dexie, pushed + reconciled on reconnect. Builds directly on **G2's proven offline-attendance queue loop** (`enqueue`/`pushAll`) and **OFF-2's desk-scoped Dexie mirror**.

## Why (demo-2 + roadmap + locked decisions)
Demo-2: the front desk has **unreliable internet** and must keep operating offline. OFF-1/OFF-2 made the desk **read** offline; OFF-3 is the **critical writes** phase of the offline arc — Tier-1 queued writes (per `scoping-offline-parity.md` §6). **Operator decisions are locked (2026-06-21):** (1) the front-desk laptop runs the **installed PWA** → rely on the SW + background sync; (2) **offline cash/payments are provisional and reconcile on reconnect** — record offline as *pending* → server reconciles + assigns the canonical record on reconnect; the owner accepted the "pending → confirmed" money UX.

**De-risked:** G2 already proved the queue→offline→reconnect→idempotent-writer loop for attendance (see [`prompt-G2-offline-attendance.md`](prompt-G2-offline-attendance.md) + `e2e/g2.spec.ts`). OFF-3 **generalizes that one mechanism** to the money path; it is not new research.

## Build — generalize G2's queue to the desk's Tier-1 writes (headliner: cash/payment)
1. **Offline payment/cash recording (MUST-HAVE, the money path):** the desk records a cash/OMT/Whish payment **offline** → `enqueue` a *pending* payment intent in Dexie (dual-currency: amount_usd/lbp/rate/rate_date as today) → on reconnect, `pushAll` through the **existing idempotent payment writer** (reuse it — no new business logic; client-generated stable id / idempotency key so a re-push never double-records) → server reconciles + assigns the canonical invoice/payment; the pending row resolves to confirmed.
2. **Attendance check-in rides the same generalized queue** — confirm G2's offline check-in still works through the unified `enqueue`/`pushAll` (don't regress it; refactor onto the shared path if needed).
3. **"Pending sync" UX** — every offline-recorded write shows a clear **pending** state ("saved offline · will sync"); a desk-level **pending-queue indicator** (count + "Sync now"); on reconnect, items flip to confirmed; a push that **fails reconciliation surfaces the conflict for review** (never silently drop a money record — per the locked decision).
4. **Online path unchanged** — when online, writes go straight through (queue is transparent); offline is the only behavior change.

## Out of scope (defer / don't touch)
- **OFF-4** owns deep Tier-3 reconciliation: roster-vs-queue coherence, group-flush, SW cold-open, rich conflict-resolution UI. OFF-3 surfaces conflicts; OFF-4 hardens them.
- **Lead capture + draft registration** (the other Tier-1 writes) — same mechanism, **fast-follow (OFF-3b)**; wire them only if they fall out as thin reuse, else leave a clean extension point + flag it in the DRAG READ.
- No schema changes unless strictly required for the idempotency key (if so, additive + forward-only + via Verify-Foundation; flag it — prefer a client-generated id reused by the existing writer). Never weaken RLS (authed browser client, gym-scoped). Don't touch the portal-360 work (Lane B).

## Verify (e2e — extend the G2 offline harness `context.setOffline`)
1. **Money loop:** online → go offline → record a payment at the desk → it shows **pending** + appears in the pending-queue indicator; the server has **not** recorded it yet → go online → it **syncs**, flips to confirmed, and the server shows **exactly one** canonical payment (re-push / double-fire does **not** duplicate — idempotency proven).
2. **Attendance** still check-ins offline through the unified queue (no G2 regression — g2.spec stays green).
3. **Conflict surfaced:** a write that can't reconcile is shown for review, not dropped.
4. `/ar` clean (RTL, the new pending/queue strings, no MISSING_MESSAGE); full suite green (no regression to OFF-2 reads, PHOTO-GATE, or the dashboard).

## Acceptance
1. The desk records payments (+ attendance) **offline**, queued as pending, pushed idempotently + reconciled on reconnect, with pending UX + conflict surfacing; **no double-record**; green in E2E CI (run ID/URL).
2. Builds on G2/OFF-2 (no parallel write path); reuses existing idempotent writers; i18n ar/en/fr; RTL; RLS untouched; schema additive-only (if any) via VF.

## Hygiene
Branch `prompt-off3-offline-writes` off `main` (`17e2813`); **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; never weaken RLS; **DO NOT merge** — report "OFF-3 ready" + CI run ID; the auditor merges. If a migration is needed, apply via Verify-Foundation (`-f apply=true -f migrations='…'`, confirm HTTP 201) and say so explicitly.

## Update the progress file
Append to `docs/audit/audit-cycle-update.md` → `## Cycle 6 / OFF-3 — offline Tier-1 writes (cash/payment + check-in)`: the generalized queue, the idempotency mechanism (how a re-push can't double-record), the pending/conflict UX, the reconnect-reconcile proof, CI run ID/URL, an explicit **"desk records payment offline → syncs idempotently → exactly one canonical record; attendance no-regress: PASS/FAIL"** line, and a DRAG READ (incl. where lead-capture/draft-registration (OFF-3b) and OFF-4 reconciliation attach).
