# CODER PROMPT PAUSE-CARD — surface currently-paused memberships on the Today page (+ one-tap Resume)

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-pause-card` off `main`. **Frontend-only; NO schema/RPC change — the freeze infrastructure already exists.** **Benchmark gap (operational visibility):** membership freeze is fully built (calculated value-hold, auto-unfreeze, badge, bounds) but **paused members are invisible at a glance** — staff can't see who's currently frozen without opening each member. Owner asked for a **monitored pause + a Today-page admin card**; the calculated hold already ships, so this is the **monitoring card** only.

## Why (recon — freeze is done; only the Today card is missing)
- `freeze_membership`/`unfreeze_membership` RPCs (000047) + `membership_freezes` ledger; freeze **extends `end_date` by frozen days** and early-unfreeze restores pro-rata; frozen members skip the renewal tick; "frozen" badge on the member card. **All working + e2e-tested (`ml1`).**
- `student_memberships.status = 'paused'`, `pause_end_date` track the freeze.
- **Gap:** [`today/_components/TodayHorizon.tsx`](src/app/[locale]/(dashboard)/today/_components/TodayHorizon.tsx) has Expiring / Chase / Winback / Money cards, but its query is `status IN ('active','lapsed')` (~:163-174) — **paused members are nowhere on Today**.
- Resume already wired: `unfreeze_membership` server action + `revalidatePath('/today')` ([`src/lib/lifecycle/actions.ts`](src/lib/lifecycle/actions.ts)).

## Build — a "Paused" card on Today (display + one-tap Resume)
1. **Query** currently-paused memberships (gym-scoped, RLS-respecting): `student_memberships` where `status = 'paused'`, with member name + `pause_end_date` + days held (and/or the held end_date). Add it alongside the existing horizon queries.
2. **Render a "Paused / On hold" ActionCard** mirroring the existing **Chase** card pattern (~:293): each row = member name + **"resumes {pause_end_date}"** + days held; a count in the header. Empty state when none.
3. **One-tap Resume** per row → calls the existing `unfreeze_membership` action (early-unfreeze restores pro-rata, as built) → `revalidatePath('/today')`. Reuse the existing action; **do not** write a new RPC.
4. **Localized** `/ar` (RTL) + `/en` (+ `/fr`).

## Out of scope
The freeze mechanic / value-hold / bounds (already done — don't touch); a new RPC or schema; bulk actions; CYCLE-VIZ/INV-LABEL.

## Verify
1. Today shows a **Paused card** listing currently-paused members + resume date + days held; one-tap **Resume** unfreezes and the card updates (member leaves the list); empty state when none.
2. No schema/RPC change (reuses `freeze_membership`/`unfreeze_membership`); RLS gym-scoped.
3. `/ar`+`/en`(+`/fr`) correct.
4. **TARGETED run** (`-f projects="<today/owner>"`) — assert the paused member appears + Resume works (freeze a member in-test, see them on the card, resume).

## Acceptance
1. A Today-page card surfaces currently-paused memberships with resume date + days held + a working one-tap Resume; reuses existing freeze infra (no schema/RPC); localized; green on a targeted run (run ID/URL).

## Hygiene
Branch `prompt-pause-card` off `main`; **dev port 3000**; scoped `git add`; **no Claude/Co-Authored-By trailer**; **never weaken RLS**; reuse the existing RPCs (no new migration); **validate TARGETED**; **DO NOT merge** — report "PAUSE-CARD ready" + the run ID; the auditor merges.

## Update the progress file
Append to `docs/audit/audit-cycle-update.md` → `## Cycle 6 / PAUSE-CARD — paused memberships on Today`: that the freeze infra already existed (only the monitoring card was missing), the card + Resume reuse, the targeted run ID, an explicit **"Today surfaces currently-paused members + one-tap Resume; reuses existing freeze RPCs; no schema change; /ar+/en: PASS/FAIL"** line, and a DRAG READ.
