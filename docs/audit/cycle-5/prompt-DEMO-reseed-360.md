# CODER PROMPT DEMO-RESEED — clean-slate 360 demo data for `proline-gym` (PROD)

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-demo-reseed-360` off `main`.
> **Goal:** reset the live demo gym to a pristine, *curated* state and reseed a **full 360 journey dataset** (Today / Week / Month + Coach-360 + Member-360) for a demo **today**. **≤ 20 members. Keep the 4 active coaches + the 4 demo login accounts. Don't over-crowd.**

## ⚠️ THIS RUNS AGAINST PRODUCTION — safety is the first requirement
- **Target tenant ONLY:** the gym with **`slug = 'proline-gym'`** (resolve its `gym_id` once into a variable). **Every** delete/insert MUST be filtered `WHERE gym_id = <that id>`. **NEVER** touch any other gym's rows (multi-tenant; this is the white-label safety). Prove it (see Verify).
- **PRESERVE, do not delete:** the `gyms` row; the catalog (`disciplines`, `belt_hierarchies`, `membership_plans`, `pt_packages`, `rentals`); the **4 active coaches** (their `coaches` + `profiles` rows); and the **4 demo login `auth.users`** (`owner@`/`coach@`/`reception@`/`student@prolinegym.lb`) + their `profiles`/`user_roles`. **Do NOT touch `auth.users` at all.** Login + password stay exactly as-is.
- **Backup BEFORE any destructive statement** (operator chose: yes). Snapshot the proline-gym subtree to a restorable artifact (a `pg_dump` filtered to the gym, or copy the gym's rows into a `demo_backup` schema). Report where it is + how to restore. Supabase PITR is also on, but take the explicit snapshot anyway.

## Build

### 0. Backup
Gym-scoped snapshot of proline-gym (all tables carrying its `gym_id` + dependent rows) → restorable file/schema. Confirm it exists and report the restore command before proceeding.

### 1. Define `reseed_proline_demo()` — idempotent, scoped, SECURITY DEFINER
A function (model it on the existing `seed_e2e_gym_*` builders in `000029`/`000040`/`000043`/`000050`/`000051`/`000054` — they already encode the correct columns, FKs, and RLS-safe inserts; **verify real columns first**). Put it in a new numbered migration `0000XX_demo_reseed.sql`:
- `SECURITY DEFINER`, `REVOKE ALL ... FROM PUBLIC`, `GRANT EXECUTE` only to the service/postgres role (mirror the `seed_e2e_gym` grants).
- **Resolve** `v_gym := (SELECT id FROM gyms WHERE slug='proline-gym')`. If null → RAISE (never seed a missing gym).
- **Idempotent + re-runnable:** running it again returns the gym to the same pristine demo state. **The migration only DEFINES the function (non-destructive apply); the destructive run is a deliberate `SELECT reseed_proline_demo();` AFTER the backup is confirmed** (so applying the migration never wipes by surprise).
- **Scoped wipe** (all `WHERE gym_id = v_gym`, correct FK/child-first order; verify real table names): `students`/members + `memberships`, `class_enrollments`(+registrations), `classes`+`class_schedules`, `pt_assignments`+`pt_sessions`, `coach_availability` (re-seed fresh), `attendance`, `invoices`+`payments`, `leads`+`trial_classes`, `notifications`, belts/promotions + `waivers`/signatures, camps + signups. **EXCLUDE the preserved set above** — in particular do NOT delete the 4 coaches' `coaches`/`profiles` rows, and do NOT delete the 4 demo-login profiles/roles. After wipe, **re-link `student@`'s profile to a freshly-seeded hero member** so the student portal is populated.

### 2. Reseed the 360 dataset (anchor ALL dates to `now()`/`current_date` so "today" = demo day; week = rolling 7d; month = current month / rolling 30d, matching the FD-2 `horizon` helpers)

**Members — 20 students total**, distributed across disciplines + the 4 coaches:
- **13 active** — `end_date` spread `+8d … +28d`; plans ~8 Monthly / 3 Quarterly / 2 Annual.
- **1 expiring TODAY** (active, `end_date = today`) + an **unpaid renewal invoice** → Today "expiring today" + Today due/overdue.
- **2 expiring THIS WEEK** (`+3d`, `+6d`; the +6d is the stable anchor — see [[e2e-karim-mutated-by-ml1]]); Monthly plan so each **renewal projects ≥ $50** → Week "renewals due this week" + projected revenue. Give them **unpaid renewal invoices**.
- **2 lapsed** (`status='lapsed'`, ended `-10d`/`-20d`) → Month churn + FIN-1 win-back queue; mark **1 as recovered this month** (reactivated) → Month "win-back recovered".

**Coaches (4, preserved) — build their data so each Coach-360 + the diary + the Week coach-load card are populated and *varied*:**
- Coach 1 (busy): 2 classes + 3 PT clients (one with **low remaining**) + availability windows incl. an **open gap today**.
- Coach 2: 1–2 classes + 2 PT clients + availability.
- Coach 3: 1 class + 1 PT client + lighter availability.
- Coach 4 (light): 1 class + availability only — so the **coach-load card shows imbalance**.

**Classes — ~5–6** across the week (M/W/F + a couple), taught by the 4 coaches:
- **1 class TODAY near "now"** (Now/Next + one-tap attendance) — enroll ~6–8 members; **leave some unmarked** for the live attendance demo.
- **Varied fill:** 1 near-full (~9/10), 1 **underfilled** (~2/12 → Week "promote" flag), rest mid.
- **Publish enough classes to the landing** (publish flags) so the public landing schedule stays populated.

**Attendance:** ~4 weeks of history for active members (Month utilization/trend) + a few marked present today.

**PT:** 6 members hold active packages (mix 5/10/20); **1–2 low/expiring-this-week** → Week "PT low → re-sell". Sessions: **2 booked today** (Today PT + diary, tied to Coach 1/2) + **3–4 this week** (diary + coach load) + several **completed this month** (Month PT-sold). Leave a couple of open availability slots today (diary "open slot").

**Money:** invoices/payments —
- **Paid THIS month across products** (membership renewals, class registrations, PT-pack sales) **+ a few LAST month** → Month "revenue by product vs last month".
- **1–2 payments dated today** → Today cash collected.
- **1–2 overdue** (issued, unpaid, past due) → Today due/overdue + Month aging.
- Unpaid **renewal invoices** for the expiring-this-week members → Week projected revenue.

**Leads / trials (pipeline — NOT counted in the 20 members):** 2 leads today + 2–3 this week (Today/Week new leads); **2 trials this week** (date / kid / assigned coach) → Week trials card; **3–4 converted this month** with varied sources (GRW-1: Instagram / walk-in / referral) → Month lead→member conversion; a couple still in Prospects.

**Belts:** assign ranks per discipline; **1–2 recent promotions** (Member-360 progress + history).
**Waivers:** signed for ~18/20; 1–2 outstanding.
**Notifications:** **~6–10 recent meaningful ones only** (Today inbox count) — NOT hundreds.
**Camp (optional, minimal):** 1 upcoming camp + 2–3 signups (Month camp signups) — include only if it doesn't crowd; otherwise omit.

**Hero members (2–3 fully fleshed for the walkthrough):**
- **`student@`'s linked member** — active membership + PT package (some remaining) + belt + 1–2 class registrations + signed waiver + invoice history (so the student portal + Member-360 are rich).
- 1–2 more for the owner walkthrough: one **expiring-this-week with a renewal due**, one with a **PT package running low**.

## Out of scope
Any other tenant/gym (NEVER touch); product/logic/schema changes beyond defining the function; the catalog (keep it); `auth.users` (keep all 4 logins). No new app code.

## Apply (PROD, via the established path)
1. **Backup** proline-gym → confirm restorable. 
2. **Apply** the migration via **Verify-Foundation** (`-f apply=true -f migrations='0000XX_demo_reseed.sql'`; confirm success per [[vf-dispatch-needs-inputs]]) — this only **defines** the function.
3. **Deliberately invoke** `SELECT reseed_proline_demo();` against prod (Supabase SQL / service connection) — the actual wipe+reseed. Re-runnable for a pristine slate before any future demo.

## Verify (report all)
1. **Tenant-scope proof:** other gyms' row counts UNCHANGED before/after (e.g., `SELECT gym_id, count(*) ... GROUP BY` for students/classes/invoices across gyms) — only proline-gym changed.
2. **Preservation proof:** the 4 `auth.users` logins still present + unchanged; the 4 coaches still present; `student@` resolves to a seeded hero member.
3. **360 readiness counts** (so the auditor can confirm each card lights up): members by status (active/expiring-today/expiring-week/lapsed); today's classes + PT + unmarked-attendance; week renewals-due (+ projected $) + trials + PT-low + per-coach load; month revenue-by-product (this vs last) + new-vs-churn + win-back-recovered + conversion + aging; per-coach (classes/PT/availability/roster) for all 4; the hero members' Member-360 completeness; landing published-class count > 0.
4. Idempotent: a second `SELECT reseed_proline_demo();` yields the same shape (no duplication, no error).

## Hygiene
Branch `prompt-demo-reseed-360` off `main`; numbered migration; **dev port 3000**; **no Claude/Co-Authored-By trailer**; scoped `git add` + `git show --stat`; never weaken RLS; **never touch another tenant or `auth.users`**.

## Hand-back
Report: backup location + restore cmd · the VF apply run · the reseed invocation · the full 360 readiness counts · tenant-scope + preservation proofs. Then STOP — the auditor verifies the 360 views + smoke-tests prod login before the demo.
