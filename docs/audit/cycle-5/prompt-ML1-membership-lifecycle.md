# CODER PROMPT ML-1 — Membership lifecycle: renewals, dunning/lapse, freeze, plan change (D2+D3 combined)

> **For:** the MAIN coding agent (mainline) · **Issued by:** Project Auditor · **Sequence:** after PT-2 merges (branch `prompt-ml1-lifecycle` off post-PT-2 `main`). Operator forks LOCKED 2026-06-12 (§Design). Spans BOTH monthly products: gym memberships (`student_memberships` + plans) and recurring-class registrations (`class_registrations`, B2).

## Strategic context
The monthly-revenue engine is still manual: nothing issues renewals, nothing chases overdue, freeze doesn't exist, "active" never expires. This slice is why the gym stops keeping the Excel sheet: **the system remembers** — it issues, reminds, flips state honestly, and staff act from Today/Member-360. FD-1's Expiring card and Money card were built as docking stations for exactly this. **Tenant-clean active.**

## Design (operator-locked)
1. **Plan change:** next cycle, NO proration — a pending plan change recorded now, applied at renewal (manual discount bridges exceptions).
2. **Renewals:** AUTO-ISSUE the renewal invoice `renewal_lead_days` (default 7) before period end for BOTH products + member nudge ("renew at the desk"). Idempotent (never two open renewal invoices for one period).
3. **Dunning/lapse:** reminders at due date and +3d (bell now; G1 will add WhatsApp); unpaid past `dunning_grace_days` (default 7) beyond period end → **LAPSED** (memberships) / **SUSPENDED** (class registrations — roster seat frees, B2 waitlist auto-promote may fire). Check-in shows a warning, NOT a door-block. One-tap reinstate; payment of the renewal reactivates.
4. **Freeze (memberships):** bounded — `freeze_max_days_year` (30), `freeze_min_chunk_days` (7); freeze extends `end_date` by the frozen days; frozen members are excluded from renewal/dunning; auto-unfreeze on the planned date; staff one-tap unfreeze early (end_date adjusts to actual frozen days).

## Architecture rule (read-time + one tick)
- **All states computed at read time** for UI (expiring/overdue/lapsed badges, cards, filters) — no state can be *displayed* stale.
- **ONE daily tick materializes side-effects only** (issue renewal invoices via the `_system_issue_invoice` delegate, send dedup-guarded notifications, flip lapsed/suspended, auto-unfreeze): a SECURITY DEFINER `run_lifecycle_tick(p_gym_id UUID DEFAULT NULL)` — global when NULL (cron), gym-scoped otherwise. **Idempotent by construction** (safe to run twice: guards on existing open invoices / already-sent markers / current state).
- **Scheduling, in preference order:** (a) `pg_cron` on the cloud project (CREATE EXTENSION IF NOT EXISTS + `cron.schedule` daily, in the migration — verify availability on the project first); (b) fallback: a GitHub Actions scheduled workflow invoking the tick via the existing Management-API `run_sql` plumbing. Implement ONE, document which and why.
- **Staff manual trigger:** a staff-gated wrapper (own gym only) behind a "Process renewals now" action on the Money Overview — also how the e2e drives the tick deterministically.

## Build
1. **Migrations (next free numbers):** verify REAL columns/enums of `student_memberships` + `class_registrations` first (the rule). Add as needed: membership status values (lapsed/frozen — extend the real enum idiomatically), `membership_freezes` table (membership_id, start, planned_end, actual_end, days; the bounds live in policy), pending-plan-change column or table, gym policy cols (`renewal_lead_days` 7 · `dunning_grace_days` 7 · `freeze_max_days_year` 30 · `freeze_min_chunk_days` 7), renewal-invoice linkage (invoice reference → product + period so payment can activate), notification-dedup support. RPCs: `run_lifecycle_tick` (+ cron schedule or GH-cron), `freeze_membership` / `unfreeze_membership` (bounds enforced), `change_membership_plan` (pending, next-cycle), `renew_now` (staff one-tap = issue the renewal invoice immediately), `reinstate_membership`. **Activation on payment:** when a renewal invoice is PAID, the new period activates / lapse reverses — design this inside the D1 canon (extend `record_payment` minimally with the renewal hook, or an invoice-paid trigger; `database-reviewer` decides with you; D1's overpayment/status logic must remain byte-identical otherwise).
2. **Member-360 membership card** (the D2 docking slot from IA-2): live status (active/expiring/lapsed/frozen + period), actions — Renew now · Freeze/Unfreeze (bounds shown) · Change plan (effective next cycle) · Reinstate. Class-registrations panel rows get their renewal/suspended state too.
3. **Today docking cards** (FD-1 contract): the Expiring card gains the one-tap **Renew** row action; NEW **Chase list** card (overdue renewals + lapsed, per member, tel: + record-payment actions). Money Overview gains outstanding-renewals summary + the "Process renewals now" staff trigger.
4. **Portal:** member/guardian sees the renewal invoice + a status banner when expiring/lapsed ("renew at the desk"); freeze state visible. No self-service freeze/cancel (staff-mediated).
5. **Check-in surface:** attendance marking shows a non-blocking warning when the member is lapsed/suspended.
6. i18n ar/en/fr · RTL · tenant-clean. **The parallel lane is FROZEN — you own all surfaces; no fence.**

## Rider — demo-gym hygiene (one-off run_sql, NOT a migration)
The operator manually deleted ~200 rows via the Supabase table editor (pt_sessions/profiles/invoices). The auditor's integrity audit (VF run 27413743680) found the damage minor but real — repair it in a one-off:
1. ONE active demo-gym class points at a missing/inactive coach → reassign to an active demo coach (or archive the class).
2. ONE orphan pt_session without an assignment → archive/delete it.
3. **921 notifications** in the demo gym (residue the operator could not see to clean) → delete all but the latest ~20 per demo user.
4. Re-run the integrity counts after (same queries, in the one-off) and include before/after in the report.

## Out of scope
Proration; online payment; WhatsApp sends (G1 docks into the same notifications); auto-cancel of lapsed members (human decision); per-member custom pricing beyond existing discounts.

## Verify (e2e, ephemeral TI gym — drive the tick via the staff wrapper)
1. **Renewal:** seeded membership ending inside lead-time → staff "Process renewals now" → renewal invoice exists (correct plan price, payer rules), member notified, Today Expiring row shows Renew → tick re-run issues NOTHING new (idempotency assert).
2. **Activation:** pay the renewal invoice (D1 form) → period extends/activates; member file + portal reflect it.
3. **Dunning→lapse→reinstate:** seeded membership past end+grace with unpaid renewal → tick → LAPSED; check-in warning renders; member in the owing/chase lists; pay → reactivates (or staff Reinstate).
4. **Freeze:** freeze 10d from the member file → end_date +10, excluded from tick effects; early unfreeze adjusts; bounds enforced (an 80-day freeze attempt fails with the policy message).
5. **Plan change:** schedule a change → next renewal invoice carries the NEW plan price; current period untouched.
6. **Class registration:** active registration near period end → tick issues its monthly invoice; unpaid past grace → SUSPENDED → roster seat frees (assert B2 waitlist promotion fires if a waitlister exists).
7. Full suite green — no regression (PT-2's count + ML-1 tests).

## Acceptance
1. The seven proofs green in E2E CI (run ID/URL); tick idempotency explicitly asserted.
2. `database-reviewer`: D1 canon preserved (record_payment diff minimal + named), `_system_issue_invoice` used for system issuance, all RPCs guarded + REVOKEd, no RLS weakened; scheduling mechanism documented (pg_cron vs GH-cron + why).
3. Real-columns audit of both product tables reported; every schema addition named.
4. i18n complete; `tsc`+`build` clean.

## Hygiene
Branch `prompt-ml1-lifecycle` off post-PT-2 `main`; **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; TI ephemeral gym; migrations via Verify-Foundation (`-f apply=true -f migrations=…`) before e2e; stay on your branch.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / ML-1 — Membership lifecycle`: real-columns audit, schema additions, the tick design + chosen scheduler, the D1-canon diff (named), CI run ID/URL, an explicit **"Auto-renew → dunning → lapse → reinstate + bounded freeze + next-cycle plan change: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Next: **FRX (i18n bypass refactor) then ON-1 (portal invite)**.

---

### Copy-paste activation block for the MAINLINE coder (hand off ONLY after the auditor confirms PT-2 is merged)
```text
You are the MAIN coding agent for the PRO LINE Gym Platform (mainline track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-ml1-lifecycle off main (git checkout main && git pull && git checkout -b
prompt-ml1-lifecycle — main must contain PT-2; verify book_pt_session exists before starting).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-ML1-membership-lifecycle.md
(operator forks LOCKED in §Design — do not re-decide)

This is D2+D3 combined for BOTH monthly products (memberships + B2 class registrations). Architecture
rule: ALL states computed at read time; ONE idempotent daily tick materializes side-effects only
(invoices via _system_issue_invoice, dedup-guarded notifications, lapse/suspend flips, auto-unfreeze) —
SECURITY DEFINER run_lifecycle_tick(p_gym_id DEFAULT NULL), scheduled via pg_cron if available on the
cloud project else a GH-Actions cron through the existing run_sql plumbing (implement ONE, document
why); plus a staff-gated own-gym wrapper behind "Process renewals now" (also the e2e driver).
Do: (1) MIGRATIONS (next free numbers): REAL-columns audit of student_memberships +
class_registrations FIRST; add only what's missing — lapsed/frozen status values (extend the real enum
idiomatically), membership_freezes table, pending plan change, gym policy cols renewal_lead_days(7)/
dunning_grace_days(7)/freeze_max_days_year(30)/freeze_min_chunk_days(7), renewal-invoice linkage
(reference → product+period), notification dedup; RPCs run_lifecycle_tick / freeze_membership /
unfreeze_membership (bounds enforced) / change_membership_plan (next-cycle) / renew_now /
reinstate_membership — all guarded + REVOKE FROM PUBLIC; ACTIVATION ON PAYMENT designed inside the D1
canon (minimal named extension of record_payment or an invoice-paid trigger — database-reviewer decides
with you; D1's overpayment/status logic stays byte-identical otherwise). (2) Member-360 membership card
(the IA-2 D2 slot): live status + Renew now · Freeze/Unfreeze (bounds shown) · Change plan ·
Reinstate; class-registration rows show renewal/suspended state. (3) TODAY (FD-1 contract): Expiring
card gains one-tap Renew; NEW Chase-list card (overdue + lapsed, tel: + record-payment); Money Overview
gains outstanding-renewals + "Process renewals now". (4) PORTAL: renewal invoice + expiring/lapsed
banner ("renew at the desk"); freeze visible; no self-service freeze/cancel. (5) CHECK-IN: non-blocking
lapsed/suspended warning at attendance marking. (6) Dunning: reminders at due +3d (bell; dedup-
guarded); past grace → membership LAPSED / registration SUSPENDED (seat frees — B2 waitlist
auto-promote may fire); payment or staff Reinstate reactivates. i18n ar/en/fr, RTL, tenant-clean. The
parallel lane is FROZEN — all surfaces are yours.
Verify in the E2E CI run, not tsc (drive the tick via the staff wrapper): renewal auto-issued inside
lead-time w/ correct plan price + nudge + Today Renew row, tick RE-RUN issues nothing (idempotency
assert); paying the renewal extends/activates; past-grace unpaid → LAPSED + check-in warning + chase
list → payment/reinstate reactivates; freeze 10d → end_date+10 + excluded from tick, early unfreeze
adjusts, 80d attempt fails with the policy message; scheduled plan change → next renewal carries the
NEW price; class registration: tick issues its monthly invoice, past-grace → SUSPENDED → seat frees
(waitlist promotion asserted); FULL suite green (no regression). Apply migrations via Verify-Foundation
with -f apply=true -f migrations=… BEFORE e2e. If the sandbox can't run the browser, push so e2e.yml
runs and report the run ID; do NOT fabricate. Dev port 3000; scoped git add + git show --stat; no
Claude/Co-Authored-By trailer; never weaken RLS; stay on your branch (auditor docs may land on main —
don't rebase mid-run; report divergence).
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / ML-1 — Membership lifecycle": real-
columns audit, schema additions, tick design + chosen scheduler + why, the named D1-canon diff, CI run
ID/URL, an explicit "Auto-renew → dunning → lapse → reinstate + bounded freeze + next-cycle plan
change: PASS/FAIL" line, and a DRAG READ. Then STOP and tell me ML-1 is ready for review.
```
