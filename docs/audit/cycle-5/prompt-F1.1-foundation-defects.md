# CODER PROMPT F1.1 — Foundation Defect Fixes (closes F1 visual gate)

> **For:** Coding agent · **Issued by:** Project Auditor · **Sequence:** Phase 0 — fixes the 3 gate-blockers V1 caught + the deploy blocker. After this, the V1 harness re-runs and F1's visual gate flips to PASS.
> Hand verbatim. Self-contained. **The auditor re-diagnosed V1-F3 — read its section carefully; the original RLS hypothesis was wrong.**

---

## Role, Skill, Lens
- **Act as `build-error-resolver` + `architect`** (`/Arsenal/ecc/agents/`), with `database-reviewer` only where RLS is genuinely involved.
- **Apply superpower `systematic-debugging`** (`/Arsenal/superpowers/skills/systematic-debugging/`): confirm each root cause by observation before fixing; verify each fix in the browser via the V1 harness.
- **Lens:** the [cross-portal-workflow-map.md](../cross-portal-workflow-map.md) identity model — the add-student fix is the same `profiles → students` chain as F1.

## Context
The V1 harness proved most of F1 but failed on three real defects + one deploy blocker. Fix all four. Auditor has verified each against the schema/code — root causes below are confirmed, not guesses.

---

### V1-F1 (P1) — Student list renders blank names
**Root cause:** [student-list.tsx](../../src/app/[locale]/(dashboard)/students/components/student-list.tsx) reads flat fields — `student.name_ar/name_en`, `student.disciplines?.name`, `student.belt_ranks.name`, `student.guardians.name` — but the server query returns **nested** shapes (`profiles.first_name_ar/_en/_fr` + `last_name_*`, joined disciplines/guardians objects).
**Fix:** Align the component with the actual query shape. Build the display name from `profiles.first_name_{locale}` + `last_name_{locale}` (fallback to en/ar), and read the joined relation fields by their real keys. Verify against the exact `select(...)` in the students page/query. Keep one source of truth for the name helper (reuse `getLocalizedName`/the i18n helper if suitable).

### V1-F2 (P1) — Add-student write path is broken (identity chain)
**Root cause:** The `students` table has ONLY: `profile_id, gym_id, emergency_contact_name, emergency_contact_phone, medical_notes, join_date, is_active`. But [student-form.tsx:73](../../src/app/[locale]/(dashboard)/students/components/student-form.tsx#L73) upserts `name_ar, name_en, phone, date_of_birth, gender, discipline_id, belt_rank, guardian_id, emergency_contact, status` (none exist) and never sets `profile_id` / creates a `profiles` row. The upsert can only fail.
**Fix:** Rebuild the add/edit write path on the identity model, atomically (prefer a `SECURITY DEFINER` RPC or a server action that does both in sequence with error handling):
1. Create a **standalone `profiles` row** (no auth user — gym-managed member, like the seeded students): `gym_id`, `first_name_{ar,en,fr}`, `last_name_{ar,en,fr}`, `phone`, `gender`, `date_of_birth`. Confirm whether `profiles.id` requires an `auth.users` FK; if not, use `gen_random_uuid()` (matches how 000006/000017 seed non-login members).
2. Create the **`students` row** linked by `profile_id`: `gym_id`, `emergency_contact_name`, `emergency_contact_phone`, `medical_notes`, `join_date`, `is_active`, and `current_belt_rank` (note: this is the belt **enum rank**, not a `belt_hierarchies` id — the form currently passes a hierarchy id; fix the mapping).
3. Optionally create a `class_enrollments` row if a discipline/class is chosen (or drop the discipline field if it doesn't map cleanly — state your choice).
4. Edit mode must update both rows.
Map the form fields to the correct tables; remove fields that don't exist in the schema or wire them to where they belong. Gym-scope everything.

### V1-F3 (P1) — Student schedule empty — NOT an RLS bug
**Auditor correction:** A correct self-policy **already exists** — `class_enrollments_self ON class_enrollments FOR SELECT USING (student_id IN (SELECT id FROM students WHERE profile_id = auth.uid()))` ([000004:137](../../supabase/migrations/000004_create_rls_policies.sql#L137)). **Do NOT add an RLS policy.**
**Real root cause:** [portal/schedule/page.tsx](../../src/app/[locale]/portal/schedule/page.tsx) embeds `class_schedules:class_id ( … )` directly on `class_enrollments`, but there is no FK `class_enrollments → class_schedules`. The embed resolves null, then `const sched = enr.class_schedules?.[0]; if (!sched) return;` **skips every enrollment** → "not enrolled in any classes."
**Fix:** Correct the query so schedules resolve — nest `class_schedules` **under `classes`** (the FK path is `class_schedules.class_id → classes.id`), e.g. `classes:class_id ( …, class_schedules ( day_of_week, start_time, end_time ) )`, and update the grouping code to read `enr.classes.class_schedules` (an array — a class can have multiple weekly slots; render each). Confirm with the harness that `student@` now sees the Muay Thai Beginner slots (Mon/Wed 18:00).

### V1-F4 (P2, pre-deploy) — Production `next start` 500s on every route
**Root cause:** middleware uses Node `crypto` in the Edge runtime. Dev works; prod build 500s — so the harness currently runs against `next dev`.
**Fix:** Make the middleware Edge-compatible (use Web Crypto / `globalThis.crypto`, or move the offending logic out of middleware). Goal: `next build && next start` serves routes without 500s, so the harness can run against the **production** build. If a deeper refactor is needed, fix the immediate 500 and note any follow-up.

---

## Acceptance Criteria (the V1 harness is the judge)
1. **V1-F1:** owner & reception `/students` show real names (not blank).
2. **V1-F2:** owner adds a student via the form → it persists (profile + student rows) and appears in the list. Harness write-path spec passes.
3. **V1-F3:** `student@` `/portal/schedule` shows the enrolled class with its Mon/Wed slots.
4. **V1-F4:** `next build && next start` serves all routes (no 500s); point the harness at the prod build if feasible.
5. The full V1 harness run is **green (0 failures)** → **F1 visual gate = PASS**. `tsc` + `next build` clean.

## REQUIRED — Update the shared progress file
Append to **`audit-cycle-update.md`**, heading `## Cycle 5 / Phase 0 / Prompt F1.1 — Foundation Defect Fixes`. For each of V1-F1…F4: root cause confirmed, fix, and the harness result (PASS/FAIL with screenshot ref). End with an explicit **"F1 visual gate: PASS/FAIL"** and the harness pass/fail count.

## Scope discipline & hand-back
Fix only these four defects + whatever the identity-correct add-student requires. No new features. Stop after updating `audit-cycle-update.md`; report whether the gate is green. Next the auditor issues **Prompt 22-R** (re-validate the PT slice, adding a PT cross-portal spec to the harness).

---

### Copy-paste pointer for the coder
```text
You are the coding agent for the PRO LINE Gym Platform.
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Your next task is fully specified here — read it in full and execute it exactly:
  docs/audit/cycle-5/prompt-F1.1-foundation-defects.md

Fix the 3 gate-blockers V1 caught + the deploy blocker. IMPORTANT: the auditor re-diagnosed V1-F3 — it is NOT an RLS gap (a class_enrollments_self policy already exists); the real bug is the schedule query embedding class_schedules wrong so enrollments get skipped. Don't add an RLS policy. Fix add-student on the profiles→students identity chain (the table has no name/phone/discipline columns). Verify EVERY fix by re-running the V1 Playwright harness until it's green — that is the judge, not tsc. When done, append results to audit-cycle-update.md under "Cycle 5 / Phase 0 / Prompt F1.1 — Foundation Defect Fixes" with a per-defect PASS/FAIL table and an explicit "F1 visual gate: PASS/FAIL" line. Then STOP and tell me F1.1 is ready for review.
```
