# Belts Module — Deep Code Review

> **Audit Date:** June 7, 2026
> **Files Analyzed:** [`belts/page.tsx`](src/app/[locale]/(dashboard)/belts/page.tsx) (83 lines), [`belt-engine-client.tsx`](src/app/[locale]/(dashboard)/belts/belt-engine-client.tsx) (277 lines), [`PHASE_C_TEST_REGISTER.md`](docs/testing/PHASE_C_TEST_REGISTER.md), [`dispatch-spec.json`](../../../Shared/missions/phase-c-refinements/dispatch-spec.json), [`en.json`](src/i18n/messages/en.json), [`ar.json`](src/i18n/messages/ar.json), [`fr.json`](src/i18n/messages/fr.json), [`000001_create_enums.sql`](supabase/migrations/000001_create_enums.sql), [`000002_create_core_tables.sql`](supabase/migrations/000002_create_core_tables.sql), [`000003_create_operational_tables.sql`](supabase/migrations/000003_create_operational_tables.sql), [`000006_seed_data.sql`](supabase/migrations/000006_seed_data.sql), [`classes.ts`](src/types/classes.ts)

---

## File: [`belts/page.tsx`](src/app/[locale]/(dashboard)/belts/page.tsx) (83 lines)

### Issues Found

| # | Line(s) | Severity | Issue | Root Cause | Fix Required |
|---|---------|----------|-------|------------|-------------|
| 1 | 15 | **CRITICAL** | Query selects `current_belt_rank` and `belt_promotion_date` from `students` table, but the `students` table schema ([`000002_create_core_tables.sql:91-103`](supabase/migrations/000002_create_core_tables.sql:91)) does NOT define these columns. The `students` table only has `id, profile_id, gym_id, emergency_contact_name, emergency_contact_phone, medical_notes, join_date, is_active, created_at, updated_at, deleted_at`. No ALTER TABLE adds them in any migration. | Schema mismatch — `current_belt_rank` and `belt_promotion_date` were never added to the `students` table via migration. The seed data (`000006`) tries to INSERT into these columns, which would fail at runtime. | Add a migration to ALTER TABLE students ADD COLUMN current_belt_rank belt_rank_enum, ADD COLUMN belt_promotion_date DATE, OR create a proper `student_belts` junction table. |
| 2 | 15 | **HIGH** | Query uses `.select('id, current_belt_rank, belt_promotion_date, profile:profiles(...)')` but the `students` table references `profile_id` (not `profile`). The Supabase JS client's `profile:profiles(...)` syntax is correct for a foreign key join, but the column `current_belt_rank` doesn't exist on the table (see #1). | Same root cause as #1 — missing columns. Even if columns existed, the query shape is correct for the join. | Fix the schema first, then this query works. |
| 3 | 33-37 | **MEDIUM** | `belt_promotions` query has `.limit(50)` with no pagination. If there are >50 promotions, older ones are invisible with no way to load more. | Hardcoded limit without pagination UI. | Add offset-based pagination or infinite scroll. |
| 4 | 44, 48, 54-55, 58-60, 67 | **MEDIUM** | Hardcoded Arabic strings inline (`locale === 'ar' ? 'لوحة التحكم' : 'Dashboard'`, etc.) instead of using `getTranslations('belts')`. The i18n `belts` namespace exists in all 3 locales but the breadcrumb and heading use inline ternaries. | Developer didn't use `t()` for breadcrumb/title strings. | Replace all `locale === 'ar' ? ...` with `t('key')` calls. |
| 5 | 73 | **HIGH** | TypeScript `any` usage: `.map((s: any) => ({ ...s, user: s.profile || {} }))` and `.map((c: any) => ({ id: c.id, user: c.profile || {} }))`. The `any` type suppresses all type checking. | Loose typing — no proper interface for the mapped shape. | Define proper mapped types for `StudentWithUser` and `CoachWithUser`. |
| 6 | 73 | **MEDIUM** | The `user` property is derived from `s.profile` but the Supabase query aliases it as `profile:profiles(...)`. The spread `{ ...s, user: s.profile || {} }` works but is fragile — if the Supabase join returns null, `s.profile` could be undefined, causing runtime errors. | No null-safe fallback for the joined profile. | Add proper null handling: `user: s.profile ?? {}`. |
| 7 | 10 | **LOW** | `params` is typed as `{ locale: string }` but in Next.js 14 App Router, `params` should be `Promise<{ locale: string }>` (async). This may cause a build warning or runtime issue in newer Next.js versions. | Stale Next.js 14 pattern. | Use `Promise<{ locale: string }>` and `const { locale } = await params`. |

---

## File: [`belt-engine-client.tsx`](src/app/[locale]/(dashboard)/belts/belt-engine-client.tsx) (277 lines)

### Issues Found

| # | Line(s) | Severity | Issue | Root Cause | Fix Required |
|---|---------|----------|-------|------------|-------------|
| 8 | 12 | **CRITICAL** | `type Student = { ... user: any }` — the `user` field is typed as `any`, completely bypassing type safety for the student's profile data. | No interface for the profile shape. | Define `StudentProfile` interface with `first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr`. |
| 9 | 14 | **MEDIUM** | `type Coach = { id: string; user: any }` — same `any` issue as #8. | Same root cause. | Define `CoachProfile` interface. |
| 10 | 28-37 | **MEDIUM** | `BELT_COLORS` is a hardcoded `Record<string, string>` with only 8 entries (`white, yellow, orange, green, blue, purple, brown, black_1`). The DB enum `belt_rank_enum` has 15 values including `white_yellow, yellow_orange, orange_green, green_blue, blue_purple, purple_brown, brown_black, black_2..5, red`. Any student with one of these intermediate ranks will get the fallback `bg-gray-100 text-gray-700` (no color). | Hardcoded color map doesn't cover all 15 enum values. | Add color entries for all 15 belt_rank_enum values. |
| 11 | 38-47 | **MEDIUM** | `BELT_LABELS` is hardcoded with the same 8 entries, missing 7 intermediate ranks + `black_2..5` + `red`. Students with intermediate ranks will display the raw enum string instead of a localized label. | Same root cause as #10. | Add labels for all 15 belt_rank_enum values. |
| 12 | 64 | **LOW** | `useEffect(() => { setMounted(true); }, [])` — hydration workaround for Radix UI. This causes a flash of the skeleton/loading state on every render, even when data is already available from the server. | Client-only rendering deferral. | Use `suppressHydrationWarning` on the root element or use a proper SSR-safe component pattern. |
| 13 | 77-101 | **CRITICAL** | **No stepper/confirmation step.** The `handlePromote` function fires immediately on button click with no multi-step wizard, no confirmation dialog, and no review step. The user selects student/discipline/belt/coach and clicks "Promote Student" — one click and the promotion is committed. | C2-2 from test register was never implemented. The dispatch spec says "Add a simple visual stepper" but it was not done. | Implement a 3-step stepper: Step 1 (Select Student + Discipline), Step 2 (Select Belt + Coach), Step 3 (Review & Confirm). Add a confirmation dialog before the final insert. |
| 14 | 77-101 | **CRITICAL** | **No auto-refresh after promotion.** After `handlePromote` succeeds, the student list on the right panel does NOT update. The `students` array is a prop from the server — it's never refreshed. The `setSelectedBelt('')` and `setNotes('')` only clear form fields. The student's belt badge in the list still shows the OLD rank. | C2-4 from test register was never implemented. No `router.refresh()`, no optimistic UI update, no state mutation on the `students` array. | Add `router.refresh()` after successful promotion OR implement optimistic state update: find the student in the local `students` array and update `current_belt_rank` + `belt_promotion_date`. |
| 15 | 84-91 | **HIGH** | The `belt_promotions.insert` does NOT include `coach_id` validation. The DB schema (`000002:197`) defines `coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE SET NULL`, meaning `coach_id` is **required** (NOT NULL). But the code sends `coach_id: selectedCoach || null` — if no coach is selected, this sends `null`, which violates the NOT NULL constraint and will throw a Postgres error. | Code allows empty coach selection but DB requires coach_id. | Either make coach selection mandatory in the UI, or change the DB schema to allow NULL coach_id. |
| 16 | 84-91 | **HIGH** | No validation that the selected belt is actually higher rank than the student's current belt. A coach could accidentally promote a student to a lower or equal belt. | No rank-ordering check before insert. | Add validation: compare `sort_order` of current belt vs target belt. Reject if target <= current. |
| 17 | 84-91 | **MEDIUM** | No transaction wrapping. The `belt_promotions.insert` and `students.update` are two separate `await` calls. If the first succeeds but the second fails (network error, RLS violation), the promotion is recorded but the student's `current_belt_rank` is NOT updated — data inconsistency. | No Supabase transaction (RPC) or error rollback. | Wrap both operations in a Supabase RPC function with transaction, or use a `try/catch` that deletes the promotion record if the student update fails. |
| 18 | 92 | **MEDIUM** | Error handling: `if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }) }` — the error message is shown directly to the user. Supabase error messages may contain internal details (table names, column names, SQL snippets) that should not be exposed. | No error sanitization. | Log the full error to console, show a user-friendly message like "Promotion failed. Please try again." |
| 19 | 94-96 | **HIGH** | The `students.update` sets `current_belt_rank: currentBelt?.rank` but `currentBelt?.rank` is typed as `string` from the `BeltHierarchy` type. The DB column expects `belt_rank_enum`. If the rank string doesn't match the enum exactly (case-sensitive), Postgres will throw an error. | Type mismatch between TS string and Postgres enum. | Cast to the enum value or validate against the known enum values before sending. |
| 20 | 103-108 | **MEDIUM** | `getStudentName` has complex fallback logic that may return an empty string. If `locale === 'ar'` but `first_name_ar` and `last_name_ar` are both null, it falls back to `first_name_en`. But if `first_name_en` is also null, it returns `''` (empty string). | No guaranteed fallback. | Add a final fallback: `|| 'Unknown Student'` or `|| s.id`. |
| 21 | 109 | **LOW** | `getBeltColor` returns `'bg-gray-100 text-gray-700'` for unknown ranks. This is a silent fallback — no warning is logged when a rank is missing from `BELT_COLORS`. | No diagnostic logging for missing belt colors. | Add `console.warn('Missing belt color for rank:', rank)` in the fallback. |
| 22 | 112-114 | **LOW** | The `!mounted` skeleton div has `animate-pulse h-96 bg-gray-100 rounded-xl` but this is identical to the Suspense fallback in `page.tsx:71`. Double skeleton on initial load. | Redundant loading state. | Remove the client-side mounted check and use only the server Suspense boundary. |
| 23 | 118-127 | **MEDIUM** | Tab UI uses native `<button>` elements styled manually instead of using a proper Tabs component (e.g., Radix Tabs from shadcn/ui). This is inconsistent with the rest of the app which likely uses shadcn components. | Manual tab implementation. | Use `<Tabs>` from `@/components/ui/tabs` for consistency. |
| 24 | 136-142 | **LOW** | Student `<select>` uses `getStudentName(s)` which may return empty string (see #20). An empty-string option would appear blank in the dropdown. | Cascading from #20. | Fix #20 and this is resolved. |
| 25 | 151 | **MEDIUM** | Discipline filter: `disciplines.filter(d => beltHierarchies.some(b => b.discipline_id === d.id))` — this filters out disciplines that have no belt hierarchies. This is correct behavior but silently hides disciplines. If a discipline exists but has no belt_hierarchies rows, the coach won't see it and won't know why. | No user feedback for missing belt hierarchies. | Add a tooltip or note: "No belt ranks defined for this discipline." |
| 26 | 162 | **MEDIUM** | Belt `<select>` is `disabled={!selectedDiscipline}` but there's no visual indication WHY it's disabled. The user sees a grayed-out dropdown with no explanation. | No disabled-state messaging. | Add a small helper text below: "Select a discipline first." |
| 27 | 192-194 | **LOW** | Submit button shows `submitting ? (isRTL ? 'جاري...' : '...') : t('promote_student')` — the loading text is hardcoded Arabic/English instead of using i18n keys. Also, the English loading text is just `'...'` (three dots) which is not user-friendly. | Hardcoded loading text. | Add `t('submitting')` i18n key and use it. |
| 28 | 206-231 | **MEDIUM** | Clicking a student card in the right panel calls `setSelectedStudent(s.id)` but does NOT scroll the form to the top or focus the promote button. On mobile, the user may not realize the student was selected. | No scroll-to-form behavior. | Add `formRef.current?.scrollIntoView({ behavior: 'smooth' })` after selection. |
| 29 | 244-269 | **MEDIUM** | Promotion history shows `p.student_id` as fallback if the student is not found in the `students` array. This displays a raw UUID to the user — completely unhelpful. | No fallback name resolution. | Fetch the student name from the profile or show "Deleted Student". |
| 30 | 252-256 | **LOW** | History items show `p.from_rank` and `p.to_rank` using `getBeltLabel()` which falls back to the raw rank string if not in `BELT_LABELS`. Same issue as #11. | Cascading from #11. | Fix #11. |
| 31 | 77 | **HIGH** | No Zod validation (or any validation library) is used anywhere in the promotion form. The only validation is a manual `if (!selectedStudent || !selectedDiscipline || !selectedBelt)` check. No validation for: date format, notes length, coach existence, belt rank ordering, or SQL injection via notes field. | Zero validation architecture. | Add a Zod schema for the promotion form and validate before submitting. |

---

## File: [`PHASE_C_TEST_REGISTER.md`](docs/testing/PHASE_C_TEST_REGISTER.md) — Belt Engine Section

### Issues Found

| # | Line(s) | Severity | Issue | Root Cause | Fix Required |
|---|---------|----------|-------|------------|-------------|
| 32 | 27-31 | **CRITICAL** | C2-2 (stepper) and C2-4 (auto-refresh) are listed as "To Address Before Production" but the current code has NEITHER implemented. The dispatch spec instructed the agent to fix these, but the code review shows they were NOT done. | The Phase C.2 fix agent either failed to implement these or the changes were lost/overwritten. | Implement C2-2 (visual stepper) and C2-4 (router.refresh() + optimistic update) as specified. |
| 33 | 29 | **MEDIUM** | C2-3 (seed data) references "3-4 demo students with profiles" — the seed migration (`000006`) does insert 4 students, but they reference `current_belt_rank` and `belt_promotion_date` columns that don't exist in the `students` table schema (see #1). The seed data would fail on migration apply. | Schema mismatch between seed data and table definition. | Fix the schema first (add columns), then the seed data works. |

---

## File: [`dispatch-spec.json`](../../../Shared/missions/phase-c-refinements/dispatch-spec.json) — c2-belt-engine Agent

### Issues Found

| # | Line(s) | Severity | Issue | Root Cause | Fix Required |
|---|---------|----------|-------|------------|-------------|
| 34 | 19 (prompt) | **HIGH** | The dispatch spec instructs the agent to "Add an optimistic update to the student list in the client component" for C2-4, but the agent's prompt also says "Use Server Components for data fetching" — these are contradictory. Optimistic updates require client-side state mutation, which conflicts with the server-component-first directive. | Contradictory instructions in the agent prompt. | Clarify: use client-side state for optimistic updates, server components for initial data fetch. |

---

## File: [`en.json`](src/i18n/messages/en.json), [`ar.json`](src/i18n/messages/ar.json), [`fr.json`](src/i18n/messages/fr.json) — Belt i18n Keys

### Issues Found

| # | Line(s) | Severity | Issue | Root Cause | Fix Required |
|---|---------|----------|-------|------------|-------------|
| 35 | 501-515 (en), 501-515 (ar), 501-515 (fr) | **LOW** | Missing i18n keys: `submitting`, `confirm_promotion`, `cancel`, `step_student`, `step_discipline`, `step_belt`, `step_confirm`, `promotion_success`, `promotion_error`, `select_coach_required` (for mandatory coach). The current code uses hardcoded strings for many of these. | i18n namespace was created but is incomplete. | Add missing keys to all 3 locale files. |

---

## File: [`000002_create_core_tables.sql`](supabase/migrations/000002_create_core_tables.sql) — DB Schema

### Issues Found

| # | Line(s) | Severity | Issue | Root Cause | Fix Required |
|---|---------|----------|-------|------------|-------------|
| 36 | 91-103 | **CRITICAL** | The `students` table has NO `current_belt_rank` or `belt_promotion_date` columns. The schema defines only: `id, profile_id, gym_id, emergency_contact_name, emergency_contact_phone, medical_notes, join_date, is_active, created_at, updated_at, deleted_at`. Yet the entire belt engine depends on these columns. | Missing columns in the core schema migration. | Add migration: `ALTER TABLE students ADD COLUMN current_belt_rank belt_rank_enum, ADD COLUMN belt_promotion_date DATE;` |
| 37 | 194-207 | **MEDIUM** | `belt_promotions.coach_id` is `UUID NOT NULL` (line 197) but the code allows null coach. Either the schema should be `coach_id UUID REFERENCES coaches(id) ON DELETE SET NULL` (drop NOT NULL) or the UI should enforce coach selection. | Schema constraint mismatch with UI behavior. | Either: (a) ALTER TABLE belt_promotions ALTER COLUMN coach_id DROP NOT NULL, or (b) make coach selection mandatory in the UI. |
| 38 | 175-189 | **LOW** | `belt_hierarchies` has `min_months_in_rank` and `min_classes_attended` columns (lines 184-185) but these are never used by the promotion engine. No validation checks against these requirements before promoting. | Unused schema features. | Either implement the validation logic or remove the columns. |

---

## File: [`classes.ts`](src/types/classes.ts) — Shared Types

### Issues Found

| # | Line(s) | Severity | Issue | Root Cause | Fix Required |
|---|---------|----------|-------|------------|-------------|
| 39 | 48, 77 | **MEDIUM** | `ClassEnrollment.student.belt_rank` and `Student.belt_rank` are typed as `string` instead of the specific `belt_rank_enum` values. This allows any string to be assigned, bypassing type safety. | No belt-specific type definition. | Create a `BeltRank` union type matching `belt_rank_enum` values and use it here. |
| 40 | — | **HIGH** | **No dedicated belt types file exists.** There is no `src/types/belts.ts` or equivalent. All belt types are defined inline in `belt-engine-client.tsx` (lines 12-26) with `any` for user profiles. No shared `BeltPromotion`, `BeltHierarchy`, `StudentBelt` interfaces exist. | Missing type definitions for the belt domain. | Create `src/types/belts.ts` with proper interfaces for all belt entities. |

---

## Summary

### Total Issues Found: **40**

| Severity | Count |
|----------|-------|
| CRITICAL | 6 |
| HIGH | 7 |
| MEDIUM | 17 |
| LOW | 10 |

### Top 3 Critical Fixes Needed

1. **Schema mismatch — `students` table missing `current_belt_rank` and `belt_promotion_date` columns** (Issues #1, #36)
   - The `students` table (`000002_create_core_tables.sql:91-103`) does not define these columns, yet the entire belt engine queries and writes to them. The seed data (`000006`) also tries to INSERT into non-existent columns. This is a **showstopper** — the promotion workflow cannot function at all without this migration fix.
   - **Fix:** Add migration: `ALTER TABLE students ADD COLUMN current_belt_rank belt_rank_enum, ADD COLUMN belt_promotion_date DATE;`

2. **No stepper/confirmation workflow** (Issue #13 — C2-2 not implemented)
   - The promotion form is a single-click action with no multi-step wizard, no confirmation dialog, and no review step. A coach can accidentally promote a student with no chance to review.
   - **Fix:** Implement a 3-step stepper (Select Student/Discipline → Select Belt/Coach → Review & Confirm) with a confirmation dialog before the final insert.

3. **No auto-refresh after promotion** (Issue #14 — C2-4 not implemented)
   - After a successful promotion, the student list on the right panel still shows the OLD belt rank. The user must manually refresh the page to see the updated data.
   - **Fix:** Add `router.refresh()` after successful promotion AND/OR implement optimistic state update on the local `students` array.

### Is the Promotion Workflow End-to-End Functional?

**NO.** The promotion workflow is fundamentally broken due to the schema mismatch:

1. The `students` table is missing `current_belt_rank` and `belt_promotion_date` columns (Issue #1, #36) — the server query at `page.tsx:15` would return `undefined` for these fields, or throw a Postgres error.
2. The seed data at `000006:108-130` tries to INSERT into non-existent columns, which would fail on migration apply.
3. Even if the schema were fixed, there is no stepper (Issue #13), no auto-refresh (Issue #14), no rank-ordering validation (Issue #16), no transaction safety (Issue #17), and no Zod validation (Issue #31).
4. The `coach_id` NOT NULL constraint (Issue #15, #37) would cause insert failures when no coach is selected.

**Verdict:** The promotion workflow is **non-functional** in its current state. It requires a schema migration fix before any other improvements can take effect.

### Is Auto-Refresh Working?

**NO.** The `handlePromote` function at `belt-engine-client.tsx:93-98` only clears the form fields (`setSelectedBelt('')`, `setNotes('')`). It does NOT:
- Call `router.refresh()` to re-fetch server data
- Optimistically update the local `students` array
- Trigger any re-render of the student list

The student list on the right panel (lines 199-234) renders from the `students` prop, which is passed from the server component and never mutated. After promotion, the student's belt badge still shows the old rank until a full page reload.

### Additional Critical Issues

- **No Zod validation** (Issue #31): Zero validation on the promotion form. No rank-ordering check, no date validation, no notes length limits.
- **Hardcoded belt colors/labels** (Issues #10, #11): Only 8 of 15 `belt_rank_enum` values are covered. Students with intermediate ranks (e.g., `white_yellow`, `blue_purple`, `black_3`) will display raw enum strings with no color.
- **`any` types throughout** (Issues #5, #8, #9): The `user` field on both `Student` and `Coach` types is `any`, bypassing all TypeScript safety.
- **No transaction safety** (Issue #17): The promotion insert and student update are two separate calls with no rollback mechanism.
