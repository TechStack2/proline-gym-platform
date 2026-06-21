# CODER PROMPT OFF-3b — offline lead capture (the front desk captures walk-ins offline)

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-off3b-lead-capture` off `main` (≥ `31101c4`, has OFF-3 + OFF-4). Extend the **proven outbox** to the next Tier-1 write: a **walk-in lead captured offline**, queued in Dexie, pushed idempotently on reconnect. Same machinery as OFF-3 payments / G2 attendance — **generalize, don't fork.**

## Why (roadmap + what's left of the Tier-1 set)
The offline arc is closed for the demo-critical writes — OFF-3 (payments + attendance) + OFF-4 (reconciliation/resolution). Per `scoping-offline-parity.md` §6, the Tier-1 set also includes **lead-capture** + draft-registration. **Lead-capture is the clean, high-value remainder:** the front desk meets a walk-in while the internet is down and must still capture the lead (name/phone/interest) — losing a prospect to a dead connection is exactly the demo pain. This is a *small* slice on top of a *proven* mechanism (the `outbox.ts` façade + `payments.ts`/attendance queue patterns + OFF-4's conflict resolution).

## Build — offline lead capture on the existing outbox (no parallel mechanism)
1. **Queue a lead offline** — the lead-capture surface records a lead **offline** → `enqueue` a `PendingLeadIntent` in Dexie keyed by a **client op_id** (idempotency key, same pattern as OFF-3 payments). Online single-fire goes straight through as today.
2. **Flush on reconnect through the EXISTING lead-create writer** — reuse the current lead-create server action/RPC (find it in the leads module; do **not** write new lead business logic), passing the op_id so a **re-push / dropped-ACK settles EXACTLY ONE lead** (mirror OFF-3's idempotency — a client-generated key the writer de-dups on; additive column + partial-unique index only if the writer needs DB-level dedup, like 000062 — via VF, flagged).
3. **Compose into the existing outbox** — `outbox.ts` already unifies attendance + payments into one pending count + flush; **add leads as a third path** (its own domain-keyed queue + flush, composed by the façade). The desk's pending-sync bar shows leads alongside the rest; a server rejection surfaces as a **conflict** and reuses **OFF-4's resolution loop** (re-submit / discard-with-audit) — never a silent drop.

## Out of scope (defer / don't touch)
- **Draft-registration offline** — the other Tier-1 write, but it's heavier (member + enrollment + invoice → Tier-3 server-canonical assignment). **Separate follow-on (OFF-3c)** — leave a clean extension point + flag it; don't build it here.
- The portal-360 work (Lane B); the OFF-2 read path, G2 attendance, OFF-3 payments, OFF-4 resolution happy-paths (keep green — no regression). RLS untouched (authed, gym-scoped). No schema beyond an idempotency key (additive, via VF, flagged).

## Verify (e2e — extend the G2/OFF-3 `setOffline` harness)
1. **Lead loop:** online → go offline → capture a lead at the desk → it shows **pending** in the outbox bar; the server has **no** such lead yet → go online → it **syncs**, and the server has **exactly one** lead (a re-push / double-fire does **not** duplicate — idempotency proven).
2. **No regression:** OFF-3 payments + G2 attendance still flush; OFF-4 resolution still works; the unified outbox count is correct across all three paths.
3. **Conflict path** (if the lead writer can reject): surfaced for review via OFF-4's loop, not dropped.
4. `/ar` clean (RTL, the new lead/pending strings, no MISSING_MESSAGE); full suite green. **Anchor the new playwright `testMatch`** (off3↔f3 lesson); **run the new spec isolated first** (bound every wait — a hang kills the serial suite).

## Acceptance
1. The desk captures a lead **offline**, queued in the unified outbox, pushed idempotently on reconnect = **exactly one** canonical lead; no double-record; conflicts resolvable; **OFF-3/OFF-4/G2 no-regression**; green in E2E CI (run ID/URL).
2. Builds on the existing outbox (no parallel sync); reuses the existing lead writer; RLS untouched; schema additive-only via VF (HTTP 201, flagged); i18n ar/en/fr; RTL.

## Hygiene
Branch `prompt-off3b-lead-capture` off `main` (≥ `31101c4`); **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; never weaken RLS; if a migration is needed apply via Verify-Foundation (`-f apply=true -f migrations='…'`, confirm HTTP 201) and say so; **DO NOT merge** — report "OFF-3b ready" + CI run ID; the auditor merges.

## Update the progress file
Append to `docs/audit/audit-cycle-update.md` → `## Cycle 6 / OFF-3b — offline lead capture`: the third outbox path, the idempotency mechanism, the reconnect proof, any migration (+ VF run/HTTP 201), CI run ID/URL, an explicit **"desk captures a lead offline → syncs idempotently → exactly one canonical lead; OFF-3/OFF-4/G2 no-regression: PASS/FAIL"** line, and a DRAG READ (where draft-registration (OFF-3c) attaches).
