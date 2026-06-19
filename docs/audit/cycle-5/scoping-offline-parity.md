# Scoping (design): Offline-capable front desk + web↔PWA parity

> **Auditor design doc, 2026-06-19.** **Lead must-have** (operator-confirmed: the front desk has unreliable internet and *cannot operate without offline*). This is design-first scoping — it precedes the build prompts. **Verdict: very doable — the offline machine is ~80% built but dormant; the work is *activate + curate the safe-write set*, not build-from-scratch.**

## 1. Inventory — what already exists (mostly dormant)
| Piece | File | State |
|---|---|---|
| **Dexie offline data model** — full mirror of 20+ critical tables + `SyncQueueItem` (outbox) + `SyncMetadata` + `PendingAttendanceMark` + `RosterCacheEntry` | `src/lib/db/schema.ts` | built |
| **SyncEngine** — Outbox pattern: `enqueue()` → `sync_queue` → `pushAll()`; **pull-sync wired for 17 tables** (gyms…pt_sessions); conflict count; `isOnline()` | `src/lib/db/sync-engine.ts` | **built but DORMANT (unused)** |
| **G2 offline attendance** — roster cache + pending-marks queue + flush through the *existing idempotent* write path (LWW) | `src/lib/offline/attendance.ts` | **live — the ONE proven offline-write flow** |
| **PWA caching** — `next-pwa` runtimeCaching (NetworkFirst API/Supabase-REST, CacheFirst static, SWR images/_next-static, NetworkFirst pages), `register:true` | `next.config.mjs` | live |
| **Offline UX primitives** — `offline-banner`, `online-only-notice`, `use-online`, `pwa-install-prompt` | `src/lib/offline/`, `src/components/offline/`, `pwa/` | live |

So: the data model, the sync engine, the proven queue-pattern, and the caching are all present. **G2 already proves the end-to-end loop for attendance.** Extending it = wiring more flows through the same machine.

## 2. The core design decision — offline-safe-write tiers
Map every front-desk operation to a tier. The discipline: **append/LWW writes flow through existing idempotent server paths on reconnect (G2's model); server-authoritative writes queue an *intent* and the server assigns the canonical record on reconnect — never two competing truths.**

**Tier 1 — Safe offline (queue + sync):**
- Attendance / check-in (✓ G2) · new **lead capture** (append, dedup on sync) · **draft class registration** (it's request→approve already — queue the request) · **cash payment record** (queue as *pending*, reconcile in Tier 3) · login-less **member create/edit** (append/LWW).

**Tier 2 — Read-cached (look up offline, writes defer):**
- Member lookup, schedule, roster, PT-package status, Member-360 — served from the Dexie mirror + PWA caches (prime on login / online windows). This alone makes the desk *usable* offline.

**Tier 3 — Server-authoritative (queue intent → server assigns canonical on reconnect):**
- Invoice **numbering** (server sequence) · payment **finalization** / money ledger · membership **state transitions** (renew/freeze/lapse) · anything RLS/OTP-gated. Surfaced as **"pending"** until the server confirms.

## 3. Conflict + coherence
LWW with field-awareness (blueprint's V2 field-merge) for Tier 1; `SyncEngine.pushAll` (oldest-first) + pull + conflict-count. **Known coherence hazards to harden** (from G2's drag-read): roster-cache-vs-queue on long offline windows, per-(class,date) group flush, and the **SW cold-open**.

## 4. Web↔PWA parity gap
The offline machine (SW + Dexie + queue) only fully engages in the **installed PWA**. **The front-desk laptop must run the installed PWA (Chrome "Install app"), not just a browser tab** — otherwise no SW/offline. Parity-audit (first build step): enumerate laptop-web (tab) vs installed-PWA divergences — SW registration, the shell (mobile `NativeTabBar` vs desktop side-rail), offline availability, any viewport-gated feature. Likely quick win: make the install prompt + offline engine engage on desktop.

## 5. SW lifecycle caution
We've been bitten by service-worker caching twice (stale-SW on localhost; prod CSP/hydration). The offline SW work **must** get registration/update/succession right. See [[stale-sw-localhost]], [[prod-csp-strict-dynamic-needs-dynamic-render]].

## 6. Proposed build decomposition (sequential — each builds on the prior)
1. **OFF-1 · Parity + PWA-install foundation** — installed-PWA engages SW/offline on the laptop; parity audit + fixes; consistent offline shell/banner. *Unblocks the rest.*
2. **OFF-2 · Offline reads** — activate the Dexie mirror + `SyncEngine` PULL so lookup/schedule/roster/Member-360 work offline (read-only); prime cache on login. *Delivers offline LOOKUP fast — the biggest day-1 win.*
3. **OFF-3 · Offline Tier-1 writes** — extend G2's queue (`enqueue`/`pushAll`) to check-in, lead capture, draft registration, cash-record; reconnect-sync through existing idempotent writers; "pending" UX.
4. **OFF-4 · Server-authoritative reconciliation** — Tier-3 queued-intent → server-assigns-canonical-on-reconnect; conflict/coherence hardening (roster-vs-queue, group-flush, SW cold-open).

Each is e2e-verifiable via the existing G2 offline-harness pattern (`context.setOffline`).

## 7. Decisions for the operator (before OFF-3/4)
1. **Confirm the front-desk laptop runs the *installed* PWA** (required for offline) — not just a browser tab.
2. **Validate the Tier-1/Tier-3 split against their actual desk workflow** — especially **cash at the desk while offline**: record it offline as *pending* (Tier 1) → server reconciles + assigns the invoice on reconnect (Tier 3). Confirm that "pending then confirmed" UX is acceptable for money.

## 8. Effort & honesty
A real multi-slice cycle (OFF-1→4), but **de-risked by the dormant machine** + G2's proven loop. The hard parts are bounded + known: the Tier-3 reconciliation model and SW/coherence — not a research gamble. OFF-1+OFF-2 (parity + offline lookup) can ship first and already make the desk operable read-side offline; OFF-3 adds the critical writes.
