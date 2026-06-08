# Cycle 1 — Actionable Prompts for Coding Agent

**Generated:** June 8, 2026 01:59 AM +03:00  
**Source Documents:**
- [`leads-code-review.md`](./leads-code-review.md) — 50 issues (5 CRITICAL, 8 HIGH)
- [`belts-code-review.md`](./belts-code-review.md) — 40 issues (6 CRITICAL, 7 HIGH)
- [`zod-reference.md`](./zod-reference.md) — No Zod installed, no validators directory
- [`arsenal-inventory.md`](./arsenal-inventory.md) — ECC/Superpowers framework catalog

---

## PROMPT 1: Fix Leads CRITICAL Issues

**Mode:** code
**Priority:** P1
**Estimated Effort:** 4 hours
**Depends On:** None

### Context
The Leads module ([`leads/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/page.tsx) and [`leads-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/leads-client.tsx)) has 5 CRITICAL and 8 HIGH issues from the code review. Stats are computed client-side via `.filter()` instead of server-side `COUNT` queries. Status changes have no error handling, no toast notifications, and no optimistic UI. All user-facing strings use `locale === 'ar' ? ...` ternaries instead of `useTranslations()`. There is no `gym_id` filter for multi-tenant isolation, and `any` types are used throughout instead of proper TypeScript interfaces.

### Required Deliverables

1. **Server-side stats query** — Modify [`leads/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/page.tsx:35-41)
   - Replace client-side `.filter()` on the full leads array with a dedicated Supabase query using `SELECT COUNT(*) ... GROUP BY status`
   - Use `supabase.from('leads').select('status', { count: 'exact', head: true }).eq('gym_id', user.gym_id)` pattern
   - Add stat boxes for ALL 6 lead statuses (`new`, `contacted`, `trial_scheduled`, `trial_completed`, `converted`, `lost`) — currently only 5 are shown, missing `trial_completed` and `lost`
   - Pass counts as props to `LeadsClient` instead of computing them client-side

2. **Error handling + toast for status changes** — Modify [`leads-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/leads-client.tsx:27-35)
   - Wrap `handleStatusChange` in `try/catch`
   - Add a toast notification library (e.g., `sonner` or `react-hot-toast`) — install if not present
   - Show `toast.success('Status updated')` on success and `toast.error('Failed to update status')` on failure
   - Implement optimistic UI: apply status change to local state immediately, revert on error
   - Merge `converted_at` into the single `.update()` call instead of making a separate second call (Issue #19)

3. **Migrate all hardcoded strings to `useTranslations()`** — Both files
   - In [`leads/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/page.tsx:47): Replace `locale === 'ar' ? 'خط أنابيب العملاء' : 'Lead Pipeline'` with `const t = await getTranslations('leads')` and use `t('title')`, `t('subtitle')`
   - In [`leads/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/page.tsx:57-70): Replace stat label ternaries with `t('new_leads')`, `t('contacted')`, `t('scheduled')`, `t('converted')`, `t('trial_completed')`, `t('lost')`
   - In [`leads-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/leads-client.tsx:56): Replace search placeholder ternary with `t('search_placeholder')`
   - In [`leads-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/leads-client.tsx:66): Replace status filter label ternary with `t('all_statuses')`
   - In [`leads-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/leads-client.tsx:92-100): Replace raw status enum display with `t(s)` for each status option
   - In [`leads-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/leads-client.tsx:128-143): Replace button label ternaries with `t('schedule_trial')` and `t('convert')`
   - In [`leads-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/leads-client.tsx:176-181): Replace empty state ternary with `t('no_leads')`
   - Use `isRTL` helper for direction class instead of `locale === 'ar' && 'font-arabic'` (Issue #7)

4. **Add missing i18n keys** — Modify [`en.json`](../../src/i18n/messages/en.json), [`ar.json`](../../src/i18n/messages/ar.json), [`fr.json`](../../src/i18n/messages/fr.json)
   - Add to `leads` namespace: `search_placeholder`, `schedule_trial`, `convert`, `all_statuses`, `lost`, `trial_completed`, `trial_scheduled`, `subtitle`, `new_leads`, `contacted`, `scheduled`, `converted`, `trial_completed`, `lost`
   - Ensure all 3 locale files have matching keys with appropriate translations

5. **Add `gym_id` filter for multi-tenant isolation** — Modify [`leads/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/page.tsx:28-31)
   - Add `.eq('gym_id', user.gym_id)` to the Supabase query
   - Get `gym_id` from the authenticated user's session context
   - Apply the same filter to the stats COUNT query

6. **Replace `any` types with proper TypeScript interfaces** — Both files
   - In [`leads/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/page.tsx:22): Replace `Record<string, any>` with `Record<string, string>` or `Record<LeadSource, string>` for `SOURCE_ICONS`
   - In [`leads/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/page.tsx:74): Replace `any[]` props with typed `Lead[]` and `Discipline[]`
   - In [`leads-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/leads-client.tsx:12-13): Replace `any[]` with proper `Lead[]` and `Discipline[]` interfaces
   - Import `OfflineLead` from [`schema.ts`](../../src/lib/db/schema.ts:312-328) or define a `Lead` interface locally
   - Add `created_at: string` to `OfflineLead` if missing (Issue #44)
   - Type `statusFilter` as a union: `'' | 'new' | 'contacted' | 'trial_scheduled' | 'trial_completed' | 'converted' | 'lost'`

7. **Add debounced server-side search** — Modify [`leads-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/leads-client.tsx:37-45)
   - Add `useDebounce(search, 300)` hook to debounce search input
   - Move search/filter logic to server-side Supabase query with `.ilike()` on `first_name`, `last_name`, `phone`, `email`
   - Pass search params via URL search params or a server action
   - Add `.toLowerCase()` to phone comparison for consistent case handling

### Validation Checklist
- [ ] Stats bar shows counts from server-side `COUNT` query, not client-side `.filter()`
- [ ] `handleStatusChange` has `try/catch`, shows toast on success and error, and applies optimistic UI
- [ ] Zero `locale === 'ar' ? ...` ternaries remain in either `page.tsx` or `leads-client.tsx`
- [ ] All 3 locale files have complete `leads` namespace with all required keys
- [ ] Supabase queries include `.eq('gym_id', ...)` filter
- [ ] No `any` types remain — all props and state are properly typed
- [ ] Search is debounced and uses server-side `.ilike()` queries
- [ ] `converted_at` is set in a single `.update()` call, not a separate second call
- [ ] Trial scheduling form has `min` date constraint and saves to `trial_classes` table
- [ ] TypeScript compiles with `tsc --noEmit` (zero errors)

### References
- Source files: [`leads/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/page.tsx), [`leads-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/leads-client.tsx), [`en.json`](../../src/i18n/messages/en.json), [`ar.json`](../../src/i18n/messages/ar.json), [`fr.json`](../../src/i18n/messages/fr.json), [`schema.ts`](../../src/lib/db/schema.ts)
- Code review: [`leads-code-review.md`](./leads-code-review.md) — Issues #1-#50, especially #4, #6, #16, #17, #18, #19, #45, #50
- Patterns to follow: Use `useTranslations('leads')` / `getTranslations('leads')` for all user-facing strings; use `createClient()` from `@/lib/supabase/server` for server queries; use `sonner` toast for notifications

### MANDATORY: Update audit-cycle-update.md
After completing this prompt, you MUST append to `/Users/techstack/Desktop/Agentics/Projects/proline-gym-platform/audit-cycle-update.md`:

```markdown
## Cycle 1 — Prompt 1: Fix Leads CRITICAL Issues — [Date Time +03:00]

### Completed
- [What was done, file by file]

### Verified
- [Checklist items marked pass/fail]

### Notes
- [Any issues encountered]

---
```

---

## PROMPT 2: Fix Belts CRITICAL Issues

**Mode:** code
**Priority:** P1
**Estimated Effort:** 5 hours
**Depends On:** None (can run parallel with Prompt 1)

### Context
The Belts module ([`belts/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/belts/page.tsx) and [`belt-engine-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/belts/belt-engine-client.tsx)) has 6 CRITICAL and 7 HIGH issues. The `students` table is missing `current_belt_rank` and `belt_promotion_date` columns — a showstopper schema mismatch. The promotion form has no multi-step stepper, no auto-refresh after promotion, no Zod validation, no rank-ordering validation, and no transaction safety. Belt colors/labels only cover 8 of 15 enum values. All user-facing strings use `locale === 'ar' ? ...` ternaries.

### Required Deliverables

1. **Create migration for missing `students` table columns** — Create new migration file
   - Create `supabase/migrations/000009_add_belt_columns.sql`
   - SQL: `ALTER TABLE students ADD COLUMN current_belt_rank belt_rank_enum, ADD COLUMN belt_promotion_date DATE;`
   - This fixes Issues #1 and #36 — the showstopper that makes the entire promotion workflow non-functional
   - Also fix the seed data in [`000006_seed_data.sql`](../../supabase/migrations/000006_seed_data.sql) if it references these columns (it currently tries to INSERT into non-existent columns)

2. **Add multi-step stepper workflow for promotion** — Modify [`belt-engine-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/belts/belt-engine-client.tsx:77-101)
   - Implement a 3-step stepper (this is C2-2 from the test register that was never implemented):
     - **Step 1:** Select Student + Discipline (with search/filter for students)
     - **Step 2:** Select Belt (filtered by discipline) + Coach (optional but with warning if not selected)
     - **Step 3:** Review & Confirm (show summary of all selections, confirm button)
   - Use a visual stepper component (e.g., numbered steps with active/completed states)
   - Add a confirmation dialog before the final insert
   - Use `useTranslations('belts')` for all stepper labels

3. **Add auto-refresh after promotion** — Modify [`belt-engine-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/belts/belt-engine-client.tsx:93-98)
   - Call `router.refresh()` after successful promotion to re-fetch server data (C2-4 fix)
   - Implement optimistic UI: update the student's `current_belt_rank` and `belt_promotion_date` in the local `students` array immediately
   - On error, revert the optimistic update and show a toast error
   - Import `useRouter` from `next/navigation`

4. **Add Zod validation schema for belt promotion** — Create new file
   - Create `src/lib/validators/belts.schema.ts` (or add to existing if Prompt 3 ran first)
   - Schema fields: `student_id` (UUID required), `discipline_id` (UUID required), `belt_rank` (enum of belt_rank_enum values), `coach_id` (UUID optional), `notes` (string max 500 optional)
   - Add rank-ordering validation: check that the target belt rank has a higher `sort_order` than the student's current belt rank
   - Wire into the promotion form using `react-hook-form` + `zodResolver` (install if not present)

5. **Make promotion atomic** — Modify [`belt-engine-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/belts/belt-engine-client.tsx:84-91)
   - Wrap `belt_promotions.insert` and `students.update` in a single Supabase RPC function with transaction, OR
   - Use `try/catch` that deletes the promotion record if the student update fails (rollback pattern)
   - Ensure both operations succeed or both fail — no inconsistent state

6. **Add belt rank ordering validation** — Modify [`belt-engine-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/belts/belt-engine-client.tsx:84-91)
   - Before inserting, compare the `sort_order` of the student's current belt vs the target belt
   - Reject promotion if target belt rank is <= current belt rank
   - Show a user-friendly error message: "Student already holds this belt rank or higher"
   - Use the `belt_hierarchies` table which has `sort_order` for each belt rank per discipline

7. **Migrate all hardcoded strings to `useTranslations()`** — Both files
   - In [`belts/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/belts/page.tsx:44-67): Replace all `locale === 'ar' ? ...` ternaries with `t('key')` calls using `getTranslations('belts')`
   - In [`belt-engine-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/belts/belt-engine-client.tsx:192-194): Replace hardcoded loading text with `t('submitting')`
   - Add missing i18n keys to all 3 locale files: `submitting`, `confirm_promotion`, `cancel`, `step_student`, `step_discipline`, `step_belt`, `step_confirm`, `promotion_success`, `promotion_error`, `select_coach_required`

8. **Add belt rank colors/labels for ALL 15 enum values** — Modify [`belt-engine-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/belts/belt-engine-client.tsx:28-47)
   - Currently only 8 of 15 `belt_rank_enum` values are covered
   - Add entries for: `white_yellow`, `yellow_orange`, `orange_green`, `green_blue`, `blue_purple`, `purple_brown`, `brown_black`, `black_2`, `black_3`, `black_4`, `black_5`, `red`
   - Use gradient or split-color CSS classes for intermediate ranks (e.g., `white_yellow` = half white / half yellow)
   - Add `console.warn` in the fallback for any missing rank (Issue #21)

### Validation Checklist
- [ ] Migration `000009_add_belt_columns.sql` exists and adds `current_belt_rank` + `belt_promotion_date` to `students` table
- [ ] Promotion form has a 3-step stepper (select student/discipline → select belt/coach → review/confirm)
- [ ] After promotion, student list auto-refreshes via `router.refresh()` and optimistic UI
- [ ] Zod schema validates promotion form before submission
- [ ] Promotion is atomic — both `belt_promotions.insert` and `students.update` succeed or both fail
- [ ] Rank-ordering validation prevents promoting to a lower or equal belt
- [ ] Zero `locale === 'ar' ? ...` ternaries remain in either file
- [ ] All 15 belt rank enum values have colors and labels in `BELT_COLORS` and `BELT_LABELS`
- [ ] `coach_id` constraint is resolved (either made optional in schema or mandatory in UI)
- [ ] TypeScript compiles with `tsc --noEmit` (zero errors)

### References
- Source files: [`belts/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/belts/page.tsx), [`belt-engine-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/belts/belt-engine-client.tsx), [`000002_create_core_tables.sql`](../../supabase/migrations/000002_create_core_tables.sql), [`000006_seed_data.sql`](../../supabase/migrations/000006_seed_data.sql), [`en.json`](../../src/i18n/messages/en.json), [`ar.json`](../../src/i18n/messages/ar.json), [`fr.json`](../../src/i18n/messages/fr.json)
- Code review: [`belts-code-review.md`](./belts-code-review.md) — Issues #1-#40, especially #1, #13, #14, #16, #17, #31, #36
- Patterns to follow: Use `useTranslations('belts')` / `getTranslations('belts')` for all user-facing strings; use `createClient()` from `@/lib/supabase/server` for server queries; use `sonner` toast for notifications

### MANDATORY: Update audit-cycle-update.md
After completing this prompt, you MUST append to `/Users/techstack/Desktop/Agentics/Projects/proline-gym-platform/audit-cycle-update.md`:

```markdown
## Cycle 1 — Prompt 2: Fix Belts CRITICAL Issues — [Date Time +03:00]

### Completed
- [What was done, file by file]

### Verified
- [Checklist items marked pass/fail]

### Notes
- [Any issues encountered]

---
```

---

## PROMPT 3: Install & Establish Zod Validation Infrastructure

**Mode:** code
**Priority:** P1
**Estimated Effort:** 2 hours
**Depends On:** None (can run parallel with Prompts 1 & 2)

### Context
Zod is NOT installed anywhere in the project. The MASTER_PLAN.md declares Zod as the SSOT validation layer (Layer 3 in the Truth Chain), but it has never been implemented. There is no `src/lib/validators/` directory, no `zod` dependency in `package.json`, and no schema-based validation in any module. All forms use manual `useState` + inline validation. This prompt establishes the Zod infrastructure that all subsequent prompts will depend on.

### Required Deliverables

1. **Install dependencies** — Modify [`package.json`](../../package.json)
   - Run: `npm install zod react-hook-form @hookform/resolvers`
   - Verify installation in `package.json` and `node_modules`

2. **Create validators directory structure**
   - Create `src/lib/validators/` directory
   - Create the following schema files:

3. **Create Zod schemas for ALL 5 Phase C modules:**
   - [`src/lib/validators/leads.schema.ts`](../../src/lib/validators/leads.schema.ts):
     - `leadSchema`: `first_name` (string min 1), `last_name` (string min 1), `phone` (string min 8), `email` (email optional or empty), `interested_discipline_id` (UUID), `source` (enum of lead sources), `notes` (string max 500 optional)
     - `leadStatusUpdateSchema`: `status` (enum of lead_status_enum values), `converted_at` (ISO date string optional)
     - `trialScheduleSchema`: `lead_id` (UUID), `trial_date` (date string, must be today or future), `trial_time` (time string)
   - [`src/lib/validators/belts.schema.ts`](../../src/lib/validators/belts.schema.ts):
     - `beltPromotionSchema`: `student_id` (UUID), `discipline_id` (UUID), `belt_rank` (enum of belt_rank_enum values), `coach_id` (UUID optional), `notes` (string max 500 optional)
     - `beltPromotionWithValidationSchema`: extends above with rank-ordering validation using `.refine()`
   - [`src/lib/validators/camps.schema.ts`](../../src/lib/validators/camps.schema.ts):
     - `campSchema`: `name_ar` (string min 1), `name_en` (string min 1), `name_fr` (string min 1), `description_ar` (string optional), `description_en` (string optional), `description_fr` (string optional), `start_date` (date string), `end_date` (date string, must be after start_date), `max_participants` (number positive), `price` (number non-negative), `discipline_id` (UUID)
   - [`src/lib/validators/pt.schema.ts`](../../src/lib/validators/pt.schema.ts):
     - `ptPackageSchema`: `name_ar` (string min 1), `name_en` (string min 1), `name_fr` (string min 1), `description_ar` (string optional), `description_en` (string optional), `description_fr` (string optional), `sessions_count` (number positive int), `price` (number non-negative), `validity_days` (number positive int)
     - `ptPurchaseSchema`: `package_id` (UUID), `student_id` (UUID), `purchase_date` (date string)
   - [`src/lib/validators/rentals.schema.ts`](../../src/lib/validators/rentals.schema.ts):
     - `rentalBookingSchema`: `coach_id` (UUID), `rental_date` (date string), `start_time` (time string), `end_time` (time string, must be after start_time), `notes` (string max 500 optional)
     - `rentalConflictCheckSchema`: `coach_id` (UUID), `rental_date` (date string), `start_time` (time string), `end_time` (time string)

4. **Create schemas for Phase A modules (future retro-fit):**
   - [`src/lib/validators/students.schema.ts`](../../src/lib/validators/students.schema.ts):
     - `studentSchema`: `first_name_ar` (string min 1), `first_name_en` (string min 1), `first_name_fr` (string min 1), `last_name_ar` (string min 1), `last_name_en` (string min 1), `last_name_fr` (string min 1), `phone` (string min 8), `email` (email optional), `emergency_contact_name` (string optional), `emergency_contact_phone` (string optional), `medical_notes` (string optional), `join_date` (date string), `gym_id` (UUID)
   - [`src/lib/validators/memberships.schema.ts`](../../src/lib/validators/memberships.schema.ts):
     - `membershipSchema`: `student_id` (UUID), `plan_id` (UUID), `start_date` (date string), `end_date` (date string, must be after start_date), `price_paid` (number non-negative), `payment_method` (string), `notes` (string optional)

5. **Create barrel export** — [`src/lib/validators/index.ts`](../../src/lib/validators/index.ts)
   - Re-export all schemas and inferred types from all schema files
   - Example: `export { leadSchema, leadStatusUpdateSchema, trialScheduleSchema, type LeadInput, type LeadStatusUpdate, type TrialSchedule } from './leads.schema'`
   - Same pattern for all modules

6. **Add i18n error messages for Zod validation** — Modify [`en.json`](../../src/i18n/messages/en.json), [`ar.json`](../../src/i18n/messages/ar.json), [`fr.json`](../../src/i18n/messages/fr.json)
   - Add a `validation` namespace with common error messages:
     - `required`: "This field is required"
     - `invalid_email`: "Invalid email address"
     - `min_length`: "Must be at least {min} characters"
     - `max_length`: "Must be at most {max} characters"
     - `future_date`: "Date must be today or in the future"
     - `end_after_start`: "End date must be after start date"
     - `positive_number`: "Must be a positive number"
     - `invalid_uuid`: "Invalid ID format"
   - Add appropriate Arabic and French translations

### Validation Checklist
- [ ] `zod`, `react-hook-form`, `@hookform/resolvers` are in `package.json` dependencies
- [ ] `src/lib/validators/` directory exists with all 7 schema files + barrel export
- [ ] Each schema file exports both the schema and its inferred TypeScript type
- [ ] Barrel `index.ts` re-exports all schemas and types
- [ ] All 3 locale files have a `validation` namespace with error messages
- [ ] Schemas compile without TypeScript errors (`tsc --noEmit` passes)
- [ ] Schemas handle tri-lingual fields (`_ar`, `_en`, `_fr` variants) correctly

### References
- Source files: [`package.json`](../../package.json), [`en.json`](../../src/i18n/messages/en.json), [`ar.json`](../../src/i18n/messages/ar.json), [`fr.json`](../../src/i18n/messages/fr.json)
- Code review: [`zod-reference.md`](./zod-reference.md) — Sections 1-7, especially Section 4 (Recommended Pattern)
- Patterns to follow: Use the exact schema pattern from [`zod-reference.md`](./zod-reference.md#43-example-schema-pattern-to-follow); use `z.infer<typeof schema>` for TypeScript types; use `z.string().uuid()` for foreign keys; use `z.enum()` for DB enum values; use `.refine()` for cross-field validation (e.g., end_date > start_date)

### MANDATORY: Update audit-cycle-update.md
After completing this prompt, you MUST append to `/Users/techstack/Desktop/Agentics/Projects/proline-gym-platform/audit-cycle-update.md`:

```markdown
## Cycle 1 — Prompt 3: Install & Establish Zod Validation Infrastructure — [Date Time +03:00]

### Completed
- [What was done, file by file]

### Verified
- [Checklist items marked pass/fail]

### Notes
- [Any issues encountered]

---
```

---

## PROMPT 4: Wire Zod into Phase C Forms

**Mode:** code
**Priority:** P2
**Estimated Effort:** 3 hours
**Depends On:** Prompt 3 (needs Zod schemas installed and validators directory created)

### Context
All 5 Phase C modules currently use manual `useState` + inline validation for form handling. Prompt 3 established the Zod schema infrastructure. This prompt wires those schemas into the actual form components using `react-hook-form` + `zodResolver`. This replaces manual state management with schema-based validation, providing consistent error messages, type safety, and a foundation for future server-side validation.

### Required Deliverables

1. **Leads form: wire `leads.schema.ts` into `leads-client.tsx`** — Modify [`leads-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/leads-client.tsx)
   - Replace manual `useState` for trial scheduling form with `useForm<LeadInput>` + `zodResolver(leadSchema)`
   - Replace manual `handleStatusChange` validation with `leadStatusUpdateSchema.safeParse()`
   - Add `trialScheduleSchema.safeParse()` before submitting trial data
   - Show Zod validation errors inline next to form fields
   - Import from `@/lib/validators`

2. **Belts promotion form: wire `belts.schema.ts` into `belt-engine-client.tsx`** — Modify [`belt-engine-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/belts/belt-engine-client.tsx)
   - Replace the manual guard clause `if (!selectedStudent || !selectedDiscipline || !selectedBelt)` with `beltPromotionSchema.safeParse()`
   - Add rank-ordering validation using `beltPromotionWithValidationSchema`
   - Show validation errors in the stepper UI (e.g., red border on invalid step)
   - Import from `@/lib/validators`

3. **Camps form: wire `camps.schema.ts` into `camps-client.tsx`** — Modify [`camps-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/camps/camps-client.tsx)
   - Replace manual `useState` for camp creation form with `useForm<CampInput>` + `zodResolver(campSchema)`
   - Add cross-field validation: `end_date` must be after `start_date`
   - Show validation errors inline
   - Import from `@/lib/validators`

4. **PT form: wire `pt.schema.ts` into `pt-client.tsx`** — Modify [`pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx)
   - Replace manual `useState` for PT package creation form with `useForm<PtPackageInput>` + `zodResolver(ptPackageSchema)`
   - Add `ptPurchaseSchema.safeParse()` for purchase workflow validation
   - Show validation errors inline
   - Import from `@/lib/validators`

5. **Rentals form: wire `rentals.schema.ts` into `rentals-client.tsx`** — Modify [`rentals-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/rentals/rentals-client.tsx)
   - Replace manual `useState` for booking form with `useForm<RentalBookingInput>` + `zodResolver(rentalBookingSchema)`
   - Add `rentalConflictCheckSchema.safeParse()` before checking for booking conflicts
   - Show validation errors inline
   - Import from `@/lib/validators`

### Validation Checklist
- [ ] Leads trial scheduling form uses `useForm` + `zodResolver` with `leadSchema`
- [ ] Belts promotion form validates with `beltPromotionSchema.safeParse()` before submit
- [ ] Camps creation form uses `useForm` + `zodResolver` with `campSchema`
- [ ] PT package form uses `useForm` + `zodResolver` with `ptPackageSchema`
- [ ] Rentals booking form uses `useForm` + `zodResolver` with `rentalBookingSchema`
- [ ] All forms show inline validation errors from Zod
- [ ] Cross-field validations work (end_date > start_date, rank ordering, etc.)
- [ ] TypeScript compiles with `tsc --noEmit` (zero errors)
- [ ] All 3 locales render correctly with Zod error messages from i18n

### References
- Source files: [`leads-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/leads-client.tsx), [`belt-engine-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/belts/belt-engine-client.tsx), [`camps-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/camps/camps-client.tsx), [`pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx), [`rentals-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/rentals/rentals-client.tsx)
- Code review: [`zod-reference.md`](./zod-reference.md) — Section 4.4 (Form Integration Pattern)
- Patterns to follow: Use the exact form integration pattern from [`zod-reference.md`](./zod-reference.md#44-form-integration-pattern-to-follow); use `useForm<SchemaType>` with `zodResolver(schema)`; use `register()` for input binding; use `formState.errors` for inline error display; use `.safeParse()` for one-off validation (status changes, conflict checks)

### MANDATORY: Update audit-cycle-update.md
After completing this prompt, you MUST append to `/Users/techstack/Desktop/Agentics/Projects/proline-gym-platform/audit-cycle-update.md`:

```markdown
## Cycle 1 — Prompt 4: Wire Zod into Phase C Forms — [Date Time +03:00]

### Completed
- [What was done, file by file]

### Verified
- [Checklist items marked pass/fail]

### Notes
- [Any issues encountered]

---
```

---

## PROMPT 5: Generate Supabase DB Types

**Mode:** code
**Priority:** P2
**Estimated Effort:** 2 hours
**Depends On:** None

### Context
There is no generated TypeScript types file from the Supabase schema. All Phase C modules use inline `type`/`interface` definitions with `any` for complex fields (e.g., `user: any` in belt-engine-client.tsx). The MASTER_PLAN.md specifies that generated DB types should be Layer 2 in the SSOT Truth Chain. This prompt generates the types from the Supabase schema and replaces all `any` usage in Phase C files with the generated types.

### Required Deliverables

1. **Generate TypeScript types from Supabase schema**
   - Run: `npx supabase gen types typescript --local > src/types/database.ts`
   - If the Supabase CLI is not installed or configured, install it first: `npm install -g supabase` or use `npx supabase`
   - If `--local` doesn't work (no local Supabase config), use the project ref: `npx supabase gen types typescript --project-ref <project-id> --schema public > src/types/database.ts`
   - Verify the generated file contains all tables: `students`, `profiles`, `leads`, `belt_promotions`, `belt_hierarchies`, `belt_promotions`, `camps`, `pt_packages`, `rentals`, `memberships`, `coaches`, `disciplines`, `gyms`

2. **Create typed helper types** — Create [`src/types/index.ts`](../../src/types/index.ts)
   - Define helper types that wrap the generated `Database` type:
     - `export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']`
     - `export type TableInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']`
     - `export type TableUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']`
   - Define domain-specific types:
     - `export type Lead = Tables<'leads'>`
     - `export type Student = Tables<'students'> & { current_belt_rank?: string; belt_promotion_date?: string }`
     - `export type BeltPromotion = Tables<'belt_promotions'>`
     - `export type Camp = Tables<'camps'>`
     - `export type PtPackage = Tables<'pt_packages'>`
     - `export type Rental = Tables<'rentals'>`
   - Add `StudentProfile` interface with `first_name_ar`, `first_name_en`, `first_name_fr`, `last_name_ar`, `last_name_en`, `last_name_fr`
   - Add `CoachProfile` interface with same profile fields

3. **Replace `any` types in ALL Phase C files with generated database types** — Modify all 10 Phase C files
   - [`leads/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/page.tsx): Replace `any[]` props with `Lead[]` and `Discipline[]`
   - [`leads-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/leads-client.tsx): Replace `any[]` with `Lead[]` and `Discipline[]`; replace `Record<string, any>` with `Record<string, string>`
   - [`belts/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/belts/page.tsx): Replace `.map((s: any)` with `.map((s: StudentWithUser)` and `.map((c: any)` with `.map((c: CoachWithUser)`
   - [`belt-engine-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/belts/belt-engine-client.tsx): Replace `type Student = { ... user: any }` with proper `StudentWithUser` interface; replace `type Coach = { ... user: any }` with `CoachWithUser`
   - [`camps/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/camps/page.tsx): Replace `any[]` with `Camp[]`
   - [`camps-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/camps/camps-client.tsx): Replace `any[]` with `Camp[]`
   - [`pt/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/page.tsx): Replace `any[]` with `PtPackage[]`
   - [`pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx): Replace `any[]` with `PtPackage[]`
   - [`rentals/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/rentals/page.tsx): Replace `any[]` with `Rental[]`
   - [`rentals-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/rentals/rentals-client.tsx): Replace `any[]` with `Rental[]`

4. **Verify TypeScript compilation passes**
   - Run: `npx tsc --noEmit`
   - Fix any type errors that arise from the migration
   - Ensure zero type errors before marking complete

### Validation Checklist
- [ ] `src/types/database.ts` exists with generated Supabase types for all tables
- [ ] `src/types/index.ts` exists with `Tables<>`, `TableInsert<>`, `TableUpdate<>` helper types
- [ ] Domain-specific types (`Lead`, `Student`, `BeltPromotion`, `Camp`, `PtPackage`, `Rental`) are defined
- [ ] Zero `any` types remain in any Phase C file (leads, belts, camps, pt, rentals)
- [ ] `StudentProfile` and `CoachProfile` interfaces are properly typed (no `any` for `user`)
- [ ] `tsc --noEmit` passes with zero errors
- [ ] All imports from `@/types` are correct and resolve

### References
- Source files: All 10 Phase C files in `src/app/[locale]/(dashboard)/{leads,belts,camps,pt,rentals}/`
- Code review: [`zod-reference.md`](./zod-reference.md) — Section 5 (DB Types); [`belts-code-review.md`](./belts-code-review.md) — Issues #5, #8, #9, #40; [`leads-code-review.md`](./leads-code-review.md) — Issues #1, #11, #12
- Patterns to follow: Use `Tables<'table_name'>` from generated types; define domain-specific types in `src/types/index.ts`; never use `any` — use `unknown` if type is truly uncertain; use `satisfies` operator for type narrowing where needed

### MANDATORY: Update audit-cycle-update.md
After completing this prompt, you MUST append to `/Users/techstack/Desktop/Agentics/Projects/proline-gym-platform/audit-cycle-update.md`:

```markdown
## Cycle 1 — Prompt 5: Generate Supabase DB Types — [Date Time +03:00]

### Completed
- [What was done, file by file]

### Verified
- [Checklist items marked pass/fail]

### Notes
- [Any issues encountered]

---
```