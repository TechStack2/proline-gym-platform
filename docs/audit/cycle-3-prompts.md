# Cycle 3 — Actionable Prompts for Coding Agent

**Generated:** June 8, 2026 12:03 PM +03:00
**Source Documents:**
- [`camps-code-review.md`](./camps-code-review.md) — 68 issues found in camps module
- [`pt-code-review.md`](./pt-code-review.md) — 20 issues found in PT packages module
- [`cycle-3-gap-analysis.md`](./cycle-3-gap-analysis.md) — i18n scan, portal stubs, residual security items
- [`session-audit-plan.md`](./session-audit-plan.md) — Current audit state (Cycles 1-2 complete)
- [`audit-cycle-update.md`](../../audit-cycle-update.md) — Cycle log

---

## PROMPT 11: Fix Camps CRITICAL Issues + Edit/Delete

**Mode:** code
**Priority:** P1
**Depends On:** None

### Context

The camps module has 6 CRITICAL and 10 HIGH-severity issues from the deep code review. The most urgent is the `gym_id` NOT NULL violation — camp creation always fails because the insert payload omits `gym_id` entirely (the hardcoded zero-UUID at line 110 is only used for Zod validation, not the actual DB insert at line 127). Additionally, there is NO edit or delete functionality anywhere in the module — CRUD is only 25% complete (Create + List only). Status management is also missing (camps stuck in `draft` forever).

The reference pattern for auth + gym_id is [`leads/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/page.tsx:20-31).

### Required Deliverables

1. **Fix `gym_id` NOT NULL violation in [`camps/camps-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/camps/camps-client.tsx)**
   - Remove the hardcoded zero-UUID `gym_id: '00000000-0000-0000-0000-000000000000'` from the canonical object (line 110)
   - Pass the real `gym_id` from the server page (`page.tsx`) down to the client component as a prop
   - Include `gym_id` in the actual Supabase insert payload (line 127-142) — currently it's omitted
   - Use the validated `parsed.data` for the insert payload instead of re-deriving values from raw form data (fixes data inconsistency issue #17)
   - Wrap the insert in `try/catch` with sonner toast on failure (fixes issue #13)
   - Add error feedback to user on insert failure (fixes issue #14)
   - Move `setSubmitting(false)` to a `finally` block (fixes issue #15)

2. **Add EDIT modal/workflow for existing camps**
   - Add an "Edit" button per camp card in the expanded view
   - Create a pre-filled form modal that loads existing camp data
   - Use `supabase.from('camps').update(...)` with the same Zod schema validation
   - Include all fields: name_ar, name_en, name_fr, description_ar, description_en, description_fr, start_date, end_date, max_capacity, min_age, max_age, price_usd, price_lbp, status
   - Add loading state and error handling with sonner toasts

3. **Add DELETE with confirmation dialog**
   - Add a "Delete" button per camp card
   - Show a confirmation dialog before deletion
   - Use soft-delete: `supabase.from('camps').update({ deleted_at: new Date().toISOString() })` instead of hard-delete
   - Add sonner toast on success/failure

4. **Add status management workflow**
   - Add a status dropdown/badge per camp card showing current status
   - Allow transitions: draft → open, open → full, open → in_progress, in_progress → completed, any → cancelled
   - Use `supabase.from('camps').update({ status })` with the `camp_status_enum` type
   - Add visual indicators (color-coded badges) for each status

5. **Ensure Zod schema matches DB columns exactly**
   - Remove the duplicate local `campFormSchema` in `camps-client.tsx` (lines 17-34) — use `campInsertSchema` from [`camps.schema.ts`](../../src/lib/validators/camps.schema.ts) instead
   - Or create a dedicated form schema with `z.preprocess()` to convert string inputs to numbers
   - Ensure `campRegistrationSchema` default status matches DB CHECK constraint (change `'registered'` to `'pending'` or `'confirmed'`)

6. **Wire remaining 2 hardcoded strings to i18n**
   - Replace `locale === 'ar' ? camp.name_ar : locale === 'fr' ? camp.name_fr : camp.name_en` (line 215) with a `getLocalizedName(camp, locale)` helper or `t()` call
   - Replace the hardcoded locale ternary on the marketing page [`(marketing)/page.tsx`](../../src/app/%5Blocale%5D/(marketing)/page.tsx:39) with `getTranslations('camps')` and `t('upcoming_camps')`
   - Add missing i18n keys: `name_en_placeholder`, `price_usd`, `price_lbp`, `min_age`, `max_age`, `upcoming_camps`, `upcoming_subtitle`, `register_now`, `description`, `location`

### Validation Checklist
- [ ] Camp creation succeeds with real `gym_id` — no NOT NULL constraint violation
- [ ] Edit modal opens pre-filled with existing camp data
- [ ] Edit saves changes correctly via `supabase.from('camps').update()`
- [ ] Delete shows confirmation dialog and soft-deletes (sets `deleted_at`)
- [ ] Status transitions work: draft → open → full → in_progress → completed, any → cancelled
- [ ] Zod schema matches DB columns — no phantom columns, correct types
- [ ] No hardcoded locale ternaries remain in camps module
- [ ] All Supabase operations wrapped in `try/catch` with sonner toasts
- [ ] `setSubmitting(false)` called in `finally` block — no stuck submit buttons

### References
- [`camps-code-review.md`](./camps-code-review.md) — Issues #12, #13, #14, #15, #16, #17, #19, #25, #41, #56, #66, #68
- [`camps/camps-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/camps/camps-client.tsx) — Lines 99-148 (create handler), 215 (hardcoded locale ternary)
- [`camps.schema.ts`](../../src/lib/validators/camps.schema.ts) — Lines 5-29 (canonical schema), 42-51 (registration schema)
- [`(marketing)/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/../../(marketing)/page.tsx:39) — Hardcoded locale ternary on landing page
- [`leads/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/page.tsx:20-31) — Reference pattern for auth + gym_id

### Audit Cycle Gate
You MUST append your completion entry to `/Users/techstack/Desktop/Agentics/Projects/proline-gym-platform/audit-cycle-update.md` BEFORE calling `attempt_completion`. This is a GATE REQUIREMENT. If you skip this step, the audit cycle cannot progress.

---

## PROMPT 12: Fix PT Packages CRITICAL Issues + Credit Tracking

**Mode:** code
**Priority:** P1
**Depends On:** None (can run parallel with Prompt 11)

### Context

The PT Packages module has 3 CRITICAL and 3 HIGH-severity issues. Package creation always fails because `gym_id` is omitted from the insert payload (the hardcoded zero-UUID at line 92 is only used for Zod validation, not the actual DB insert at lines 103-110). The `coach_id` is also a fake zero-UUID that will cause a FK violation on every assignment. Most critically, there is NO credit tracking system — assigning a package creates a `pt_sessions` row (a single session booking) instead of a credit entitlement, meaning the `session_count` field on packages is purely decorative. There is no way to track "X of Y sessions remaining" per student.

### Required Deliverables

1. **Fix `gym_id` NOT NULL violation in [`pt/pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx)**
   - Remove the hardcoded zero-UUID `gym_id: '00000000-0000-0000-0000-000000000000'` from the canonical object (line 92)
   - Pass the real `gym_id` from the server page (`page.tsx`) down to the client component as a prop
   - Include `gym_id` in the actual Supabase insert payload (lines 103-110) — currently it's omitted
   - Reuse the validated `canonical` object for the insert instead of rebuilding from raw form data

2. **Fix fake `coach_id` (zero UUID) — use real coach from DB**
   - Remove hardcoded `coach_id: '00000000-0000-0000-0000-000000000000'` from the booking payload (lines 126, 142)
   - Add a coach selector dropdown to the assignment UI, populated from `profiles` where `role = 'coach'`
   - Or derive the coach ID from the authenticated user's profile if the user is a coach
   - Pass the real coach ID in the session/credit insert

3. **BUILD CREDIT TRACKING — Create `pt_assignments` table and migration**
   - Create a new migration file `000012_create_pt_assignments.sql` with:
     ```sql
     CREATE TABLE pt_assignments (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
       package_id UUID NOT NULL REFERENCES pt_packages(id) ON DELETE RESTRICT,
       sessions_total INTEGER NOT NULL CHECK (sessions_total > 0),
       sessions_used INTEGER NOT NULL DEFAULT 0 CHECK (sessions_used >= 0),
       sessions_remaining INTEGER GENERATED ALWAYS AS (sessions_total - sessions_used) STORED,
       purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       expires_at TIMESTAMPTZ,
       is_active BOOLEAN NOT NULL DEFAULT true,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       CONSTRAINT sessions_used_lte_total CHECK (sessions_used <= sessions_total)
     );
     ```
   - Add RLS policy for `pt_assignments` with gym scoping (via join through `pt_packages.gym_id`)
   - Add the table to the offline sync engine in [`db/schema.ts`](../../src/lib/db/schema.ts) and [`sync-engine.ts`](../../src/lib/db/sync-engine.ts)
   - Regenerate DB types or add manual type for `pt_assignments`

4. **Change "Assign" logic from creating a session to creating a credit record**
   - The "Assign to Student" button should insert into `pt_assignments` with `sessions_total = package.session_count`, not into `pt_sessions`
   - Add UI to show "X of Y sessions remaining" per student on the package card
   - Add a view/query to list all students with active assignments for a given package

5. **Auto-decrement credits on session completion**
   - Add a function or trigger that increments `sessions_used` when a `pt_sessions` row is marked `status = 'completed'`
   - Alternatively, add application logic in the session completion handler to call `supabase.rpc('increment_sessions_used', { assignment_id })`
   - Prevent booking new sessions if `sessions_remaining = 0`

6. **Add EDIT/DELETE for PT packages**
   - Add an "Edit" button per package card with pre-filled modal
   - Add a "Delete" button with confirmation dialog (soft-delete via `deleted_at`)
   - Add status management for packages (active/inactive)

7. **Add calendar/time-slot selection for session booking**
   - Replace the current "book now" behavior with a date/time picker
   - Allow selecting a future time slot for the session
   - Add conflict detection (coach cannot have overlapping sessions)

8. **Replace `alert()` with sonner toasts**
   - Replace all `alert()` calls in `pt-client.tsx` with `toast.error()` or `toast.success()`
   - Add try/catch on all Supabase operations (create, assign, update, delete)

### Validation Checklist
- [ ] Package creation succeeds with real `gym_id` — no NOT NULL constraint violation
- [ ] Coach selector shows real coaches from DB — no fake UUID
- [ ] Migration `000012_create_pt_assignments.sql` applies cleanly
- [ ] "Assign to Student" creates a `pt_assignments` record, not a `pt_sessions` record
- [ ] UI shows "X of Y sessions remaining" per student per package
- [ ] Sessions remaining decrements when a session is completed
- [ ] Cannot book sessions when `sessions_remaining = 0`
- [ ] Edit modal pre-filled with existing package data
- [ ] Delete soft-deletes via `deleted_at`
- [ ] No `alert()` calls remain — all replaced with sonner toasts
- [ ] All Supabase operations wrapped in `try/catch`

### References
- [`pt-code-review.md`](./pt-code-review.md) — Issues #1, #2, #3, #4, #5, #6, #7, #8, #9, #17
- [`pt/pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx) — Lines 83-116 (create handler), 118-151 (assign handler), 216 (hardcoded locale ternary)
- [`pt.schema.ts`](../../src/lib/validators/pt.schema.ts) — Lines 1-40 (canonical schema)
- [`000003_create_operational_tables.sql`](../../supabase/migrations/000003_create_operational_tables.sql:205-245) — Existing PT tables
- [`db/schema.ts`](../../src/lib/db/schema.ts:408-409) — Offline sync schema for PT tables
- [`sync-engine.ts`](../../src/lib/db/sync-engine.ts:65-66) — Offline sync engine for PT tables

### Audit Cycle Gate
You MUST append your completion entry to `/Users/techstack/Desktop/Agentics/Projects/proline-gym-platform/audit-cycle-update.md` BEFORE calling `attempt_completion`. This is a GATE REQUIREMENT. If you skip this step, the audit cycle cannot progress.

---

## PROMPT 13: i18n — Phase C Residual Cleanup

**Mode:** code
**Priority:** P2
**Depends On:** None

### Context

The Cycle 3 gap analysis confirmed that all 3 locale files (`en.json`, `ar.json`, `fr.json`) have identical structure — 23 top-level namespaces, 548 keys each, all matching. The i18n framework (`next-intl`) is fully set up. However, Phase C modules still have ~30 hardcoded `locale === 'ar'` ternary expressions that bypass the i18n system. This prompt targets the 19 remaining strings across 4 Phase C files that were NOT caught by Cycle 2 Prompt 7 (which covered camps, pt, and rentals broadly but missed some residual ternaries).

The gold standard reference is [`leads/leads-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/leads-client.tsx) or [`leads/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/page.tsx) which use `useTranslations('leads')` exclusively with zero hardcoded locale ternaries.

### Required Deliverables

1. **Replace ALL remaining hardcoded `locale === 'ar'` ternaries in [`belts/belt-engine-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/belts/belt-engine-client.tsx) (~12 strings)**
   - Target patterns: `locale === 'ar' ? b.name_ar : locale === 'fr' ? b.name_fr : b.name_en` (line 318 and similar)
   - Also: any `isRTL` or `locale === 'ar'` font class ternaries
   - Use `useTranslations('belts')` and the existing `belts` namespace keys
   - For localized name display, create a shared helper: `getLocalizedName(item: { name_ar: string; name_en: string; name_fr: string }, locale: string): string`
   - Verify all 38 belt i18n keys are sufficient; add any missing keys to all 3 locale files

2. **Replace remaining hardcoded ternaries in [`camps/camps-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/camps/camps-client.tsx) (~2 strings)**
   - The `locale === 'ar' ? camp.name_ar : locale === 'fr' ? camp.name_fr : camp.name_en` pattern (line 215) — may already be fixed by Prompt 11, but verify
   - Any remaining `locale === 'ar'` font class ternaries
   - Use `useTranslations('camps')` and the existing `camps` namespace keys

3. **Replace remaining hardcoded ternaries in [`pt/pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx) (~2 strings)**
   - The `locale === 'ar' ? pkg.name_ar : locale === 'fr' ? pkg.name_fr : pkg.name_en` pattern (line 216) — may already be fixed by Prompt 12, but verify
   - The hardcoded `"Price USD"` string (line 189) — use `t('price_usd')`
   - Use `useTranslations('pt')` and the existing `pt` namespace keys

4. **Replace remaining hardcoded ternaries in [`rentals/rentals-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/rentals/rentals-client.tsx) (~3 strings)**
   - The `locale === 'ar' ? r.name_ar : r.name_en` pattern (line 193 and similar)
   - Any remaining `locale === 'ar'` font class ternaries
   - Use `useTranslations('rentals')` and the existing `rentals` namespace keys

5. **Add any missing i18n keys to all 3 locale files**
   - Check each file against the existing namespace keys
   - Add any keys referenced in `t()` calls that don't exist in the JSON files
   - Ensure all 3 locale files stay in sync (same keys in en/ar/fr)

### Validation Checklist
- [ ] Zero hardcoded `locale === 'ar'` ternaries remain in `belt-engine-client.tsx`
- [ ] Zero hardcoded `locale === 'ar'` ternaries remain in `camps-client.tsx`
- [ ] Zero hardcoded `locale === 'ar'` ternaries remain in `pt-client.tsx`
- [ ] Zero hardcoded `locale === 'ar'` ternaries remain in `rentals-client.tsx`
- [ ] All 4 files use `useTranslations()` consistently
- [ ] All 3 locale files have matching keys (en/ar/fr counts are equal)
- [ ] `getLocalizedName()` helper created and used across all Phase C modules
- [ ] No regressions — all forms still submit, all displays still render

### References
- [`cycle-3-gap-analysis.md`](./cycle-3-gap-analysis.md) — Section 1 (i18n Hardcoded Strings), Section 2 (i18n Key Inventory)
- [`belt-engine-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/belts/belt-engine-client.tsx) — ~12 hardcoded ternaries
- [`camps-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/camps/camps-client.tsx) — 2 hardcoded ternaries
- [`pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx) — 2 hardcoded ternaries
- [`rentals-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/rentals/rentals-client.tsx) — 3 hardcoded ternaries
- [`leads/leads-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/leads-client.tsx) — Gold standard reference (zero hardcoded ternaries)
- [`en.json`](../../src/i18n/messages/en.json) — Reference locale file (548 keys)
- [`ar.json`](../../src/i18n/messages/ar.json) — Arabic locale file
- [`fr.json`](../../src/i18n/messages/fr.json) — French locale file

### Audit Cycle Gate
You MUST append your completion entry to `/Users/techstack/Desktop/Agentics/Projects/proline-gym-platform/audit-cycle-update.md` BEFORE calling `attempt_completion`. This is a GATE REQUIREMENT. If you skip this step, the audit cycle cannot progress.

---

## PROMPT 14: Non-Phase-C i18n + Dashboard Polish

**Mode:** code
**Priority:** P2
**Depends On:** None

### Context

The Cycle 3 gap analysis identified ~80 hardcoded locale ternaries across non-Phase-C dashboard modules (settings, reports, notifications, profile, attendance, classes, coaches, students, payments, invoices, schedule, disciplines, dashboard). This prompt targets the highest-traffic modules: settings (~30+ strings), reports (~10 strings), and notifications (~12 strings). These modules are fully functional but use `locale === 'ar' ? 'Arabic Text' : locale === 'fr' ? 'French Text' : 'English Text'` patterns instead of `next-intl` keys.

The i18n keys for these modules already exist in all 3 locale files (settings, reports, notifications namespaces). This is pure wiring work — no new keys needed unless gaps are found.

### Required Deliverables

1. **Wire i18n into [`settings/`](../../src/app/%5Blocale%5D/(dashboard)/settings/) module (~15 strings)**
   - Files to update:
     - [`settings/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/settings/page.tsx) — Title, tab labels, section headers
     - [`settings/_components/gym-settings.tsx`](../../src/app/%5Blocale%5D/(dashboard)/settings/_components/gym-settings.tsx) — Form labels, placeholders, save button
     - [`settings/_components/membership-plans.tsx`](../../src/app/%5Blocale%5D/(dashboard)/settings/_components/membership-plans.tsx) — Plan names, durations, price labels
     - [`settings/_components/exchange-rates.tsx`](../../src/app/%5Blocale%5D/(dashboard)/settings/_components/exchange-rates.tsx) — Rate labels, update button
     - [`settings/_components/discipline-settings.tsx`](../../src/app/%5Blocale%5D/(dashboard)/settings/_components/discipline-settings.tsx) — Discipline names, add/edit/delete actions
     - [`settings/_components/settings-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/settings/_components/settings-client.tsx) — Tab navigation, layout text
   - Use `useTranslations('settings')` — verify this namespace exists in all 3 locale files
   - If the `settings` namespace doesn't exist, create it with all required keys in all 3 locale files

2. **Wire i18n into [`reports/`](../../src/app/%5Blocale%5D/(dashboard)/reports/) module (~11 strings)**
   - Files to update:
     - [`reports/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/reports/page.tsx) — Title, tab labels
     - [`reports/_components/attendance-report.tsx`](../../src/app/%5Blocale%5D/(dashboard)/reports/_components/attendance-report.tsx) — Column headers, summary labels, date range picker labels
     - [`reports/_components/revenue-report.tsx`](../../src/app/%5Blocale%5D/(dashboard)/reports/_components/revenue-report.tsx) — Revenue labels, currency display, period selectors
     - [`reports/_components/belt-progression-report.tsx`](../../src/app/%5Blocale%5D/(dashboard)/reports/_components/belt-progression-report.tsx) — Belt rank labels, progression stats
   - Use `useTranslations('reports')` — verify this namespace exists
   - Create the `reports` namespace if it doesn't exist

3. **Wire i18n into [`notifications/`](../../src/app/%5Blocale%5D/(dashboard)/notifications/) module (~12 strings)**
   - Files to update:
     - [`notifications/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/notifications/page.tsx) — Title, auth error message
     - [`notifications/notifications-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/notifications/notifications-client.tsx) — Time labels ("Just now", "X minutes ago", "X hours ago"), read/unread status, "Mark all read" button, empty state
   - Use `useTranslations('notifications')` — verify this namespace exists
   - Create the `notifications` namespace if it doesn't exist

4. **Verify no broken features introduced**
   - After i18n migration, ensure all forms still submit correctly
   - Ensure all data displays still render with correct values
   - Ensure no `t()` calls reference missing keys (check against locale JSON files)
   - Ensure all 3 locale files stay in sync

### Validation Checklist
- [ ] Settings module: zero hardcoded locale ternaries — all use `useTranslations('settings')`
- [ ] Reports module: zero hardcoded locale ternaries — all use `useTranslations('reports')`
- [ ] Notifications module: zero hardcoded locale ternaries — all use `useTranslations('notifications')`
- [ ] All referenced i18n keys exist in en/ar/fr locale files
- [ ] All forms submit correctly after i18n migration
- [ ] All data displays render correctly
- [ ] No TypeScript errors from missing keys or incorrect types

### References
- [`cycle-3-gap-analysis.md`](./cycle-3-gap-analysis.md) — Section 1 (Non-Phase-C Dashboard), Section 2 (i18n Key Inventory)
- [`settings/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/settings/page.tsx) — ~30 hardcoded strings across all settings components
- [`reports/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/reports/page.tsx) — ~10 hardcoded strings across all report components
- [`notifications/notifications-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/notifications/notifications-client.tsx) — ~12 hardcoded strings
- [`en.json`](../../src/i18n/messages/en.json) — Reference locale file (verify namespace existence)
- [`leads/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/page.tsx) — Gold standard reference for i18n pattern

### Audit Cycle Gate
You MUST append your completion entry to `/Users/techstack/Desktop/Agentics/Projects/proline-gym-platform/audit-cycle-update.md` BEFORE calling `attempt_completion`. This is a GATE REQUIREMENT. If you skip this step, the audit cycle cannot progress.

---

## PROMPT 15: Security Residuals + Coach Portal Stub

**Mode:** code
**Priority:** P3
**Depends On:** None

### Context

The Cycle 3 gap analysis re-assessed 5 residual LOW-severity items and upgraded 3 to MEDIUM:
1. **CSP `unsafe-inline`/`unsafe-eval`** — Currently in all environments (dev + prod). Should be tightened for production.
2. **Rate limiting** — No middleware exists. Auth endpoints are exposed without protection against brute-force.
3. **`rental_bookings` RLS** — Uses bare `is_staff()` without `gym_id` check. Migration `000011_fix_rls_gym_scoping.sql` fixed other junction tables but missed this one.

Additionally, the Coach Portal is 80% stub — only the profile page is functional. The home page, attendance page, and students page are placeholders with hardcoded strings.

### Required Deliverables

1. **Tighten CSP: remove `unsafe-inline`/`unsafe-eval` for production, keep for dev only**
   - In [`next.config.mjs`](../../next.config.mjs:122-123), modify the CSP to use environment-aware directives:
     - Dev: keep `'unsafe-inline' 'unsafe-eval'` (needed for Next.js dev mode with React Refresh)
     - Production: remove `'unsafe-inline'` and `'unsafe-eval'`, use `'strict-dynamic'` with nonces instead
   - Add nonce generation middleware or use Next.js built-in nonce support
   - Test that production build works without `unsafe-inline`/`unsafe-eval`
   - Document the CSP configuration with comments explaining dev vs prod differences

2. **Implement rate limiting middleware for auth endpoints**
   - Create a middleware file at [`src/middleware.ts`](../../src/middleware.ts) (if not already present)
   - Implement rate limiting using an in-memory store (or `@upstash/ratelimit` if Redis is available)
   - Apply rate limiting to auth endpoints: `/auth/login`, `/auth/verify`, `/auth/register`
   - Configure limits: e.g., 5 login attempts per minute per IP
   - Return 429 Too Many Requests with appropriate headers (`Retry-After`, `X-RateLimit-*`)
   - Ensure the middleware doesn't interfere with `next-intl` routing

3. **Add gym-scoping to `rental_bookings` RLS policy**
   - Create migration `000013_fix_rental_bookings_rls.sql`:
     ```sql
     -- Drop existing policy
     DROP POLICY IF EXISTS rental_bookings_staff ON rental_bookings;
     
     -- Re-create with gym scoping via rentals join
     CREATE POLICY rental_bookings_staff ON rental_bookings
       FOR ALL
       USING (
         is_staff()
         AND EXISTS (
           SELECT 1 FROM rentals
           WHERE rentals.id = rental_bookings.rental_id
           AND rentals.gym_id = get_user_gym_id()
         )
       );
     ```
   - Apply the migration

4. **Build Coach Portal home page with real data**
   - Update [`coach/page.tsx`](../../src/app/%5Blocale%5D/coach/page.tsx):
     - Fetch today's scheduled classes from Supabase (join `class_schedules` with `classes`, `disciplines`, `coaches`)
     - Filter by the authenticated coach's ID
     - Display a list of today's classes with: time, class name, discipline, room, student count
     - Add a "Start Attendance" button per class linking to the attendance page
     - Add a summary stats bar: total classes today, total students, completed vs pending
     - Replace hardcoded strings with `useTranslations('coach')` or `getTranslations('coach')`

5. **Build Coach Portal attendance page**
   - Update [`coach/attendance/page.tsx`](../../src/app/%5Blocale%5D/coach/attendance/page.tsx):
     - Add a class selector dropdown (populated from today's classes)
     - Once a class is selected, fetch enrolled students from `student_classes` join
     - Display a student list with checkboxes or toggle buttons for: Present, Absent, Late, Excused
     - Add a "Mark All Present" shortcut
     - Insert/update attendance records in the `attendance` table
     - Add a "Submit Attendance" button that saves all changes at once
     - Show success/error feedback with sonner toasts
     - Replace hardcoded strings with `useTranslations('coach')` or `getTranslations('coach')`

6. **Build Coach Portal students page** (bonus if time permits)
   - Update [`coach/students/page.tsx`](../../src/app/%5Blocale%5D/coach/students/page.tsx):
     - Fetch students assigned to the coach's classes (via `class_schedules` → `student_classes`)
     - Display a searchable student list with: name, belt rank, discipline, last attendance date
     - Add a student detail view or link to student profile
     - Replace hardcoded strings with `useTranslations('coach')`

### Validation Checklist
- [ ] CSP in production does NOT include `unsafe-inline` or `unsafe-eval`
- [ ] CSP in dev still includes `unsafe-inline`/`unsafe-eval` (dev mode works)
- [ ] Rate limiting middleware returns 429 after X auth attempts
- [ ] Rate limiting does not interfere with `next-intl` routing
- [ ] Migration `000013_fix_rental_bookings_rls.sql` applies cleanly
- [ ] `rental_bookings` RLS policy now checks `gym_id` via `rentals` join
- [ ] Coach Portal home page shows real today's classes with student counts
- [ ] Coach Portal attendance page allows marking attendance with class selector
- [ ] Attendance records are saved to Supabase correctly
- [ ] Sonner toasts show success/error feedback on attendance save
- [ ] No hardcoded strings in coach portal pages — all use `useTranslations()`

### References
- [`cycle-3-gap-analysis.md`](./cycle-3-gap-analysis.md) — Section 4 (Residual Items Re-Assessment), Section 3 (Portal Stubs Assessment)
- [`next.config.mjs`](../../next.config.mjs:122-123) — Current CSP configuration
- [`000004_create_rls_policies.sql`](../../supabase/migrations/000004_create_rls_policies.sql:60) — Current `rental_bookings` RLS policy
- [`000011_fix_rls_gym_scoping.sql`](../../supabase/migrations/000011_fix_rls_gym_scoping.sql) — Previous RLS fix migration (reference pattern)
- [`coach/page.tsx`](../../src/app/%5Blocale%5D/coach/page.tsx) — Current stub (placeholder only)
- [`coach/attendance/page.tsx`](../../src/app/%5Blocale%5D/coach/attendance/page.tsx) — Current stub (placeholder only)
- [`coach/students/page.tsx`](../../src/app/%5Blocale%5D/coach/students/page.tsx) — Current stub (placeholder only)
- [`coach/profile/page.tsx`](../../src/app/%5Blocale%5D/coach/profile/page.tsx) — Reference for functional coach page pattern

### Audit Cycle Gate
You MUST append your completion entry to `/Users/techstack/Desktop/Agentics/Projects/proline-gym-platform/audit-cycle-update.md` BEFORE calling `attempt_completion`. This is a GATE REQUIREMENT. If you skip this step, the audit cycle cannot progress.
