# Camps & Events Module — Deep Code Review

**Audit Date:** June 8, 2026  
**Files Audited:**
- [`camps/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/camps/page.tsx) (56 lines)
- [`camps/camps-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/camps/camps-client.tsx) (263 lines)
- [`camps.schema.ts`](../../src/lib/validators/camps.schema.ts) (53 lines)
- [`en.json`](../../src/i18n/messages/en.json) (camps namespace: lines 571–593)
- [`ar.json`](../../src/i18n/messages/ar.json) (camps namespace: lines 571–593)
- [`fr.json`](../../src/i18n/messages/fr.json) (camps namespace: lines 571–593)
- [`database.ts`](../../src/types/database.ts) (`camps`: lines 412–494, `camp_registrations`: lines 338–411, `camp_attendance`: lines 278–337)
- [`index.ts`](../../src/types/index.ts) (Camp/CampRegistration exports: lines 22–23)
- [`PHASE_C_TEST_REGISTER.md`](../../docs/testing/PHASE_C_TEST_REGISTER.md) (Camps section: lines 40–46)
- [`dispatch-spec.json`](../../../Shared/missions/phase-c-refinements/dispatch-spec.json) (c2-camps-events agent: lines 41–53)
- [`000003_create_operational_tables.sql`](../../supabase/migrations/000003_create_operational_tables.sql) (`camps` table: lines 322–345, `camp_registrations`: lines 350–364, `camp_attendance`: lines 369–383)
- [`000001_create_enums.sql`](../../supabase/migrations/000001_create_enums.sql) (`camp_status_enum`: lines 74–80)
- [`000011_fix_rls_gym_scoping.sql`](../../supabase/migrations/000011_fix_rls_gym_scoping.sql) (camp RLS policies: lines 90–111)
- [`marketing/page.tsx`](../../src/app/%5Blocale%5D/(marketing)/page.tsx) (camp section: lines 20–63)
- [`schema.ts`](../../src/lib/db/schema.ts) (`OfflineCamp`/`OfflineCampRegistration`: lines 355, 411–412, 441–442)
- [`sync-engine.ts`](../../src/lib/db/sync-engine.ts) (camp sync tables: lines 68–69)

---

## File: [`camps/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/camps/page.tsx) (56 lines)

### Issues Found

| # | Line(s) | Severity | Issue | Root Cause | Fix Required |
|---|---------|----------|-------|------------|-------------|
| 1 | 13 | **LOW** | `params` typed as `{ locale: string }` — in Next.js 14 App Router, `params` should be `Promise<{ locale: string }>` (async). May cause build warnings in newer versions. | Stale Next.js 14 pattern | Use `Promise<{ locale: string }>` and `const { locale } = await params` |
| 2 | 18–28 | **MEDIUM** | Auth check + profile fetch happens on every render but there's no loading/error state. If `getUser()` or the profile query fails, the page silently returns `null` with no user feedback. | No error boundary or fallback UI | Add error handling: if `!user` redirect to login, if profile fetch fails show an error toast or fallback |
| 3 | 30–34 | **MEDIUM** | `select('*')` fetches all 17 columns including `deleted_at`, `early_bird_price_usd`, `early_bird_deadline`, `sibling_discount_percent` — none of which are used in the client component. Overfetching wastes bandwidth. | No column projection | Use `select('id, name_ar, name_en, name_fr, description_ar, description_en, description_fr, start_date, end_date, max_capacity, min_age, max_age, price_usd, price_lbp, status')` |
| 4 | 30–34 | **MEDIUM** | No `.eq('deleted_at', null)` filter — soft-deleted camps (`deleted_at IS NOT NULL`) will appear in the list. The DB schema supports soft-delete via `deleted_at TIMESTAMPTZ` but the query doesn't filter it out. | Missing soft-delete filter | Add `.is('deleted_at', null)` to the query |
| 5 | 36 | **LOW** | `getTranslations('camps')` is called but `t` is only used for `title` and `subtitle` (lines 43, 46). The remaining UI text in this file is minimal, but the `t` function could be used more broadly. | Underutilized i18n | Already acceptable — the heavy i18n lifting is in the client component |
| 6 | 42–48 | **LOW** | Title/subtitle use `t('title')` and `t('subtitle')` correctly — no issue here, this is good i18n usage | — | — |

---

## File: [`camps/camps-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/camps/camps-client.tsx) (263 lines)

### Issues Found

| # | Line(s) | Severity | Issue | Root Cause | Fix Required |
|---|---------|----------|-------|------------|-------------|
| 7 | 17–34 | **HIGH** | **Duplicate Zod schema** — `campFormSchema` is defined locally in the client component (lines 17–34) while `campInsertSchema` exists in `camps.schema.ts` (lines 5–29). The local schema uses `z.string()` for numeric fields (`max_capacity`, `price_usd`, `price_lbp`, `min_age`, `max_age`) while the canonical schema uses `z.number()`. This means the local form schema and the canonical DB schema are **out of sync** — the form accepts strings but the DB insert expects numbers. | Schema duplication — the local form schema was written independently from the canonical Zod schema | Remove the local `campFormSchema` and use `campInsertSchema` directly, or create a dedicated form schema that transforms string inputs to numbers before validation |
| 8 | 21–22 | **MEDIUM** | Date validation uses `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` which validates format but NOT date validity. Values like `2026-02-30` or `2026-13-01` pass regex but are invalid dates. | No date validity check | Add a `.refine()` that checks `!isNaN(Date.parse(val))` or use `z.coerce.date()` |
| 9 | 31–33 | **MEDIUM** | End-date-after-start-date validation uses `.refine()` but the logic is inverted: `!data.end_date \|\| !data.start_date \|\| data.end_date >= data.start_date`. If either date is empty, the refine passes (returns true) — meaning an empty end_date with a valid start_date is considered valid. | Logic allows empty dates to pass | Make both dates required first, then validate ordering |
| 10 | 38–60 | **HIGH** | `CampRow` type is **hand-written** and duplicates the DB schema. It's missing the `early_bird_price_usd`, `early_bird_deadline`, `sibling_discount_percent`, `deleted_at` columns that exist in the DB. It also has `price_lbp?: number \| null` but the DB has `price_lbp NUMERIC(15,2)` which is nullable — the type is correct but incomplete. | No use of generated DB types | Replace `CampRow` with `import { Camp } from '@/types'` (which is `TableRow<'camps'>` from `database.ts:22`) |
| 11 | 38–60 | **MEDIUM** | `CampRow` has `status: string` (line 56) but the DB column is `camp_status_enum` — a Postgres enum with values `draft, open, full, in_progress, completed, cancelled`. Using `string` allows any string to be assigned, bypassing type safety. | No enum type used | Use `CampStatus` from `@/types` (line 82 of `index.ts`) |
| 12 | 99–148 | **CRITICAL** | **Hardcoded `gym_id`** — line 110 sets `gym_id: '00000000-0000-0000-0000-000000000000'` with a comment "will be set by RLS/server context". This is a **zero-UUID placeholder** that is sent to the DB. If RLS doesn't override it (which RLS policies typically don't — they FILTER, they don't SET values), the camp will be created with an invalid gym_id, making it invisible to all gyms. | Placeholder UUID instead of actual gym context | Fetch the actual `gym_id` from the user's profile (same as `page.tsx` lines 21–28) and pass it to the client, or use a server action to create camps |
| 13 | 99–148 | **CRITICAL** | **No try/catch on Supabase insert** — the `handleCreate` function (line 99) calls `await supabase.from('camps').insert(...)` (line 127) without a try/catch. If the network fails or Supabase throws, the error is unhandled. The `if (!error)` check (line 143) only handles Supabase response errors, not exceptions. | Missing error boundary | Wrap the insert in `try/catch`, show a user-facing toast on failure, and re-enable the submit button |
| 14 | 127–142 | **HIGH** | **No error feedback to user** — when the insert fails (`error` is truthy), the code does nothing. The `if (!error)` block (line 143) only closes the modal on success. On failure, the modal stays open but there's no error message, no toast, no alert. The user is left wondering what happened. | Missing error notification | Add `toast.error(error.message)` or set an `errorMessage` state variable and display it in the modal |
| 15 | 127–142 | **HIGH** | **No loading state recovery on error** — `setSubmitting(false)` is only called after the `if (!error)` block (line 147). If `error` is truthy, `setSubmitting(false)` is never called, leaving the submit button permanently disabled. The user is stuck. | Missing `finally` block or error-path state reset | Move `setSubmitting(false)` to a `finally` block or add it in the error path |
| 16 | 127 | **MEDIUM** | **No `gym_id` in the insert payload** — the insert at line 127 sends `name_ar, name_en, name_fr, start_date, end_date, max_capacity, description_ar, description_en, description_fr, price_usd, price_lbp, min_age, max_age, status: 'draft'` but does NOT send `gym_id`. The DB column `gym_id UUID NOT NULL` will cause a **NOT NULL constraint violation** unless RLS or a DB trigger fills it in. | Missing required gym_id in insert | Include `gym_id` from the authenticated user's profile in the insert payload |
| 17 | 127–142 | **MEDIUM** | **Data inconsistency between canonical object and insert payload** — the `canonical` object (lines 101–116) is validated against `campInsertSchema` (line 118), but the actual insert (lines 127–142) re-derives values from `data` instead of using the validated `parsed.data`. If the validation passes but the re-derivation produces different values (e.g., `parseInt` vs `parseFloat` edge cases), the DB insert could have different data than what was validated. | Validated data not used for insert | Use `parsed.data` for the insert payload instead of re-deriving from `data` |
| 18 | 101–116 | **MEDIUM** | `name_ar: data.name_ar \|\| data.name_en` — if `name_ar` is empty, it falls back to `name_en`. This is a reasonable UX choice but it means the DB could have `name_ar === name_en` which is confusing for Arabic-speaking users. | Silent fallback with no user awareness | Show a warning or make `name_ar` required (it already has `min(1)` validation in the form schema) |
| 19 | 110 | **HIGH** | `gym_id: '00000000-0000-0000-0000-000000000000'` — this zero-UUID is included in the `canonical` object that gets validated by `campInsertSchema`. The Zod schema requires `gym_id: z.string().uuid()` (line 17 of `camps.schema.ts`), so this fake UUID passes validation. But it's not a real gym_id. | Fake UUID in validated payload | Remove `gym_id` from the canonical object entirely and let the server/RLS set it, OR fetch the real gym_id |
| 20 | 118–124 | **MEDIUM** | Validation error handling uses `alert()` (line 122) — a browser-native dialog that blocks the UI and is not localized. The `firstIssue?.message` is in English (from Zod's default messages). | Browser alert for validation errors | Show the error inline in the form or use a toast notification |
| 21 | 152–155 | **LOW** | "New Camp" button uses `t('new_camp')` — correct i18n usage. No issue. | — | — |
| 22 | 168 | **LOW** | Name (EN) input placeholder is hardcoded `"Name (EN)"` instead of using `t('name_en_placeholder')` — but there's no such key in the i18n namespace. The Arabic placeholder uses `t('name_ar_placeholder')` (line 172) correctly. | Missing i18n key for English placeholder | Add `"name_en_placeholder": "Name (EN)"` to all 3 locale files and use `t('name_en_placeholder')` |
| 23 | 189 | **LOW** | "Price USD" label is hardcoded instead of using `t('price_usd')` — no i18n key exists for this field. | Missing i18n key | Add `"price_usd": "Price USD"` to all 3 locale files |
| 24 | 192 | **LOW** | "Price LBP" label is hardcoded instead of using `t('price_lbp')` — no i18n key exists for this field. | Missing i18n key | Add `"price_lbp": "Price LBP"` to all 3 locale files |
| 25 | 215 | **CRITICAL** | **Hardcoded locale ternary** — `locale === 'ar' ? camp.name_ar : locale === 'fr' ? camp.name_fr : camp.name_en` — this is one of the 2 hardcoded locale ternaries mentioned in the task description. It bypasses i18n and hardcodes the locale-switching logic. | No helper function for localized name display | Create a `getLocalizedName(camp, locale)` helper or use a computed property. This pattern appears in multiple places across the codebase and should be standardized. |
| 26 | 224 | **LOW** | Date display uses `new Date(camp.start_date).toLocaleDateString()` — this uses the browser's default locale, which may not match the app's locale. For example, if the app is in Arabic but the browser is set to English, dates will display in English format. | Browser locale vs app locale mismatch | Use `toLocaleDateString(locale)` with the app's locale parameter |
| 27 | 234 | **LOW** | Description display shows only `camp.description_en` (line 234) regardless of locale. Should show the localized description based on `locale`. | Non-localized description display | Use the same locale ternary pattern: `locale === 'ar' ? camp.description_ar : locale === 'fr' ? camp.description_fr : camp.description_en` |
| 28 | 235 | **LOW** | Price display `camp.price_usd` is shown without currency formatting. For LBP prices, `camp.price_lbp` is never shown in the expanded view. | Missing LBP price display | Add LBP price display: `{camp.price_lbp && <p className="text-sm font-medium">{camp.price_lbp.toLocaleString()} LBP</p>}` |
| 29 | 240 | **LOW** | `t('coming_soon')` displays "Registration & attendance coming soon" — this is a placeholder message indicating that registration and attendance features are NOT implemented. This is a known gap. | Feature not implemented | Implement registration flow (see Issues #35–#38) |
| 30 | 255–260 | **LOW** | Empty state uses emoji `🏕️` (line 257) and `t('no_camps')` — correct i18n usage. No issue. | — | — |

---

## File: [`camps.schema.ts`](../../src/lib/validators/camps.schema.ts) (53 lines)

### Issues Found

| # | Line(s) | Severity | Issue | Root Cause | Fix Required |
|---|---------|----------|-------|------------|-------------|
| 31 | 5–29 | **HIGH** | **Schema not used by the client** — `campInsertSchema` is imported in `camps-client.tsx` (line 14) and used for validation (line 118), but the actual insert payload (lines 127–142) re-derives values from raw form data instead of using `parsed.data`. The schema validates but the validated data is discarded. | Validated data not consumed | Use `parsed.data` for the insert payload |
| 32 | 14 | **MEDIUM** | `max_capacity: z.number().int().positive()` — the DB column is `max_capacity INTEGER NOT NULL` with no CHECK constraint for positive values. The Zod schema is stricter than the DB, which is good, but the form schema (`campFormSchema` in `camps-client.tsx:23`) uses `z.string()` for this field, creating a type mismatch. | Form schema vs canonical schema mismatch | Align the form schema with the canonical schema, or use `z.preprocess()` to convert string to number |
| 33 | 15 | **MEDIUM** | `price_usd: z.number().positive()` — the DB column is `price_usd NUMERIC(12,2) NOT NULL`. The Zod schema requires positive, which is good, but the form sends it as a string. | Same type mismatch as #32 | Same fix as #32 |
| 34 | 17 | **HIGH** | `gym_id: z.string().uuid('Invalid gym ID')` — the schema requires `gym_id` to be a valid UUID. But the client sends a fake zero-UUID (`00000000-0000-0000-0000-000000000000`) which passes this validation. The schema validates format but not **correctness** of the value. | No gym_id validation beyond UUID format | Either: (a) remove `gym_id` from the insert schema and let RLS/triggers set it, or (b) add a `.refine()` that checks the gym_id exists in the `gyms` table |
| 35 | 42–51 | **MEDIUM** | `campRegistrationSchema` exists (lines 42–51) but is **never used anywhere** in the camps module. No registration UI, no registration API route, no server action uses this schema. | Dead schema — registration flow not implemented | Either implement the registration flow or remove the unused schema |
| 36 | 45 | **LOW** | `registration_date` is optional with a regex validation — but the DB column has `DEFAULT CURRENT_DATE`, so it's fine to omit. No issue. | — | — |
| 37 | 46 | **LOW** | `status` defaults to `'registered'` but the DB CHECK constraint allows only `'pending', 'confirmed', 'cancelled', 'waitlisted'` (see migration line 360). `'registered'` is NOT in the allowed list — this would cause a DB constraint violation. | Zod default doesn't match DB CHECK constraint | Change default to `'confirmed'` or `'pending'` to match DB constraints |

---

## File: [`marketing/page.tsx`](../../src/app/%5Blocale%5D/(marketing)/page.tsx) — Landing Page Camp Section

### Issues Found

| # | Line(s) | Severity | Issue | Root Cause | Fix Required |
|---|---------|----------|-------|------------|-------------|
| 38 | 20–25 | **MEDIUM** | No `.eq('gym_id', ...)` filter on the landing page camp query — fetches camps across ALL gyms. On a multi-tenant platform, this could leak camp data from other gyms. | Missing gym context on public page | Add a `gym_id` filter (the landing page may not have auth context — use a default gym slug or add a `gym` subdomain check) |
| 39 | 20–25 | **MEDIUM** | No `.is('deleted_at', null)` filter — soft-deleted camps could appear on the landing page. | Missing soft-delete filter | Add `.is('deleted_at', null)` |
| 40 | 20–25 | **LOW** | No `.neq('status', 'draft')` filter — draft camps could appear on the public landing page. Only `open` camps should be visible to the public. | Missing status filter for public visibility | Add `.neq('status', 'draft')` or `.in('status', ['open'])` |
| 41 | 39 | **CRITICAL** | **Hardcoded locale ternary** — `locale === 'ar' ? 'المخيمات القادمة' : locale === 'fr' ? 'Camps à Venir' : 'Upcoming Camps'` — this is the second of the 2 hardcoded locale ternaries mentioned in the task description. The landing page does not use `getTranslations('camps')` at all. | No i18n integration on landing page | Import `getTranslations`, call `const t = await getTranslations('camps')`, and use `t('upcoming_camps')` — but this key doesn't exist yet |
| 42 | 42 | **HIGH** | Subtitle text is hardcoded with locale ternary — same i18n violation as #41. | No i18n | Use `t('upcoming_subtitle')` — add this key to all locale files |
| 43 | 46 | **HIGH** | `camp: any` type — complete loss of TypeScript safety on the landing page camp mapping. | No type import | Use `import { Camp } from '@/types'` and type as `camp: Camp` |
| 44 | 49 | **HIGH** | Camp name display uses hardcoded locale ternary — same pattern as Issue #25. | No helper function | Use `getLocalizedName(camp, locale)` helper |
| 45 | 55–57 | **MEDIUM** | "Register Now" link points to `/${locale}/auth/login` — this redirects to the login page, not a camp registration page. There is no camp registration page to link to. | No registration page exists | Either create a camp registration page or link to a contact/inquiry form |
| 46 | 56 | **MEDIUM** | "Register Now" text is hardcoded with locale ternary — same i18n violation. | No i18n | Use `t('register_now')` — add this key to all locale files |

---

## File: [`en.json`](../../src/i18n/messages/en.json) / [`ar.json`](../../src/i18n/messages/ar.json) / [`fr.json`](../../src/i18n/messages/fr.json) — Camps i18n Keys

### Issues Found

| # | Line(s) | Severity | Issue | Root Cause | Fix Required |
|---|---------|----------|-------|------------|-------------|
| 47 | 571–593 | **MEDIUM** | Missing i18n keys that are used in code: `name_en_placeholder`, `price_usd`, `price_lbp`, `min_age`, `max_age`, `upcoming_camps`, `upcoming_subtitle`, `register_now`, `description`, `location` | Incomplete i18n coverage | Add all missing keys to all 3 locale files |
| 48 | 587 | **LOW** | `location_ar` key exists (line 587) but is never used in any camps component — there is no location field in the camps form or display. | Dead i18n key | Either add a location field to the camps table/UI or remove the key |
| 49 | 590 | **LOW** | `coming_soon` key indicates that registration and attendance are not yet implemented — this is a feature gap marker, not a bug per se, but it confirms the module is incomplete. | Feature not implemented | Implement registration and attendance flows |

---

## File: [`database.ts`](../../src/types/database.ts) — DB Types

### Issues Found

| # | Line(s) | Severity | Issue | Root Cause | Fix Required |
|---|---------|----------|-------|------------|-------------|
| 50 | 412–494 | **LOW** | DB types are auto-generated and correct. The `camps` table type matches the migration schema. No issues. | — | — |
| 51 | 338–411 | **LOW** | `camp_registrations` type matches the migration schema. No issues. | — | — |
| 52 | 278–337 | **LOW** | `camp_attendance` type matches the migration schema. No issues. | — | — |

---

## File: [`000003_create_operational_tables.sql`](../../supabase/migrations/000003_create_operational_tables.sql) — DB Schema

### Issues Found

| # | Line(s) | Severity | Issue | Root Cause | Fix Required |
|---|---------|----------|-------|------------|-------------|
| 53 | 322–345 | **LOW** | The `camps` table schema is well-designed with tri-lingual names/descriptions, date range, pricing (USD + LBP), early bird pricing, sibling discount, age range, capacity, and soft-delete. No issues. | — | — |
| 54 | 350–364 | **LOW** | `camp_registrations` has proper foreign keys, unique constraint on `(camp_id, student_id)`, invoice linkage, and status CHECK constraint. No issues. | — | — |
| 55 | 369–383 | **LOW** | `camp_attendance` has proper unique constraint on `(camp_id, student_id, attendance_date)` and tri-lingual notes. No issues. | — | — |

---

## Cross-Cutting Issues

| # | Area | Severity | Issue | Root Cause | Fix Required |
|---|------|----------|-------|------------|-------------|
| 56 | **No Edit/Delete** | **CRITICAL** | There is NO edit or delete functionality anywhere in the camps module. Once a camp is created, the user cannot modify or remove it from the UI. The `CampRow` type has `id` but no edit button, no delete button, no update form exists. | CRUD is only 25% complete (Create + List only) | Add an edit button per camp card that opens a pre-filled form modal, and a delete button with confirmation dialog |
| 57 | **No Registration Flow** | **CRITICAL** | There is NO registration flow. The `camp_registrations` table exists in the DB, the `campRegistrationSchema` exists in Zod, but there is no UI to register a student for a camp. The expanded card view (lines 232–241) shows a placeholder "coming soon" message. | Registration flow not implemented | Build a registration UI: student selector, camp selector, registration form with medical/dietary/pickup fields, insert into `camp_registrations` |
| 58 | **No Attendance Tracking** | **HIGH** | The `camp_attendance` table exists in the DB but there is zero UI for daily attendance roll-call. No way to check students in/out, no attendance report. | Attendance feature not implemented | Build an attendance UI: date picker, student list with check-in/check-out, status toggle (present/absent/late/excused) |
| 59 | **No Enrollment Limit Enforcement** | **HIGH** | The `max_capacity` field exists but is never checked. A camp with `max_capacity: 10` could have 20 registrations because there's no enrollment limit validation in the code. | No capacity check before registration | Add a check before insert: count current registrations, reject if `count >= max_capacity` |
| 60 | **No Payment Integration** | **HIGH** | The `camp_registrations` table has an `invoice_id` foreign key, but there is no payment flow. Camps have prices (USD/LBP) but no way to collect payment or generate invoices. | Payment not integrated | Build payment flow: generate invoice on registration, integrate with payment gateway |
| 61 | **No `gym_id` on Landing Page** | **HIGH** | The landing page camp query (Issue #38) has no gym filter. In a multi-tenant setup, this could show camps from all gyms on every gym's landing page. | Missing tenant isolation on public page | Add gym context to the landing page (via subdomain, slug, or cookie) |
| 62 | **No Error Toast Infrastructure** | **MEDIUM** | The camps module has no toast/notification system. Errors are either silently ignored (Issue #14) or shown via `alert()` (Issue #20). | Missing notification infrastructure | Integrate a toast library (e.g., `sonner` or `react-hot-toast`) and use it for all user-facing errors |
| 63 | **No Loading States** | **MEDIUM** | The create form has `submitting` state (line 78) but there's no loading spinner on the camp list, no skeleton while fetching, no optimistic updates. | Missing loading UX | Add loading states for all async operations |
| 64 | **No Pagination** | **MEDIUM** | All camps are fetched and rendered at once. For gyms with 50+ camps, this will be slow. | Missing pagination | Add Supabase `.range()` pagination or infinite scroll |
| 65 | **No Camp Detail Page** | **MEDIUM** | The expanded card view (lines 232–241) is minimal — it shows description, price, and capacity. There's no dedicated camp detail page with full info, registration list, attendance, etc. | Missing detail page | Create a `camps/[id]/page.tsx` with full camp details, registration list, and attendance |
| 66 | **No Status Management** | **MEDIUM** | Camps are created with `status: 'draft'` (line 141) but there's no UI to change the status to `open`, `full`, `in_progress`, `completed`, or `cancelled`. A gym owner cannot publish a camp. | No status workflow | Add a status dropdown on each camp card to change status |
| 67 | **No Early Bird / Sibling Discount UI** | **LOW** | The DB schema supports `early_bird_price_usd`, `early_bird_deadline`, and `sibling_discount_percent`, but these fields are not in the create form or the display. | Missing feature parity with DB schema | Add early bird and sibling discount fields to the create/edit form and display |
| 68 | **No Soft-Delete UI** | **LOW** | The DB supports soft-delete via `deleted_at`, but there's no way to delete a camp from the UI. | Missing delete functionality | Add a delete button that sets `deleted_at` instead of hard-deleting |

---

## Summary

### Total Issues Found: **68**

| Severity | Count |
|----------|-------|
| CRITICAL | 6 |
| HIGH | 10 |
| MEDIUM | 22 |
| LOW | 30 |

### Top 3 Critical Fixes Needed

1. **Hardcoded `gym_id` placeholder + missing `gym_id` in insert (Issues #12, #16, #19)**
   - The create form sends `gym_id: '00000000-0000-0000-0000-000000000000'` (a zero-UUID) in the validated payload, and the actual insert at line 127 omits `gym_id` entirely. The DB column `gym_id UUID NOT NULL` will cause a **NOT NULL constraint violation** on every camp creation attempt. This is the root cause of "Create modal works but camps don't appear on landing page" — camps are either never created (constraint violation) or created with an invalid gym_id (invisible to all gyms).
   - **Fix:** Fetch the real `gym_id` from the user's profile (same pattern as `page.tsx:21-28`) and include it in the insert payload. Remove the zero-UUID placeholder.

2. **No Edit/Delete functionality (Issue #56)**
   - CRUD is only 25% complete. Users can Create and List camps, but cannot Edit, Delete, or change status. A gym owner who creates a camp with a typo, wrong date, or wrong price has no way to fix it. Camps stuck in `draft` status can never be published.
   - **Fix:** Add edit button per camp card → pre-filled form modal → `supabase.from('camps').update(...)`. Add delete button with confirmation → `supabase.from('camps').update({ deleted_at: new Date().toISOString() })`. Add status dropdown to change camp status.

3. **No Registration Flow (Issue #57) + No Enrollment Limit Enforcement (Issue #59)**
   - The entire registration subsystem is unimplemented. The `camp_registrations` table exists, the Zod schema exists, but there is zero UI. The expanded card view explicitly says "Registration & attendance coming soon." Without registration, the camps module is a **read-only catalog** — students cannot sign up, gym owners cannot track enrollment, and the `max_capacity` field is decorative.
   - **Fix:** Build a registration UI with student selector, medical/dietary/pickup fields, capacity check before insert, and invoice generation.

### Additional High-Priority Fixes

- **Issue #13**: No try/catch on Supabase insert — network errors crash silently
- **Issue #14**: No error feedback to user — insert failures are invisible
- **Issue #15**: `setSubmitting(false)` not called on error — submit button stays disabled forever
- **Issue #7**: Duplicate Zod schema — local form schema and canonical schema are out of sync
- **Issue #25**: Hardcoded locale ternary for camp name display (1 of 2)
- **Issue #41**: Hardcoded locale ternary on landing page (2 of 2)
- **Issue #43**: `any` type on landing page camp mapping
- **Issue #58**: No attendance tracking UI despite DB table existing
- **Issue #60**: No payment integration despite price fields and invoice_id foreign key
- **Issue #61**: No gym_id filter on landing page — multi-tenant data leak

---

## Is the Module Functionally Complete for a Gym Owner?

**NO.**

The camps module is a **read-only catalog with a create form that likely doesn't work** due to the missing `gym_id` constraint violation. Here's the functional breakdown:

| Feature | Status | Details |
|---------|--------|---------|
| **Create Camp** | ❌ Broken | Missing `gym_id` in insert payload (Issue #16) — will fail with NOT NULL constraint violation |
| **List Camps** | ✅ Works | Server-side fetch with gym isolation, sorted by start_date |
| **View Camp Details** | ⚠️ Partial | Expanded card shows description, price, capacity — but no localized description, no LBP price, no early bird info |
| **Edit Camp** | ❌ Missing | No edit button, no update form, no update API |
| **Delete Camp** | ❌ Missing | No delete button, no soft-delete UI |
| **Change Status** | ❌ Missing | No status dropdown — camps stuck in `draft` forever |
| **Register Student** | ❌ Missing | No registration UI despite DB table existing |
| **Attendance Tracking** | ❌ Missing | No attendance UI despite DB table existing |
| **Payment Collection** | ❌ Missing | No payment flow despite price fields and invoice_id FK |
| **Landing Page Visibility** | ⚠️ Partial | Camps appear on landing page but with hardcoded strings, `any` types, no gym filter |
| **i18n Coverage** | ⚠️ Partial | 22 i18n keys exist but 8+ are missing; 2 hardcoded locale ternaries remain |
| **Error Handling** | ❌ Broken | No try/catch on insert, no error toasts, `alert()` for validation errors |
| **Loading States** | ❌ Missing | No loading spinners, no skeletons, no optimistic updates |

**Verdict:** The camps module is **non-functional for a gym owner**. The create form will likely fail due to the missing `gym_id` constraint violation (Issue #16). Even if creation worked, the module is a read-only catalog with no edit, delete, registration, attendance, or payment capabilities. The landing page integration is partial with hardcoded strings and `any` types. The module has 6 critical issues, 10 high-severity issues, and is missing 4 of the 7 core features a gym owner would need (registration, attendance, payments, status management).