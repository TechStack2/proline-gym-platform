# Code Reviewer — Cycle 3 Post-Mortem

**Date:** 2026-06-08T14:22+03:00 (Beirut)
**Reviewer:** Roo Debug Agent
**Scope:** PRO LINE Gym Platform — Post-Cycle 3 Code Review

| Area | Max | Score | Notes |
|------|:--:|:--:|-------|
| TypeScript | 10 | **10** | `tsc --noEmit` passes with zero errors |
| i18n Compliance | 20 | **5** | 3 violations: hardcoded placeholders in [`pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx:361) (`"Name (EN)"`, `"Name (FR)"`), hardcoded role label in [`coach/profile/page.tsx`](../../src/app/%5Blocale%5D/coach/profile/page.tsx:97) (`'مدرب' / 'Entraîneur' / 'Coach'`), `alert()` instead of toast in [`rentals-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/rentals/rentals-client.tsx:124) |
| File Structure | 10 | **10** | Barrels: `src/lib/validators/index.ts` ✓, Helpers: `src/lib/i18n/helpers.ts` ✓ |
| Zero UUID/Gym ID | 15 | **10** | 2 zero UUIDs in [`rentals-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/rentals/rentals-client.tsx:115) — `external_coach_id` placeholder |
| Coach Portal | 15 | **15** | All 3 pages functional with real Supabase queries, i18n, auth guards, error handling |
| Migration Quality | 15 | **15** | `000012` (PT assignments) well-formed with RLS, triggers, functions. `000013` (rental_bookings RLS fix) clean |
| Error Handling | 15 | **10** | `rentals-client.tsx` uses `alert()` instead of `sonner` toast on lines 124, 136 |
| **TOTAL** | **100** | **75** | |

---

## Detailed Findings

### 1. TypeScript — 10/10 ✅

`npx tsc --noEmit` completes with zero errors. No type issues detected.

### 2. i18n Compliance — 5/20 ❌

**Phase C Modules (belts, camps, pt, rentals, leads):**

| Module | `locale === 'ar'` hits | Assessment |
|--------|:----------------------:|------------|
| `belts/` | 3 | `isRTL` (acceptable) + `lbl.ar` (localized label lookup, acceptable) |
| `camps/` | 2 | `isRTL` only. Uses `useTranslations('camps')` + `getLocalizedName()` ✓ |
| `pt/` | 1 | `isRTL` only. Uses `useTranslations('pt')` + `getLocalizedName()` ✓ |
| `rentals/` | 2 | `isRTL` + `font-arabic` only ✓ |
| `leads/` | 1 | `isRTL` only ✓ |

**Violations:**

1. **Hardcoded placeholders in [`pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx:361):**
   - Line 361: `placeholder="Name (EN)"` — should use `t('name_en_placeholder')`
   - Line 369: `placeholder="Name (FR)"` — should use `t('name_fr_placeholder')`
   - These are display strings visible to users, not internal labels.

2. **Hardcoded role label in [`coach/profile/page.tsx`](../../src/app/%5Blocale%5D/coach/profile/page.tsx:97):**
   - Line 97: `{isRTL ? 'مدرب' : locale === 'fr' ? 'Entraîneur' : 'Coach'}`
   - This is a display string that should use `useTranslations()` or the dynamic i18n import pattern.

3. **`alert()` in [`rentals-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/rentals/rentals-client.tsx:124):**
   - Lines 124, 136: `alert(firstIssue?.message || 'Validation error')` — should use `toast.error()`
   - This is both an i18n and UX regression (browser alert vs sonner toast).

### 3. File Structure & Naming — 10/10 ✅

- `src/lib/validators/index.ts` — exists, barrel export ✓
- `src/lib/i18n/helpers.ts` — exists, provides `getLocalizedName()` ✓

### 4. Zero UUID / Gym ID Integrity — 10/15 ⚠️

**Violations in [`rentals-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/rentals/rentals-client.tsx:115):**

```typescript
external_coach_id: '00000000-0000-0000-0000-000000000000', // placeholder — would come from external_coaches lookup
```

- Line 115: Used in canonical payload for schema validation
- Line 143: Used in actual Supabase insert

The comment acknowledges this is a placeholder, but zero UUIDs in production data paths are a data integrity risk. The `external_coaches` lookup should be implemented or the field should be made nullable.

**Cross-reference with DB:** `camps-client.tsx` and `pt-client.tsx` use real `gymId` from props (passed from server component) — no zero UUID issues in those files.

### 5. Coach Portal Quality — 15/15 ✅

| Page | Lines | Supabase Queries | i18n | Auth Guard | Error Handling | Status |
|------|:-----:|:----------------:|:----:|:----------:|:--------------:|:------:|
| [`attendance/page.tsx`](../../src/app/%5Blocale%5D/coach/attendance/page.tsx) | 440 | Real queries (class_schedules, class_enrollments, attendance_records) | Dynamic JSON import + `msg()` helper | `auth.getUser()` → coach lookup | try/catch + sonner toast | **Functional** |
| [`students/page.tsx`](../../src/app/%5Blocale%5D/coach/students/page.tsx) | 366 | Real queries (coaches, classes, class_enrollments, belt_promotions, attendance_records) | Dynamic JSON import + `msg()` helper | `auth.getUser()` → coach lookup | try/catch + console.error | **Functional** |
| [`profile/page.tsx`](../../src/app/%5Blocale%5D/coach/profile/page.tsx) | 273 | Real queries (coaches + profiles join, user_roles, classes count, enrollments count) | Locale-aware field accessors | `auth.getUser()` guard | N/A (server component) | **Functional** |

All 3 pages are substantive implementations with real data fetching, not stubs.

### 6. Migration Quality — 15/15 ✅

**`000012_create_pt_assignments.sql`:**
- Proper FK references with `ON DELETE CASCADE`/`RESTRICT`
- CHECK constraints on `sessions_total > 0`, `sessions_used >= 0`, `sessions_used <= sessions_total`
- Generated column `sessions_remaining` for computed values
- Indexes on `student_id`, `package_id`, `coach_id`
- `update_timestamp()` trigger
- Helper functions: `increment_sessions_used()`, `get_active_assignment()`
- RLS policies with gym scoping via `pt_packages.gym_id` join
- Audit trigger
- **Well-formed ✓**

**`000013_fix_rental_bookings_rls.sql`:**
- Drops old un-scoped policy
- Re-creates with gym scoping via `rentals.gym_id` FK chain
- Follows established pattern from `000011`
- **Well-formed ✓**

### 7. Error Handling — 10/15 ⚠️

**Spot-check results:**

| File | Supabase Ops | try/catch | Toast | Status |
|------|:------------:|:---------:|:-----:|:------:|
| [`camps-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/camps/camps-client.tsx) | 4 (create, edit, delete, status) | ✅ All | ✅ `sonner` | ✅ |
| [`pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx) | 5 (create, edit, delete, toggle, assign) | ✅ All | ✅ `sonner` | ✅ |
| [`rentals-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/rentals/rentals-client.tsx) | 1 (booking insert) | ❌ No try/catch | ❌ `alert()` used | ❌ |
| [`coach/attendance/page.tsx`](../../src/app/%5Blocale%5D/coach/attendance/page.tsx) | Multiple | ✅ | ✅ `sonner` | ✅ |
| [`coach/students/page.tsx`](../../src/app/%5Blocale%5D/coach/students/page.tsx) | Multiple | ✅ | N/A (data load) | ✅ |

**Violation:** [`rentals-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/rentals/rentals-client.tsx:124) uses `alert()` for validation errors instead of `sonner` toast, and the booking insert (lines 140-153) lacks try/catch error handling entirely.

---

## Blocking Issues

1. **i18n hardcoded strings in pt-client.tsx** — `"Name (EN)"` and `"Name (FR)"` placeholders are user-visible display strings not using translation keys.
2. **i18n hardcoded string in coach/profile/page.tsx** — Role label uses locale ternary instead of translation system.
3. **`alert()` in rentals-client.tsx** — Browser alert dialog instead of sonner toast, breaking the UX pattern used everywhere else.
4. **Zero UUID in rentals-client.tsx** — Placeholder UUID used in production data path; risk of data integrity issues.

## Regressions from Cycle 2

- **No regressions detected.** The items that scored in Cycle 2 (TypeScript, file structure, migrations) remain clean. The issues found in Cycle 3 are new violations introduced during Cycle 3 work (rentals-client.tsx alert/zero UUID, pt-client.tsx hardcoded placeholders, coach profile hardcoded label).

## Recommendations

1. Replace hardcoded `"Name (EN)"` / `"Name (FR)"` placeholders in [`pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx:361) with `t()` translation keys.
2. Replace locale ternary in [`coach/profile/page.tsx`](../../src/app/%5Blocale%5D/coach/profile/page.tsx:97) with translation helper or `useTranslations()`.
3. Replace `alert()` calls in [`rentals-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/rentals/rentals-client.tsx:124) with `toast.error()` and add try/catch around the booking insert.
4. Implement `external_coaches` lookup or make `external_coach_id` nullable in [`rentals-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/rentals/rentals-client.tsx:115) to eliminate zero UUID placeholder.
