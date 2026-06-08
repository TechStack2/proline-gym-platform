# Quality Gate C3 — Database Review

**Reviewer:** Roo (Debug Mode)
**Date:** 2026-06-08T11:31 UTC (Beirut +03:00)
**Scope:** PRO LINE Gym Platform — Cycle 3 Post-Mortem

---

## Score Summary

| # | Category | Max | Score | Deductions |
|---|----------|:---:|:-----:|------------|
| 1 | Migration Structure | 15 | **15** | — |
| 2 | Multi-Tenant Isolation | 20 | **15** | -5: `pt_assignments` query unscoped |
| 3 | Schema Integrity | 20 | **15** | -5: `pt_assignments` missing from `database.ts` |
| 4 | Seed Data Coverage | 15 | **12** | -3: No `pt_assignments` seed data |
| 5 | Query Optimization | 15 | **10** | -5: `pt/page.tsx` sequential awaits |
| 6 | Migration 000012 Quality | 15 | **15** | — |
| | **Total** | **100** | **82** | **-18** |

---

## 1. Migration Structure — 15/15

All 13 migrations present and sequentially numbered:

| File | Status |
|------|--------|
| `000001_create_enums.sql` | ✅ |
| `000002_create_core_tables.sql` | ✅ |
| `000003_create_operational_tables.sql` | ✅ |
| `000004_create_rls_policies.sql` | ✅ |
| `000005_create_triggers.sql` | ✅ |
| `000006_seed_data.sql` | ✅ |
| `000007_fix_currency_preference.sql` | ✅ |
| `000008_demo_accounts.sql` | ✅ |
| `000009_public_lead_submissions.sql` | ✅ |
| `000010_add_belt_columns.sql` | ✅ |
| `000011_fix_rls_gym_scoping.sql` | ✅ |
| `000012_create_pt_assignments.sql` | ✅ |
| `000013_fix_rental_bookings_rls.sql` | ✅ |

**Verdict:** No gaps, no duplicates, clean sequential numbering.

---

## 2. Multi-Tenant Isolation — 15/20

### [`camps/page.tsx`](../../src/app/%5Blocale%5D/%28dashboard%29/camps/page.tsx:30)
```typescript
const { data: camps } = await supabase
  .from('camps')
  .select('*')
  .eq('gym_id', gymId)   // ✅ Scoped
```
**Pass.** Profile → gym_id → camps query.

### [`pt/page.tsx`](../../src/app/%5Blocale%5D/%28dashboard%29/pt/page.tsx:26)
- `pt_packages` query: `.eq('gym_id', gymId)` ✅
- `students` query: `.eq('gym_id', gymId)` ✅
- `coaches` query: `.eq('gym_id', gymId)` ✅
- **`pt_assignments` query (line 46-51):** ❌ **NO `gym_id` filter**

```typescript
const { data: assignments } = await supabase
  .from('pt_assignments')
  .select('*')
  .eq('is_active', true)
  .filter('package_id', 'in', `(${(packages || []).map(p => p.id).join(',')})`)
  .gt('sessions_remaining', 0);
```

This query fetches `pt_assignments` filtered only by `package_id` (from already-scoped packages) and `is_active`. While the `package_id` IN-filter indirectly limits results to packages the user already has access to, there is **no explicit gym_id verification** on the `pt_assignments` table itself. If a package ID from another gym somehow leaked into the list, assignments would cross gym boundaries.

**Recommendation:** Add a subquery filter:
```typescript
.filter('package_id', 'in', `(${(packages || []).map(p => p.id).join(',')})`)
// Already implicitly scoped by packages being gym-scoped above, but add explicit:
// Or use RLS which handles this via pt_assignments_staff policy
```

### [`coach/students/page.tsx`](../../src/app/%5Blocale%5D/coach/students/page.tsx:63)
Scoped by coach identity chain: `auth.uid()` → `coaches.profile_id` → `classes.coach_id` → `class_enrollments`. No direct `gym_id` query but correctly scoped by coach association. ✅

### [`coach/attendance/page.tsx`](../../src/app/%5Blocale%5D/coach/attendance/page.tsx:74)
Same pattern — scoped by coach identity chain. ✅

---

## 3. Schema Integrity — 15/20

### Camps: [`camps.schema.ts`](../../src/lib/validators/camps.schema.ts) vs [`database.ts`](../../src/types/database.ts:412)

| DB Column | Zod campInsertSchema | Match |
|-----------|---------------------|:-----:|
| `name_ar` | `name_ar` | ✅ |
| `name_en` | `name_en` | ✅ |
| `name_fr` | `name_fr` | ✅ |
| `description_ar` | `description_ar` | ✅ |
| `description_en` | `description_en` | ✅ |
| `description_fr` | `description_fr` | ✅ |
| `start_date` | `start_date` | ✅ |
| `end_date` | `end_date` | ✅ |
| `max_capacity` | `max_capacity` | ✅ |
| `price_usd` | `price_usd` | ✅ |
| `price_lbp` | `price_lbp` | ✅ |
| `gym_id` | `gym_id` | ✅ |
| `min_age` | `min_age` | ✅ |
| `max_age` | `max_age` | ✅ |
| `early_bird_price_usd` | `early_bird_price_usd` | ✅ |
| `early_bird_deadline` | `early_bird_deadline` | ✅ |
| `sibling_discount_percent` | `sibling_discount_percent` | ✅ |
| `status` | — (DB default) | ✅ (auto) |
| `created_at` | — (DB default) | ✅ (auto) |
| `updated_at` | — (DB default) | ✅ (auto) |
| `deleted_at` | — | ✅ (soft delete, not in insert) |
| `id` | — (DB default) | ✅ (auto) |

**Verdict:** Perfect match for insert schema. ✅

### PT Packages: [`pt.schema.ts`](../../src/lib/validators/pt.schema.ts) vs [`database.ts`](../../src/types/database.ts:1668)

| DB Column | Zod ptPackageInsertSchema | Match |
|-----------|--------------------------|:-----:|
| `name_ar` | `name_ar` | ✅ |
| `name_en` | `name_en` | ✅ |
| `name_fr` | `name_fr` | ✅ |
| `description_ar` | `description_ar` | ✅ |
| `description_en` | `description_en` | ✅ |
| `description_fr` | `description_fr` | ✅ |
| `session_count` | `session_count` | ✅ |
| `price_usd` | `price_usd` | ✅ |
| `price_lbp` | `price_lbp` | ✅ |
| `gym_id` | `gym_id` | ✅ |
| `coach_id` | `coach_id` | ✅ |
| `validity_days` | `validity_days` | ✅ |
| `is_active` | — (DB default) | ✅ (auto) |
| `deleted_at` | — | ✅ (soft delete) |
| `created_at` | — (DB default) | ✅ (auto) |
| `updated_at` | — (DB default) | ✅ (auto) |
| `id` | — (DB default) | ✅ (auto) |

**Verdict:** Perfect match for insert schema. ✅

### PT Assignments: [`pt.schema.ts`](../../src/lib/validators/pt.schema.ts:46) vs Migration 000012

| DB Column | Zod ptAssignmentInsertSchema | Match |
|-----------|-----------------------------|:-----:|
| `student_id` | `student_id` | ✅ |
| `package_id` | `package_id` | ✅ |
| `coach_id` | `coach_id` | ✅ |
| `sessions_total` | `sessions_total` | ✅ |
| `sessions_used` | `sessions_used` | ✅ |
| `sessions_remaining` | — (GENERATED) | ✅ (auto) |
| `purchased_at` | `purchased_at` | ✅ |
| `expires_at` | `expires_at` | ✅ |
| `is_active` | `is_active` | ✅ |
| `created_at` | — (DB default) | ✅ (auto) |
| `updated_at` | — (DB default) | ✅ (auto) |
| `id` | — (DB default) | ✅ (auto) |

**Verdict:** Zod schema matches migration columns. ✅

### ❌ Critical Finding: `pt_assignments` missing from `database.ts`

The `pt_assignments` table was created in migration `000012` but is **not present** in [`src/types/database.ts`](../../src/types/database.ts). The Supabase type definitions have not been regenerated after the migration was applied. This means:

- TypeScript code referencing `Database['public']['Tables']['pt_assignments']` will fail
- No type-safe access to the new table from the client
- The Zod schema exists but the generated types are out of sync

**Recommendation:** Run `supabase gen types typescript --linked > src/types/database.ts` to regenerate.

---

## 4. Seed Data Coverage — 12/15

| Table | Seeded? | Notes |
|-------|:-------:|-------|
| `gyms` | ✅ | PRO LINE Gym, Baabda |
| `disciplines` | ✅ | 6 disciplines (Muay Thai, Boxing, Fitness, Zumba, Ladies, Kids) |
| `belt_hierarchies` | ✅ | 20 Muay Thai ranks + 20 Boxing ranks = 40 total |
| `membership_plans` | ✅ | 3 tiers (Monthly $50, Quarterly $130, Annual $450) |
| `pt_packages` | ✅ | 3 packs (5/10/20 sessions) |
| `rentals` | ✅ | 3 facility spaces |
| `coaches` | ✅ | 2 coaches (John Smith MT, Sarah Johnson Boxing) |
| `classes` | ✅ | 3 demo classes (MT Beginner, Boxing Beginner, Boxing Intermediate) |
| `class_schedules` | ✅ | Weekly recurring schedules |
| `students` | ✅ | 4 demo students with belt ranks |
| `student_memberships` | ✅ | 2 active memberships |
| `profiles` | ✅ | Demo profiles linked to auth users |
| `pt_assignments` | ❌ | **No seed data** — new table from 000012 |
| `camp_registrations` | ❌ | No seed data (lower priority) |

**Belt ranks:** All 20 Muay Thai ranks (white through black_5) ✅ and all 20 Boxing ranks ✅.

**Deduction:** -3 for missing `pt_assignments` seed data (new table in Cycle 3 should have demo data).

---

## 5. Query Optimization — 10/15

### [`belts/page.tsx`](../../src/app/%5Blocale%5D/%28dashboard%29/belts/page.tsx:28)
```typescript
// Phase 1 — Parallel ✅
const [students, disciplines, coaches] = await Promise.all([...]);
// Phase 2 — Parallel ✅
const [beltHierarchies, promotions] = await Promise.all([...]);
```
**Pass.** Fully parallelized with `Promise.all` in two phases. ✅

### [`pt/page.tsx`](../../src/app/%5Blocale%5D/%28dashboard%29/pt/page.tsx:26)
```typescript
const { data: packages } = await supabase.from('pt_packages')...  // await 1
const { data: students } = await supabase.from('students')...      // await 2
const { data: coaches } = await supabase.from('coaches')...        // await 3
const { data: assignments } = await supabase.from('pt_assignments')... // await 4
```
**Sequential awaits** — each query waits for the previous to complete. The `assignments` query also depends on `packages` for the `package_id` IN-filter, so it must be after packages. But `students` and `coaches` are independent of `packages` and could run in parallel. ❌

**Recommendation:**
```typescript
const [{ data: packages }, { data: students }, { data: coaches }] = await Promise.all([
  supabase.from('pt_packages').select('*').eq('gym_id', gymId).order('session_count'),
  supabase.from('students').select('...').eq('is_active', true).eq('gym_id', gymId),
  supabase.from('coaches').select('...').eq('gym_id', gymId).eq('is_active', true),
]);
// Then fetch assignments (depends on packages)
const { data: assignments } = await supabase.from('pt_assignments')...
```

### [`camps/page.tsx`](../../src/app/%5Blocale%5D/%28dashboard%29/camps/page.tsx:17)
Only 2 sequential queries (profile → camps). Trivial — acceptable. ✅

---

## 6. Migration 000012 Quality — 15/15

Review of [`000012_create_pt_assignments.sql`](../../supabase/migrations/000012_create_pt_assignments.sql):

| Aspect | Assessment |
|--------|------------|
| **CREATE TABLE** | Well-formed with all required columns |
| **Primary Key** | `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` ✅ |
| **Foreign Keys** | `student_id → students`, `package_id → pt_packages`, `coach_id → coaches` ✅ |
| **Constraints** | `CHECK (sessions_total > 0)`, `CHECK (sessions_used >= 0)`, `CHECK (sessions_used <= sessions_total)` ✅ |
| **Generated Column** | `sessions_remaining GENERATED ALWAYS AS (sessions_total - sessions_used) STORED` ✅ |
| **Indexes** | 3 indexes: `idx_pt_assignments_student` (partial, `WHERE is_active = true`), `idx_pt_assignments_package`, `idx_pt_assignments_coach` ✅ |
| **Triggers** | `trg_update_timestamp` (auto-update `updated_at`) ✅ |
| **Helper Functions** | `increment_sessions_used()` — SECURITY DEFINER, prevents over-usage ✅ |
| | `get_active_assignment()` — STABLE, returns active assignment ✅ |
| **RLS Policies** | `pt_assignments_staff` — gym-scoped via `pt_packages.gym_id` FK chain ✅ |
| | `pt_assignments_coach` — coach sees own assignments ✅ |
| | `pt_assignments_student` — student sees own assignments ✅ |
| **Audit Trigger** | `trg_audit_pt_assignments` — hooks into existing audit system ✅ |

**Verdict:** Well-formed migration with proper constraints, indexes, RLS policies, helper functions, and audit trail. No issues found.

---

## Issues Requiring Action

| # | Severity | Category | Issue | File |
|---|----------|----------|-------|------|
| 1 | **MEDIUM** | Multi-Tenant | `pt_assignments` query lacks explicit gym scoping | [`pt/page.tsx:46`](../../src/app/%5Blocale%5D/%28dashboard%29/pt/page.tsx:46) |
| 2 | **MEDIUM** | Schema Integrity | `pt_assignments` missing from `database.ts` — types out of sync | [`database.ts`](../../src/types/database.ts) |
| 3 | **LOW** | Seed Data | No `pt_assignments` seed data for demo/testing | [`000006_seed_data.sql`](../../supabase/migrations/000006_seed_data.sql) |
| 4 | **LOW** | Performance | `pt/page.tsx` uses sequential awaits instead of `Promise.all` | [`pt/page.tsx:26`](../../src/app/%5Blocale%5D/%28dashboard%29/pt/page.tsx:26) |

---

## Final Score: **82/100**

**Previous Cycle 2 score:** ~85/100
**Change:** -3 points (regression in schema integrity due to unregenerated types; slight improvement in migration quality offset by new issues)
