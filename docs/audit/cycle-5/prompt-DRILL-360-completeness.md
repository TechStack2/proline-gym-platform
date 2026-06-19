# CODER PROMPT DRILL-360 — make every 360 card drill into what's driving it

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-drill-360` off `main`. **Zero schema — read-time only.** Demo feedback: the owner loved the drill-down (card → the rows/entities behind the number) **but it's inconsistent** — fix that so *every* card answers "what's driving this?"

## Audit (verified — this is the gap)
The `ActionCard`/`ActionRow` framework ([action-card.tsx](../../src/components/dashboard/action-card.tsx)) drills via `<ActionRow href=…>`. Current state:
- **TodayHorizon** — already drillable (9 cards / 18 hrefs). Leave as-is (spot-fix any row missing an href).
- **WeekHorizon** — partial: **coach-load** and **leads/funnel** rows don't link.
- **MonthHorizon** — the real gap: **revenue-by-product, new-vs-churn movement, conversion, active-trend, extras** render as **headline numbers with no drill** (only ~3 hrefs across the file).

## Build — give every card a drill target (read-time)
Each currently-headline card gets either (a) `ActionRow href` rows that route into an existing surface, or (b) an **inline expand** listing the contributing records. **The drill must RECONCILE** — the rows behind a number must actually sum/count to it (that transparency is what they liked; don't link to an unrelated list).

Per card (reuse existing surfaces; add a filtered query param to a target list only where needed):
- **Month · revenue-by-product** → each product line drills to the **invoices/payments** that sum to it (filter by type + this-month). Reconcile to the headline $.
- **Month · new-vs-churn movement** → each segment (new / churned / recovered) drills to that **member set** (students list filtered, or inline rows → Member-360).
- **Month · conversion** → the **converted leads** this month (leads list filtered) + the denominator (total leads).
- **Month · active-trend** → the **active members** list (and the delta's contributors).
- **Month · extras (PT sold + camp)** → the **PT sales** + **camp signups** lists.
- **Month · aging** → confirm each bucket drills to its **overdue invoices** (3 hrefs exist — make all buckets drill).
- **Week · coach-load** → each coach → their **Coach-360** (TEAM-1 added Coach-360 — verify the link is wired; if the row is still a plain list, wire it now).
- **Week · leads/funnel** → the **leads** list; **schedule-fill** rows → the **class roster/detail**.

Where a target list lacks the needed filter (e.g., "members who churned this month"), prefer an **inline expand** of the contributing rows (each row an `ActionRow href` → Member-360 / invoice) over building a new page. No new business logic — reuse the FIN-1/GRW-1/ML-1 read helpers that already computed the number; just expose their rows.

## Out of scope
Schema; new aggregation logic (reuse what computed the headline); Member-360/list internals ([3] owns those); the offline/parity work.

## Verify (e2e, ephemeral TI gym)
1. Seed so each Month/Week card is non-zero, then assert **every** card exposes a drill (an `ActionRow href` or an expand control) — no headline-only card remains.
2. **Reconciliation:** for revenue-by-product and movement, assert the drilled rows sum/count to the card headline.
3. A drilled row navigates to a populated target (invoice / Member-360 / leads / Coach-360). `/ar` clean; full suite green (no regression).

## Acceptance
1. Every Today/Week/Month card is drillable; the Month headline cards now expose reconciling rows; green in E2E CI (run ID/URL).
2. Zero schema; read-time only; i18n ar/en/fr for any new labels; RTL; design-system.

## Hygiene
Branch `prompt-drill-360` off `main`; **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; never weaken RLS; **DO NOT merge** — report "DRILL-360 ready" + CI run ID; the auditor merges.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 6 / DRILL-360 — card drill-down completeness`: the per-card drill targets, the reconciliation proof, CI run ID/URL, an explicit **"every 360 card drills + reconciles: PASS/FAIL"** line, and a DRAG READ.
