# CODER PROMPT FIN-1 — Today horizons + owner finances + churn & win-back queue

> **For:** the MAIN coding agent (mainline) · **Issued by:** Project Auditor · **Sequence:** after AX-1 merges (branch `prompt-fin1-finances` off post-AX-1 `main`). Design: [`../design-demo-feedback-v1.md`](../design-demo-feedback-v1.md) §1–2 (client-stated buying criteria, forks locked).

## Strategic context
The Proline owners asked for three things in one breath: *week/month views like Today, more finances/accounting, and following up with members who dropped.* This slice is the owner's cockpit: the same action logic over wider horizons, the money questions an owner actually asks, and **churn turned into a workflow** (win-back) instead of a regret. ML-1's states + D1's ledger make almost all of it reads. **Tenant-clean active. Follow `docs/design-system.md` (AX-1) for all new surfaces.**

## Build

### 1. Today horizons (Today / This Week / This Month)
A horizon switcher on `/today` over the SAME ActionCard stack (FD-1 contract): each card re-scopes to the horizon — renewals/expirings due within it, camps running, trials booked, due/overdue invoices, projected collections (sum of open invoices due in horizon). Today stays the default; Week/Month are read-only lenses (actions stay per-row). Collapse-when-zero per card, totals in headlines.

### 2. Owner finances (Money → Overview becomes the owner dashboard)
All computed from existing D1/ML-1 data (verify real columns; ZERO new money tables):
- **Revenue by month** (last 6): collected payments grouped by month × product (membership / class registration / PT / camp — derive product from the invoice linkage; an "other/legacy" bucket for unlinkable history is honest).
- **Collections by method** (cash USD/LBP, OMT, Whish) for the selected month.
- **Outstanding aging:** open invoice totals bucketed current / 1–30d / 31–60d / 60d+ past due, with drill-down to the filtered invoice list.
- **Churn view:** per month — memberships lapsed/cancelled, registrations suspended/cancelled (needs reliable state timestamps: verify ML-1's columns; add `lapsed_at`/`suspended_at`-class timestamps ONLY if missing — small additive migration).
- Simple, table+number based per the design system — no chart library unless one is already a dependency.

### 3. Win-back queue (churn → workflow)
- **Migration (next free number):** `member_followups` (gym_id, student_id, kind `winback`, outcome enum [no_answer / not_interested / thinking / promised_visit / reactivated], note, next_action_date, created_by, timestamps) + gym-scoped staff RLS (write+read own gym) — the ONLY new table.
- **Surface:** Money or Members gains a **Win-back tab**: members whose membership lapsed/cancelled or registrations all ended, most-recent first, with their last followup state; row actions: **call (tel:)** · **log outcome** (chips + note + optional next date) · **reactivate** (deep-link to renew/reinstate/new-registration — existing ML-1/B2 flows, no new writers).
- **Today/horizon card:** "Win-back due" (followups whose next_action_date is in horizon + fresh lapses with no followup yet) → drill to the queue.
- **Reactivation closes the loop:** when a win-back member becomes active again (ML-1 reinstate / renewal paid / new registration), the queue reflects it (read-time state — no manual bookkeeping).

## Out of scope
Exports/ledgers/accounting module; charts beyond tables+numbers; campaigns (GRW-1); wa.me share actions (G1 docks them onto the chase + win-back rows later — leave the row-action slot documented).

## Verify (e2e, ephemeral TI gym)
1. **Horizons:** seeded data renders distinct Today vs Week vs Month counts (e.g., the membership ending in 6 days appears in Week+Month, not Today); projected collections sums open invoices in horizon.
2. **Owner dashboard:** after the suite's organic activity, revenue-by-month shows the run's collected payments under the right product buckets; method breakdown matches the D1 tally; aging buckets the seeded overdue invoice correctly.
3. **Churn + win-back:** a lapsed member (ML-1 path) appears in the churn month AND the win-back queue → staff log an outcome (chips+note) → row shows it; set next_action_date → the Win-back-due card carries it; reactivate via ML-1 reinstate → the queue row flips to reactivated (read-time).
4. Full suite green — no regression (AX-1's count + FIN-1 tests).

## Acceptance
1. The three proofs green in E2E CI (run ID/URL).
2. Real-columns audit (invoice product linkage + ML-1 timestamps) reported; additions named; the one new table's RLS gym-scoped (database-reviewer).
3. Surfaces follow `docs/design-system.md`; i18n ar/en/fr (Arabic-first per AX-1 conventions); RTL; `tsc`+`build` clean.

## Hygiene
Branch `prompt-fin1-finances` off post-AX-1 `main`; **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; TI ephemeral gym; migrations via Verify-Foundation before e2e; stay on your branch.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / FIN-1 — Horizons + owner finances + win-back`: the product-linkage derivation, timestamp findings, the win-back model, CI run ID/URL, an explicit **"Horizons + owner dashboard + churn→win-back→reactivation loop: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Next: **GRW-1** (growth: capture + sources + funnel + tracked links/QR).

---

### Copy-paste activation block for the MAINLINE coder (hand off ONLY after the auditor confirms AX-1 is merged)
```text
You are the MAIN coding agent for the PRO LINE Gym Platform (mainline track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-fin1-finances off main (git checkout main && git pull && git checkout -b
prompt-fin1-finances — main must contain AX-1; verify docs/design-system.md exists before starting and
FOLLOW it on every new surface).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-FIN1-owner-finances-winback.md
design: docs/audit/design-demo-feedback-v1.md §1–2 (client buying criteria, locked)

Do: (1) TODAY HORIZONS: a Today/This Week/This Month switcher over the SAME ActionCard stack — each card
re-scopes (renewals/expirings in horizon, camps running, trials booked, due/overdue, projected
collections = open invoices due in horizon); Today default; Week/Month read-only lenses; collapse-when-
zero. (2) OWNER DASHBOARD on Money Overview, ALL from existing D1/ML-1 data (verify real columns; zero
new money tables): revenue by month ×product for last 6 (derive product from invoice linkage; honest
other/legacy bucket), collections by method for the month, outstanding aging
(current/1-30/31-60/60+ with drill-down), churn per month (lapsed/cancelled memberships +
suspended/cancelled registrations — add lapsed_at/suspended_at-class timestamps ONLY if missing, small
additive migration); tables+numbers per the design system, no new chart deps. (3) WIN-BACK: migration
(next free number) member_followups (gym_id, student_id, kind winback, outcome enum
no_answer/not_interested/thinking/promised_visit/reactivated, note, next_action_date, created_by) with
gym-scoped staff RLS — the ONLY new table; a Win-back tab (lapsed/ended members, last-followup state,
row actions: tel: call · log outcome chips+note+next-date · reactivate deep-link to existing ML-1/B2
flows — no new writers); a "Win-back due" horizon card (next_action_date in horizon + fresh lapses with
no followup); reactivation reflects at read time (reinstate/renewal/new registration flips the row).
Leave the wa.me row-action slot documented for G1. i18n ar/en/fr (Arabic-first per AX-1), RTL,
tenant-clean.
Verify in the E2E CI run, not tsc: horizons show distinct counts (6-day-out membership in Week+Month not
Today; projected collections sums correctly); revenue-by-month buckets the run's payments by product +
method matches the tally + the seeded overdue invoice ages correctly; ML-1-lapsed member appears in
churn AND win-back → log outcome → set next date → Win-back-due card carries it → reinstate flips the
row to reactivated; FULL suite green (no regression). Apply migrations via Verify-Foundation with
-f apply=true BEFORE e2e. If the sandbox can't run the browser, push so e2e.yml runs and report the run
ID; do NOT fabricate. Dev port 3000; scoped git add + git show --stat; no Claude/Co-Authored-By trailer;
never weaken RLS; stay on your branch.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / FIN-1 — Horizons + owner finances +
win-back": product-linkage derivation, timestamp findings, the win-back model, CI run ID/URL, an
explicit "Horizons + owner dashboard + churn→win-back→reactivation loop: PASS/FAIL" line, and a DRAG
READ. Then STOP and tell me FIN-1 is ready for review.
```
