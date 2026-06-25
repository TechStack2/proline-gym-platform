# CODER PROMPT CYCLE-VIZ — make the recurring monthly cycle obvious on class cards/pills

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-cycle-viz` off `main`. **Frontend-only; NO migration/RLS.** **Benchmark gap (monetization legibility):** recurring-class registration is a **monthly** product ([[proline-monetization-model]]) but the UI shows only a bare `$fee/mo` — members can't see it's a *recurring cycle* or *when it renews*. Owner-chosen: pills/cards show **cycle + renewal**.

## Why (recon — the data exists, no schema needed)
- A class registration's cycle is implicit: `class_registrations.start_date`/`end_date` where `end_date = start_date + 1 month` (000034), and `classes.monthly_fee_usd`. Renewal = `end_date`.
- Portal class card today: [`src/app/[locale]/portal/classes/portal-classes-client.tsx`](src/app/[locale]/portal/classes/portal-classes-client.tsx) (~:65-95) shows `${monthly_fee_usd}/mo` only — no cycle/renews. Dashboard schedule cards similar.

## Build — compute + show the cycle (frontend only)
1. **For a class the member is registered in:** show **"Monthly · renews {end_date}"** (compute from the registration's `end_date`; localized date). Make the recurring nature unmistakable (a pill/badge, not buried).
2. **For the catalog/browse view (not registered):** show the cycle framing — **"Monthly"** alongside the `$fee/mo` so it reads as a recurring monthly registration, not a one-off.
3. **Surfaces:** the portal classes cards (`portal-classes-client.tsx`) and the dashboard schedule/class cards. Fetch the registration `end_date` where not already selected. Consistent badge styling with the existing card design.
4. **Localized** `/ar` (RTL) + `/en` (+ `/fr`); null-safe (no registration → just "Monthly · $fee/mo", no renews date).

## Out of scope
Changing billing/renewal logic or the cycle length; INV-LABEL/PAUSE-CARD; backend/RLS; the request→approve→bill flow (display only).

## Verify
1. A registered member's class card shows **"Monthly · renews {date}"**; the catalog shows the monthly framing; correct in `/ar`+`/en`(+`/fr`); null-safe.
2. No billing/data/RLS change.
3. **TARGETED run** (`-f projects="<portal + schedule>"`).

## Acceptance
1. Class cards/pills communicate the monthly cycle + renewal date (registered) / monthly framing (catalog), localized, null-safe; frontend-only; green on a targeted run (run ID/URL).

## Hygiene
Branch `prompt-cycle-viz` off `main`; **dev port 3000**; scoped `git add`; **no Claude/Co-Authored-By trailer**; **validate TARGETED**; **DO NOT merge** — report "CYCLE-VIZ ready" + the run ID; the auditor merges.

## Update the progress file
Append to `docs/audit/audit-cycle-update.md` → `## Cycle 6 / CYCLE-VIZ — recurring monthly cycle on class cards`: the computed-from-existing-fields approach, surfaces touched, the targeted run ID, an explicit **"class cards show monthly cycle + renews date; /ar+/en; no backend change: PASS/FAIL"** line, and a DRAG READ.
