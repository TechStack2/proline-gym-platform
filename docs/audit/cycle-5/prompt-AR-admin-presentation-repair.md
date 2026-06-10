# CODER PROMPT AR — Admin Presentation Repair (schema-correct sweep) + Payments History

> **For:** Coding agent (ONE agent, sequential) · **Issued by:** Project Auditor · **Sequence:** V1 slice #2 (after FK-fix). Branch `prompt-ar-admin-repair` off `main`.
> **Why:** the admin presentation layer is **uniformly DOA against the real normalized schema** — the leaf-rot the strangler thesis predicted ([[strangle-validated-leaf-rot]]). Queries hit columns that don't exist (`coaches/students.first_name`, `class_enrollments.status`) or filter embedded relations via a top-level `.or()`. The gym **cannot operate** with DOA classes/students admin pages. This slice repairs them all + rebuilds the payments-history view.
> Self-contained. **Correctness repair + one small rebuild — not a new journey.**

---

## Role, Skill, Lens
- **Act as `database-reviewer` + `e2e-runner`** (+ `architect` for the payments-history view): repair every query against the **real normalized schema**; lock each surface with behavior coverage so it can't silently re-break.
- **Apply superpower `systematic-debugging`**: this is **one bug class** (queries against an imagined denormalized schema). **Sweep for ALL instances — do not whack-a-mole.** Then `verification-before-completion`.
- **Lens:** restore Portal D's "Core CRUD 4/5" from *written-against-a-fantasy-schema* to *actually functional*.

## The real schema (use these — the queries currently don't)
- **Names live on `profiles`** (`first_name_ar/en/fr`, `last_name_ar/en/fr`). `coaches` and `students` have **no** name columns — they join `profile_id → profiles`. Render names via the profiles join, locale-aware.
- **Enrollment "active" = `class_enrollments.is_active`** (boolean) — there is **no** `class_enrollments.status`.
- `classes.status` (class_status_enum) **does** exist; `disciplines` has no `status`.
- Don't filter embedded relation columns via a **top-level `.or()`** — that's the broken pattern.

## Strategic context
Closes the Phase-1 carried **admin-presentation DOA cluster** (same root cause as 23-R `/invoices` + 24-R class-detail 404). **V1 must-have** (operability). No new benchmark capability — it makes the existing Portal-D CRUD (4/5) actually render.

## What you are building

### 1. Comprehensive schema-correct sweep (repair ALL, not just the known three)
- **Classes list** ([classes/page.tsx](../../src/app/[locale]/(dashboard)/classes/page.tsx)): coach name via `coaches→profiles`; enrollment counts via `class_enrollments.is_active` (not `.status`).
- **Class detail / enrolled list** ([ClassDetail.tsx:99,159](../../src/app/[locale]/(dashboard)/classes/[id]/ClassDetail.tsx#L99)): render coach + enrolled-student **names via profiles** (currently blank).
- **Students search** ([students/page.tsx:56](../../src/app/[locale]/(dashboard)/students/page.tsx#L56)): make search work on normalized `profiles` name/phone — via a correct embedded-filter pattern or a small search RPC; **not** the broken top-level `.or()` on embedded columns.
- **SWEEP the rest of `(dashboard)`** for the same bug class (grep for `coaches`/`students` selecting `first_name/last_name/email`, `*.status` where the column is `is_active`, top-level `.or()` over embedded columns) and repair every instance. List what you found + fixed.

### 2. i18n MISSING_MESSAGE fixes
- Add the missing keys (`students.status.active`, `students.cancel/female/gender/male`, + any others the sweep surfaces) to **ar/en/fr**. No `MISSING_MESSAGE` on any repaired surface.

### 3. Rebuild `/payments` into a real Payments-History view (decided: rebuild, not delete)
- Replace the legacy DOA `/payments` husk with a **staff-only, gym-scoped payments-history/audit view**: per-payment **date · method (cash USD/LBP/OMT/Whish) · reference · amount (USD+LBP) · linked invoice # · member**, reading the `payments` table (now correctly written by D1's `record_payment`). Filter by **date range + method**; pairs with D1's per-method daily tally. Arabic-RTL.
- The unused invoice husks (`invoice-list/stats/filters`) — **if** truly dead (superseded by D1's `/invoices`), delete them; **if** the rebuilt view reuses any, keep + repair. Confirm via the sweep; report the disposition.

## Verification (ephemeral run gym + TI helpers)
Extend the suite (in the run gym, `visibleShell`/helpers): **classes list** renders with coach names + correct enrollment counts; **class detail** shows enrolled student **names** (not blank); **students search** returns the seeded student by name + phone; **payments-history** shows a recorded payment (date/method/reference/amount/invoice/member). Assert **no `MISSING_MESSAGE`** on these surfaces.

## Acceptance Criteria
1. Every repaired admin surface **renders real data** (names, counts) and **search works** — green in CI (run ID/URL).
2. The **sweep is comprehensive** — report every schema-mismatched query found + fixed; no known DOA admin query remains.
3. Payments-history view works (staff-only, gym-scoped, filterable); husk disposition reported.
4. No `MISSING_MESSAGE` on repaired surfaces.
5. `tsc` + `next build` clean. No RLS/auth weakened; admin stays staff-only.

> **Honesty rule:** verify in CI; if the sandbox can't run the browser, push so `e2e.yml` runs and report the run ID; do not fabricate.

## Hygiene
Scope every `git add` (never `-A`); `node_modules` gitignored; branch `prompt-ar-admin-repair` off `main`; **dev on port 3000**; use the TI ephemeral-gym + helpers; login `button[type="submit"]`; **no Claude/Co-Authored-By trailer in commits**.

## REQUIRED — Update the shared progress file
Append to **`audit-cycle-update.md`**, heading `## Cycle 5 / V1 / AR — Admin Presentation Repair`. Include: the **full list of schema-mismatched queries found + fixed** (file:line), the students-search approach, the payments-history view + husk disposition, the i18n keys added, the CI run ID/URL, an explicit **"Admin surfaces render real data: PASS/FAIL"** line, and a short **DRAG READ**.

## Scope discipline & hand-back
Admin presentation correctness + the payments-history rebuild + i18n gaps only. No new journeys, no member-facing features, no RLS changes. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Next the auditor designs **B2 — self-service booking + waitlist** (the marquee member-engagement slice).

---

### Copy-paste pointer for the coder
```text
You are the coding agent for the PRO LINE Gym Platform.
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-ar-admin-repair off main (git checkout main && git pull && git checkout -b prompt-ar-admin-repair).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-AR-admin-presentation-repair.md

Repair the admin presentation layer — it's uniformly DOA against the REAL normalized schema (one bug
class: queries hit columns that don't exist). SWEEP for ALL instances, don't whack-a-mole.
Real schema: names live on PROFILES (first_name_*/last_name_* per locale); coaches/students have NO name
cols (join profile_id→profiles); enrollment-active = class_enrollments.is_active (NO .status col);
classes.status exists; don't filter embedded relations via a top-level .or().
Fix: (1) classes list (coach name via coaches→profiles; counts via is_active not status); (2) class
detail + enrolled list (coach + student NAMES via profiles — currently blank); (3) students search
(work on normalized profiles name/phone via a correct embedded-filter pattern or a small search RPC,
NOT the broken top-level .or()); (4) SWEEP the rest of (dashboard) for the same bug class + repair all,
listing what you found. (5) i18n: add missing keys (students.status.active, cancel/female/gender/male,
+ any others) to ar/en/fr — no MISSING_MESSAGE. (6) REBUILD /payments into a real payments-history view:
staff-only, gym-scoped, per-payment date/method/reference/amount(USD+LBP)/invoice#/member, filter by
date+method (pairs with D1's tally), Arabic-RTL; delete the truly-dead invoice husks (invoice-list/
stats/filters) if superseded by D1's /invoices, report disposition.
Verify in the ephemeral run gym with the TI helpers (CI, not tsc): classes list renders coach names +
counts; class detail shows enrolled student NAMES; students search returns the seeded student by name+
phone; payments-history shows a recorded payment; no MISSING_MESSAGE. If the sandbox can't run the
browser, push so e2e.yml runs and report the run ID; do NOT fabricate. Scope every git add (never -A);
node_modules gitignored; dev on port 3000; no Claude/Co-Authored-By trailer in commits; don't weaken RLS.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / AR — Admin Presentation Repair" with the
full list of schema-mismatched queries found+fixed (file:line), the students-search approach, the
payments-history view + husk disposition, the i18n keys, the CI run ID/URL, an explicit "Admin surfaces
render real data: PASS/FAIL" line, and a short DRAG READ. Then STOP and tell me AR is ready for review.
```
