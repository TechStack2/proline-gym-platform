# PT Packages Module — Deep Code Review

**Date:** 2026-06-08  
**Reviewer:** Roo (Debug mode)  
**Scope:** Full read-only audit of the Personal Training Packages module  
**Files Examined:**

| File | Path |
|------|------|
| Server Page | [`pt/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/page.tsx) |
| Client Component | [`pt/pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx) |
| Zod Validators | [`pt.schema.ts`](../../src/lib/validators/pt.schema.ts) |
| DB Types | [`database.ts`](../../src/types/database.ts) (lines 1668–1810) |
| i18n (EN) | [`en.json`](../../src/i18n/messages/en.json) (lines 594–620) |
| Migration: Tables | [`000003_create_operational_tables.sql`](../../supabase/migrations/000003_create_operational_tables.sql) (lines 205–245) |
| Migration: RLS | [`000004_create_rls_policies.sql`](../../supabase/migrations/000004_create_rls_policies.sql) (lines 29–30, 194–205) |
| Migration: Seed | [`000006_seed_data.sql`](../../supabase/migrations/000006_seed_data.sql) (lines 120–140) |
| Dispatch Spec | [`dispatch-spec.json`](../../../../Shared/missions/phase-c-refinements/dispatch-spec.json) (agent `c2-pt-packages`) |
| Type Exports | [`types/index.ts`](../../src/types/index.ts) (lines 24–25, 87) |
| Offline Schema | [`db/schema.ts`](../../src/lib/db/schema.ts) (lines 408–409, 438–439) |

---

## 1. Issues Table

| # | File | Line(s) | Severity | Issue | Root Cause |
|---|------|---------|----------|-------|------------|
| 1 | [`pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx) | 92 | **CRITICAL** | `gym_id` hardcoded to `'00000000-0000-0000-0000-000000000000'` with comment "will be set by RLS/server context" — but the insert payload sends this literal UUID to Supabase. The DB column `gym_id` is `NOT NULL` and has no default. RLS policy `pt_packages_staff` checks `gym_id = get_user_gym_id()`, so the insert will either (a) fail FK constraint because no gym has that UUID, or (b) be blocked by RLS because the gym_id in the row doesn't match the user's gym. **Package creation is broken.** | Developer assumed RLS would overwrite the gym_id, but RLS only filters/checks — it doesn't mutate payloads. |
| 2 | [`pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx) | 103–110 | **CRITICAL** | Insert omits `gym_id` from the actual Supabase insert payload (line 103–110 sends only `name_ar`, `name_en`, `name_fr`, `session_count`, `price_usd`, `validity_days`). The canonical object at line 85–93 includes `gym_id`, but it's only used for Zod validation — the actual insert at line 103–110 reconstructs the payload from raw form data and **drops gym_id entirely**. | Copy-paste error: the insert payload is built from raw `data.*` fields instead of reusing the validated `canonical` object. |
| 3 | [`pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx) | 118–151 | **CRITICAL** | `handleAssign` creates a `pt_sessions` row with `scheduled_at: now` and `status: 'scheduled'` — this is **not a package assignment**, it's a **session booking**. There is no `pt_credits` or `pt_assignments` table. The system has no mechanism to track "Student X has Package Y with N remaining sessions." Assigning a package should create a credit record, not a session. | Missing domain model: no credit/entitlement table exists. The dispatch spec itself says "link the package to a student via pt_sessions or student_memberships" — this was a design shortcut that conflates booking with entitlement. |
| 4 | [`pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx) | 126, 142 | **HIGH** | `coach_id` hardcoded to `'00000000-0000-0000-0000-000000000000'` in the booking payload. `pt_sessions.coach_id` is `NOT NULL` and references `coaches(id)`. This UUID won't exist in the coaches table → **FK violation on every assignment**. | Placeholder UUID never replaced with actual coach selection. No coach picker in the UI. |
| 5 | [`pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx) | 83–116 | **HIGH** | No `try/catch` around the Supabase insert. If the insert fails (FK, RLS, network), the error is silently swallowed — `setSubmitting(false)` runs but the user sees no feedback. The `if (!error)` check at line 111 only handles the success path. | Missing error handling pattern. |
| 6 | [`pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx) | 118–151 | **HIGH** | Same missing `try/catch` in `handleAssign`. Network errors or DB constraint violations are silent. | Missing error handling pattern. |
| 7 | [`pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx) | 98, 135 | **MEDIUM** | Uses `alert()` for validation errors instead of toast notifications. The rest of the app uses `sonner`/`react-hot-toast` (no toast library detected in this file). | Inconsistent UX pattern; likely a V1 shortcut. |
| 8 | [`pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx) | 216 | **MEDIUM** | Hardcoded locale ternary: `locale === 'ar' ? pkg.name_ar : locale === 'fr' ? pkg.name_fr : pkg.name_en`. This is one of the 2 hardcoded ternaries mentioned in the task description. Should use a lookup map or i18n helper. | Missing i18n abstraction for tri-lingual field selection. |
| 9 | [`pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx) | 189 | **LOW** | Hardcoded string `"Price USD"` instead of using `t('price_usd')` or similar i18n key. This is the second hardcoded locale string. | Developer missed i18n wiring. |
| 10 | [`pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx) | 55 | **MEDIUM** | `as any` type cast on the student mapping in `page.tsx` line 55, and the `PtStudent` type in `pt-client.tsx` line 28–38 uses `Partial<>` for user fields. The server query uses a nested `profile:profiles(...)` join but the client type expects `user: {...}`. The mapping at page.tsx line 54 renames `profile` to `user`, but the type safety is lost. | Type mismatch between server query shape and client prop interface. |
| 11 | [`pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx) | 17–24 | **LOW** | Local form schema `ptPackageFormSchema` duplicates fields from the canonical Zod schema at [`pt.schema.ts`](../../src/lib/validators/pt.schema.ts). The local schema uses strings for numbers (`session_count: z.string()`) while the canonical uses `z.number().int().positive()`. This double-validation adds complexity without benefit. | Redundant schema layer; could use the canonical schema directly with transformation. |
| 12 | [`pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx) | 83–116 | **MEDIUM** | No UI feedback on successful package creation. The modal closes and form resets (lines 112–113), but there's no toast, no refetch, and the package list doesn't update until page refresh. The `packages` state (line 62) is initialized from server props and never mutated. | Missing optimistic update or refetch after create. |
| 13 | [`pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx) | 118–151 | **MEDIUM** | Same issue on assignment: no UI feedback, no list refresh. The `assignPkg` state resets but the package list doesn't reflect the assignment. | Missing optimistic update or refetch. |
| 14 | [`pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx) | 65–66 | **LOW** | Assignment state (`assignPkg`, `assignStudent`) is managed per-component, not per-card. If a user opens assignment on one card and then another, the first card's state is lost. | Single state variables for multi-card UI. |
| 15 | [`page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/page.tsx) | 32–36 | **LOW** | Students query fetches all active students regardless of whether they have PT packages. For a gym with many non-PT students, this list will be noisy. No filter for "students with PT packages" or "students eligible for PT." | Missing query optimization. |
| 16 | [`pt.schema.ts`](../../src/lib/validators/pt.schema.ts) | 1–40 | **LOW** | `ptPackageInsertSchema` requires `gym_id` as a required UUID, but the client never sends a real one (see issue #1). The schema is technically correct but unused for its intended purpose in the client. | Schema-client disconnect. |
| 17 | DB Schema | — | **INFO** | No `pt_credits` or `pt_assignments` table exists in any migration. The only PT tables are `pt_packages` (package definitions) and `pt_sessions` (individual session bookings). | Design gap: credit tracking was never implemented at the DB level. |
| 18 | i18n | — | **LOW** | i18n keys exist for the PT module (lines 594–620 in `en.json`) but are missing keys for: `price_usd`, `name_en_placeholder`, `name_fr_placeholder`, `description_*` fields, `edit`, `delete`, `confirm_delete`, `sessions_remaining`, `no_credits`. | Incomplete i18n coverage. |
| 19 | [`page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/page.tsx) | 26–30 | **LOW** | No `error` handling on the packages query. If the query fails, `packages` is `null` and the client receives an empty array (`packages || []`). Silent failure. | Missing error boundary or fallback UI. |
| 20 | [`page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/page.tsx) | 32–36 | **LOW** | Same silent failure on students query. | Missing error handling. |

---

## 2. Summary Counts by Severity

| Severity | Count | Description |
|----------|-------|-------------|
| **CRITICAL** | 3 | Data loss / broken functionality / missing domain model |
| **HIGH** | 3 | Silent failures, FK violations, no error handling |
| **MEDIUM** | 5 | UX gaps, type safety, hardcoded strings, missing refetch |
| **LOW** | 7 | Optimization, i18n gaps, minor type issues |
| **INFO** | 2 | Design observations |
| **Total** | **20** | |

---

## 3. Top 3 Critical Fixes

### Fix 1: Gym ID is never sent to the DB (Issues #1, #2)
**Problem:** The insert payload at [`pt-client.tsx:103-110`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx:103) omits `gym_id`. The hardcoded UUID at line 92 is only used for Zod validation, not for the actual DB insert. The DB column `gym_id` is `NOT NULL` with no default → every package creation fails with a constraint violation or RLS block.

**Fix:** Pass the real `gym_id` from the server page props down to the client, and include it in the insert payload. Reuse the validated `canonical` object instead of rebuilding the payload from raw form data.

### Fix 2: No credit tracking — package assignment creates a session, not an entitlement (Issue #3)
**Problem:** There is no `pt_credits` or `pt_assignments` table. When a coach "assigns" a package to a student, the code creates a `pt_sessions` row with `scheduled_at: now`. This means:
- The student gets **one session** booked immediately, not a package of N sessions
- There is no way to track "X of Y sessions remaining"
- There is no way to see remaining sessions per student
- The `session_count` field on the package is never used after creation

**Fix:** Create a `pt_credits` table (`student_id`, `package_id`, `total_sessions`, `used_sessions`, `purchased_at`, `expires_at`). The "Assign" button should insert into `pt_credits`, not `pt_sessions`. Sessions are then booked against credits, decrementing `used_sessions`.

### Fix 3: Coach ID is a fake UUID that will never resolve (Issue #4)
**Problem:** [`pt-client.tsx:126,142`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx:126) hardcodes `coach_id` as `'00000000-0000-0000-0000-000000000000'`. The `pt_sessions.coach_id` column is `NOT NULL` with a FK to `coaches(id)`. This UUID doesn't exist → every assignment attempt fails with a foreign key violation.

**Fix:** Add a coach selector to the assignment UI, or derive the coach ID from the authenticated user's coach profile (if the user is a coach). Pass the real coach ID from the server session.

---

## 4. Functional Completeness

### Answer: **NO** — The module is functionally incomplete.

| Area | Status | Details |
|------|--------|---------|
| **Package CRUD** | ❌ Broken | Create fails due to missing `gym_id` (Issues #1, #2). No Edit or Delete functionality exists at all. |
| **Credit Tracking** | ❌ Missing entirely | No `pt_credits` table. No way to track remaining sessions. The `session_count` field on packages is decorative. |
| **Session Booking** | ❌ Broken | Assignment creates a session with a fake `coach_id` (Issue #4). No calendar, no time slot selection, no conflict detection. |
| **Package Assignment** | ❌ Misimplemented | "Assign" creates a session instead of a credit entitlement (Issue #3). No way to see which students have which packages. |
| **i18n** | ⚠️ Partial | 2 hardcoded strings remain (Issues #8, #9). Missing keys for price, edit/delete actions, and credit display. |
| **Zod Validation** | ✅ Present but disconnected | Schema exists and is correct, but the client bypasses it for the actual DB insert (Issue #2). |
| **Error Handling** | ❌ Poor | No `try/catch`, no toasts, uses `alert()`. Silent failures on all DB operations. |
| **TypeScript Safety** | ⚠️ Partial | `as any` cast (Issue #10). Type mismatch between server query and client props. |
| **RLS** | ✅ Correct | Policies are well-structured with gym scoping and role-based access. |
| **Offline Support** | ✅ Schema present | `pt_packages` and `pt_sessions` are registered in the offline sync engine. |

---

## 5. Is Credit Tracking Broken? How Exactly?

**Yes, credit tracking is completely non-functional.** Here is the precise breakdown:

### What exists:
- `pt_packages` table has a `session_count` column (e.g., 5, 10, 20 sessions)
- `pt_sessions` table records individual session bookings with a FK to `pt_packages`

### What does NOT exist:
1. **No `pt_credits` or `pt_assignments` table** — There is no database entity that represents "Student X purchased Package Y and has N remaining sessions."
2. **No `used_sessions` or `remaining_sessions` column** — The `pt_sessions` table has no counter or aggregation mechanism.
3. **No query that computes remaining sessions** — There is no SQL or application logic anywhere that counts `pt_sessions` rows grouped by `(student_id, package_id)` and subtracts from `pt_packages.session_count`.
4. **No UI for remaining sessions** — The client component shows `pkg.session_count` (total) and `pkg.validity_days`, but never shows "X of Y sessions used" or "Z sessions remaining."
5. **No consumption workflow** — When a session is completed (`status = 'completed'`), nothing decrements a credit counter because no counter exists.

### The assignment bug (how it manifests):
When a coach clicks "Assign to Student" and selects a student, the code at [`pt-client.tsx:139-146`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx:139) inserts a row into `pt_sessions` with `scheduled_at: now` and `status: 'scheduled'`. This means:

- **A session is immediately booked for right now**, not a package entitlement
- If the coach assigns a 10-session package, they'd need to click "Assign" 10 times to create 10 sessions
- There is no way to see "Student X has 7 of 10 sessions remaining"
- The `session_count` on the package is never referenced after creation

### What coaches actually see:
- Package cards show `session_count` (e.g., "10 sessions") — this is the **total**, not the remaining
- No per-student credit view exists anywhere in the UI
- No way to know which students have active packages

### To fix:
1. Create `pt_credits` table: `(id, student_id, package_id, total_sessions, used_sessions DEFAULT 0, purchased_at, expires_at, is_active)`
2. Change "Assign" to insert into `pt_credits` instead of `pt_sessions`
3. Add a query to compute remaining: `SELECT total_sessions - used_sessions AS remaining FROM pt_credits WHERE student_id = $1 AND is_active = true`
4. Add a "Remaining Sessions" badge or column to the UI
5. Add a trigger or application hook to increment `used_sessions` when a `pt_sessions` row is marked `completed`

---

## 6. Additional Observations

### Dispatch Spec Analysis
The [`dispatch-spec.json`](../../../../Shared/missions/phase-c-refinements/dispatch-spec.json) agent `c2-pt-packages` was given a simplified task:
- **C2-11:** "Add a package creation form" — Done, but broken (missing gym_id)
- **C2-12:** "Add a student assignment UI... link the package to a student via pt_sessions or student_memberships" — Done, but the spec itself suggested the wrong approach (using `pt_sessions` as an assignment mechanism rather than creating a credit system)

The dispatch spec did not include any requirement for credit tracking, remaining sessions display, or coach ID resolution. This means the credit tracking gap is a **design-level issue** that predates the C2 refinements.

### RLS Analysis
The RLS policies are well-structured:
- `pt_packages_staff`: `gym_id = get_user_gym_id() AND is_staff()` — correct multi-tenant isolation
- `pt_packages_read`: any authenticated user can read — reasonable for a gym context
- `pt_sessions_staff`: staff can do all operations
- `pt_sessions_coach`: coaches see their own sessions
- `pt_sessions_student`: students see their own sessions (SELECT only)

However, the `pt_sessions_staff` policy at line 201 of the migration uses `USING (is_staff())` without a `gym_id` check, unlike the packages policy. This means a staff user from Gym A could potentially access sessions from Gym B if the coach or student relationship spans gyms. This is a minor RLS gap.

### Offline Sync
Both `pt_packages` and `pt_sessions` are registered in the offline sync engine at [`db/schema.ts`](../../src/lib/db/schema.ts:408-409) and [`sync-engine.ts`](../../src/lib/db/sync-engine.ts:65-66). The sync configuration includes `gym_id` for packages and `student_id, coach_id` for sessions, which is correct for offline-first operation.

---

## 7. Recommendations (Priority Order)

1. **IMMEDIATE:** Fix `gym_id` propagation — pass it from server page to client, include in insert payload
2. **IMMEDIATE:** Fix `coach_id` — add coach selection or derive from auth context
3. **HIGH:** Create `pt_credits` table and migrate assignment logic from `pt_sessions` to `pt_credits`
4. **HIGH:** Add error handling with `try/catch` and toast notifications
5. **MEDIUM:** Add optimistic updates / refetch after create and assign operations
6. **MEDIUM:** Replace hardcoded locale ternaries with a lookup helper
7. **MEDIUM:** Add remaining-sessions display to package cards (per-student view)
8. **LOW:** Add Edit/Delete functionality for packages
9. **LOW:** Complete i18n coverage for all form labels and actions
10. **LOW:** Fix `as any` cast and align server query types with client prop types
