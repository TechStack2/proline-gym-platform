# CODER PROMPT OFF-2 — offline reads: prime the Dexie mirror + client-side front-desk lookup

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-off2-offline-reads` off `main`. Design: [`scoping-offline-parity.md`](./scoping-offline-parity.md). **Second offline slice (lead chapter). READ-ONLY — no offline writes (OFF-3) or reconciliation (OFF-4); decision-independent** (the operator's 2 confirmations gate OFF-3/4, not this). Builds on OFF-1 (the SW now registers + serves the cached shell in prod).

## The architectural reality (shapes the whole slice)
The front-desk read surfaces — `students/page.tsx`, `schedule/page.tsx`, `students/[id]/page.tsx` — are **server components** (Supabase server queries). **They cannot render offline** (no network → no server render). OFF-1's `NetworkFirst` page-cache serves *previously-visited* pages offline, but the desk needs to look up **any** member offline. So OFF-2 must add a **client-side read path from the primed Dexie mirror** — not rely on server rendering.

## Build (read-only)
1. **Activate the dormant `SyncEngine` PULL** ([sync-engine.ts](../../src/lib/db/sync-engine.ts) — `getSyncEngine()`, `pullAll()` for the 17 mirrored tables): prime the Dexie mirror (gym-scoped) **on login + on each online window** (and a manual "Sync now" affordance). This is the offline read source. Reuse the existing `schema.ts` Dexie store + the G2 cache patterns.
2. **A client-side offline lookup for the CORE front-desk surfaces** (bounded — not every page): member **search/find → member basics** (name, contact, membership status, PT remaining, belt), **today's schedule**, and a **class roster**, reading from Dexie when offline. Either a dedicated client "Front Desk · offline" surface, or a **client-side Dexie fallback** on the existing surfaces that engages when `use-online` reports offline. Keep it gym-scoped.
3. **Offline UX** (reuse OFF-1's primitives): when offline, reads come from Dexie with a **"cached as of <time>"** indicator; any write affordance shows the existing `online-only-notice` ("needs connection") — OFF-3 will make those work. The `offline-banner` already engages (OFF-1).

## Out of scope
Offline **writes** (OFF-3), server-authoritative **reconciliation** (OFF-4), the 2 operator confirmations, non-core read surfaces (billing/reports/etc. — later), schema changes.

## Verify (e2e — reuse the G2 offline-harness `context.setOffline`)
1. **Prime online → go offline → look up:** with the SW + mirror primed online, set offline, then the front desk **finds a seeded member by search** and sees their **basics** + **today's schedule** + a **class roster** — served from the **Dexie cache**, NOT a network-error page.
2. **Correctness:** the offline-read data matches what was cached online (a known seeded member's status/PT/belt).
3. **No write leakage:** a write affordance offline shows "needs connection" (not a silent failure). `/ar` clean; full suite green (no regression); G2 offline attendance still passes.

## Acceptance
1. The Dexie mirror primes via `SyncEngine.pullAll` on login/online; the core front-desk lookups (member find → basics, schedule, roster) work **offline** from the cache; green in E2E CI (run ID/URL).
2. Read-only (no offline writes introduced); gym-scoped; offline UX (cached-as-of + online-only-notice); no regression to OFF-1/G2; i18n ar/en/fr; RTL.

## Hygiene
Branch `prompt-off2-offline-reads` off `main`; **dev port 3000**; scoped `git add`; **no Claude/Co-Authored-By trailer**; never weaken RLS; **DO NOT merge** — report "OFF-2 ready" + CI run ID.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 6 / OFF-2 — offline reads (Dexie mirror + client lookup)`: the PULL activation, the client-read surfaces, the offline UX, CI run ID/URL, an explicit **"front desk looks up member/schedule/roster offline from cache; no write leak; G2 intact: PASS/FAIL"** line, and a DRAG READ (incl. coverage boundary — which surfaces are offline-capable vs still online-only).
