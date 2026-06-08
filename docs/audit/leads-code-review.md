# Leads Module — Deep Code Review

**Audit Date:** June 7, 2026  
**Files Audited:**
- [`leads/page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/page.tsx) (78 lines)
- [`leads/leads-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/leads-client.tsx) (184 lines)
- [`en.json`](../../src/i18n/messages/en.json) (leads namespace: lines 516–527)
- [`ar.json`](../../src/i18n/messages/ar.json) (leads namespace: lines 516–527)
- [`fr.json`](../../src/i18n/messages/fr.json) (leads namespace: lines 516–527)
- [`PHASE_C_TEST_REGISTER.md`](../../docs/testing/PHASE_C_TEST_REGISTER.md) (leads section: lines 32–38)
- [`dispatch-spec.json`](../../../Shared/missions/phase-c-refinements/dispatch-spec.json) (c2-lead-pipeline agent: lines 27–39)
- [`schema.ts`](../../src/lib/db/schema.ts) (`OfflineLead` interface: lines 312–328)
- [`000001_create_enums.sql`](../../supabase/migrations/000001_create_enums.sql) (`lead_status_enum`: lines 79–81)
- [`000003_create_operational_tables.sql`](../../supabase/migrations/000003_create_operational_tables.sql) (`leads` table: lines 388–405)

---

## File: leads/page.tsx (78 lines)

### Issues Found

| # | Line(s) | Severity | Issue | Root Cause | Fix Required |
|---|---------|----------|-------|------------|-------------|
| 1 | 22 | **HIGH** | `SOURCE_ICONS` typed as `Record<string, any>` — leaks `any` type, losing all type safety | No proper TypeScript interface for lead source mapping | Replace `any` with `Record<string, string>` or a union type `Record<LeadSource, string>` |
| 2 | 28–31 | **HIGH** | Leads fetched with `select('*')` — fetches all columns including unnecessary ones (e.g., `source_detail`, `assigned_to`, `converted_student_id` for the list view) | No column projection; lazy `select('*')` pattern | Use `select('id, first_name, last_name, phone, email, source, status, interested_discipline_id, notes, created_at, converted_at')` |
| 3 | 28–31 | **MEDIUM** | No `.eq('gym_id', ...)` filter — fetches leads across ALL gyms, violating multi-tenant isolation | Missing gym context from auth/session | Add `.eq('gym_id', user.gym_id)` or use RLS with current gym context |
| 4 | 35–41 | **CRITICAL** | Stats computed **client-side** via `.filter()` on the full fetched array instead of server-side `SELECT COUNT(*) ... GROUP BY status` | The C2-7 fix was supposed to "wire counts to real DB queries" but was never implemented — counts are still client-side | Replace with a single Supabase query: `supabase.from('leads').select('status', { count: 'exact', head: true }).eq('gym_id', ...)` or use `.select('status')` and count server-side |
| 5 | 35–41 | **MEDIUM** | `trial_completed` and `lost` statuses are missing from the stats bar — only 5 stat boxes shown but there are 6 statuses in the enum | Stats bar only shows `all, new, contacted, trial_scheduled, converted` — omits `trial_completed` and `lost` | Add stat boxes for `trial_completed` and `lost` statuses, or make the stats bar dynamic from the enum |
| 6 | 47–52 | **CRITICAL** | Hardcoded Arabic/French strings instead of `useTranslations()` — `locale === 'ar' ? 'خط أنابيب العملاء' : 'Lead Pipeline'` and subtitle | The C.2 fix agent was instructed to use `useTranslations()` but the server component uses `getTranslations()` incorrectly — it calls `getTranslations` but never uses the `t` function | Import `getTranslations`, call `const t = await getTranslations('leads')`, and use `t('title')`, `t('subtitle')` |
| 7 | 47 | **MEDIUM** | `locale === 'ar' && 'font-arabic'` class — only handles Arabic RTL, ignores French (which is LTR like English but has its own locale) | RTL check should be based on direction, not locale | Use `isRTL` helper or check `locale === 'ar'` for direction class only |
| 8 | 57–70 | **MEDIUM** | Stat labels are hardcoded with `locale === 'ar' ? ...` ternary — same i18n violation as the title | No `useTranslations()` usage | Use `t('new_leads')`, `t('contacted')`, `t('scheduled')`, `t('converted')` from the `leads` namespace |
| 9 | 59 | **LOW** | `counts.all` label is hardcoded as `'All'` / `'الكل'` — the `leads` i18n namespace has no "all" key; should use `common.all` | Missing i18n key usage | Use `t('all')` from `common` namespace or add `all` to `leads` namespace |
| 10 | 65 | **LOW** | Inline `bg-opacity-20` Tailwind class — this is a v1/v2 Tailwind class that may not work in Tailwind v3+ (opacity modifiers changed) | Legacy Tailwind pattern | Use `bg-opacity-20` → `/[0.2]` syntax or use CSS variable-based opacity |
| 11 | 74 | **MEDIUM** | `LeadsClient` receives `leads` and `disciplines` as props typed `any[]` — no type safety across the server/client boundary | No shared TypeScript interface for Lead/Discipline | Define and export `Lead` and `Discipline` interfaces, use them in both components |

---

## File: leads/leads-client.tsx (184 lines)

### Issues Found

| # | Line(s) | Severity | Issue | Root Cause | Fix Required |
|---|---------|----------|-------|------------|-------------|
| 12 | 12–13 | **CRITICAL** | `leads: any[]` and `disciplines: any[]` — complete loss of TypeScript type safety across the entire client component | No TypeScript interfaces defined for Lead or Discipline | Define `interface Lead { id: string; first_name?: string; last_name?: string; phone?: string; email?: string; source: string; status: string; interested_discipline_id?: string; notes?: string; converted_at?: string; created_at: string; }` and use it |
| 13 | 20 | **MEDIUM** | `useState(initialLeads)` — stores the full leads array in state, duplicating server data in client memory. On re-renders, the entire array is held in state | Unnecessary state duplication; leads are already fetched server-side | Consider using `useMemo` for filtered results instead of `useState` for the full list, or use a lightweight state management pattern |
| 14 | 21 | **MEDIUM** | No debouncing on the search input — every keystroke triggers a re-render and filter of the entire leads array | Missing `useDebounce` hook | Add `useDebounce(search, 300)` to debounce search input before filtering |
| 15 | 22 | **LOW** | `statusFilter` typed as `string` instead of a union of valid statuses | No union type for lead status | Type as `'' | 'new' | 'contacted' | 'trial_scheduled' | 'trial_completed' | 'converted' | 'lost'` |
| 16 | 27–35 | **CRITICAL** | **No try/catch around Supabase `.update()`** — if the update fails, the error is silently swallowed. The `if (!error)` check only handles Supabase errors, not network exceptions | Missing error boundary | Wrap in `try/catch`, show user-facing toast/notification on failure |
| 17 | 27–35 | **HIGH** | **No error feedback to user** — when `handleStatusChange` fails, there's no toast, no alert, no UI indication. The user thinks the status changed but it silently failed | Missing user notification system | Add a toast/snackbar notification on error (e.g., `toast.error('Failed to update status')`) |
| 18 | 27–35 | **HIGH** | **No optimistic UI** — the status change waits for the server response before updating local state. On slow connections, the UI feels unresponsive | Missing optimistic update pattern | Apply the status change optimistically to local state first, then revert on error |
| 19 | 31–33 | **HIGH** | `converted_at` update is a **separate** Supabase call after the status update — this is not atomic. If the second call fails, the lead has status `converted` but no `converted_at` timestamp | Missing transaction or single-update approach | Include `converted_at` in the first `.update()` call: `update({ status: newStatus, converted_at: new Date().toISOString() })` |
| 20 | 31–33 | **MEDIUM** | `converted_at` update ignores the error from the second call — `updateError` is declared but never checked | Missing error handling on second query | Check `updateError` and log/warn, or better, merge into single update |
| 21 | 37–45 | **MEDIUM** | **Client-side filtering** — all leads are fetched server-side, then filtered client-side. For large datasets (1000+ leads), this is slow and wasteful | No server-side search/filter | Move search/filter to server-side Supabase query with `.ilike()` and `.eq()` filters, passing params via URL search params |
| 22 | 39–42 | **LOW** | Search uses `.includes()` which is case-insensitive for name/email but **case-sensitive** for phone (no `.toLowerCase()` on phone comparison) | Inconsistent case handling | Add `.toLowerCase()` to phone comparison: `(l.phone || '').toLowerCase().includes(search.toLowerCase())` |
| 23 | 56 | **MEDIUM** | Search placeholder is hardcoded with `locale === 'ar' ? ...` ternary instead of `useTranslations()` | No `useTranslations()` hook called | Call `const t = useTranslations('leads')` and use `t('search_placeholder')` — but note: there is no `search_placeholder` key in the leads i18n namespace |
| 24 | 56 | **LOW** | Missing i18n key `leads.search_placeholder` — the placeholder text exists in code but has no corresponding key in en.json/ar.json/fr.json | Incomplete i18n coverage | Add `"search_placeholder": "Search by name, phone, or email..."` to all 3 locale files |
| 25 | 66 | **MEDIUM** | Status filter dropdown label hardcoded with `locale === 'ar' ? ...` ternary | No `useTranslations()` | Use `t('all_statuses')` or `common.all` — but no `all_statuses` key exists in leads namespace |
| 26 | 68 | **LOW** | Status options in filter dropdown display raw enum values (`new`, `contacted`, etc.) with underscores replaced by spaces — not translated | No i18n mapping for status labels | Use `t(status)` for each status, e.g., `t('new_leads')`, `t('contacted')` — these keys exist in the leads namespace |
| 27 | 84 | **LOW** | Lead name display `{lead.first_name} {lead.last_name}` — no null-safe fallback if both are empty | Missing fallback for empty name | Show `t('anonymous')` or `t('no_name')` if both first_name and last_name are empty |
| 28 | 87 | **LOW** | Source icon fallback `'📋'` — hardcoded emoji, not localized | Hardcoded fallback | Use a default icon component or a localized fallback string |
| 29 | 92–100 | **MEDIUM** | Status dropdown shows raw enum values (`new`, `contacted`, etc.) with underscores replaced by spaces — not translated via i18n | No i18n mapping | Use `t(s)` for each status option label |
| 30 | 118 | **MEDIUM** | Discipline name display uses `locale === 'ar' ? disc.name_ar : locale === 'fr' ? disc.name_fr : disc.name_en` — this is a pattern that should be a helper function | Repeated locale-switching pattern | Create a helper `getLocalizedName(discipline, locale)` or use a `name` computed property |
| 31 | 128–143 | **MEDIUM** | "Schedule Trial" and "Convert" button labels hardcoded with `locale === 'ar' ? ...` ternary | No `useTranslations()` | Use `t('schedule_trial')` and `t('convert')` — but these keys don't exist in the leads namespace |
| 32 | 128–143 | **LOW** | Missing i18n keys `leads.schedule_trial` and `leads.convert` | Incomplete i18n coverage | Add `"schedule_trial": "Schedule Trial"` and `"convert": "Convert"` to all 3 locale files |
| 33 | 136 | **LOW** | "Convert" button hidden when status is `converted` or `lost` — but there's no check if the lead is already a student (no `converted_student_id` check) | Missing guard against double-conversion | Also check `!lead.converted_student_id` to prevent re-converting |
| 34 | 147–169 | **MEDIUM** | Trial scheduling form has **no validation** — empty date/time can be submitted, no Zod schema | No form validation | Add Zod schema for trial scheduling with required date/time fields |
| 35 | 153 | **LOW** | Date input has no `min` attribute — users can schedule trials in the past | Missing date constraint | Add `min={new Date().toISOString().split('T')[0]}` |
| 36 | 159–167 | **MEDIUM** | "Confirm Trial" button calls `handleStatusChange(lead.id, 'trial_scheduled')` but does NOT actually save the trial date/time to any `trial_classes` table | Missing trial class creation | Insert into `trial_classes` table with the selected date/time |
| 37 | 162 | **LOW** | `handleStatusChange` is called but the trial date/time inputs are not referenced — the date/time values are never captured | Unused form fields | Capture date/time values in state and pass to trial class creation |
| 38 | 176–181 | **LOW** | Empty state message hardcoded with `locale === 'ar' ? ...` ternary | No `useTranslations()` | Use `t('no_leads')` — this key exists in the leads namespace |
| 39 | 9 | **LOW** | `LEAD_STATUSES` constant duplicated in both `page.tsx` (line 13) and `leads-client.tsx` (line 9) — violates DRY principle | Duplicated constant | Define once in a shared constants file or derive from the DB enum |

---

## File: i18n — en.json / ar.json / fr.json (leads namespace)

### Issues Found

| # | Line(s) | Severity | Issue | Root Cause | Fix Required |
|---|---------|----------|-------|------------|-------------|
| 40 | 516–527 (en), 516–527 (ar), 516–527 (fr) | **MEDIUM** | Missing i18n keys that are used in code: `search_placeholder`, `schedule_trial`, `convert`, `all_statuses`, `lost`, `trial_completed`, `trial_scheduled` | Incomplete i18n coverage | Add all missing keys to all 3 locale files |
| 41 | 516–527 | **LOW** | `leads.update` key exists (line 523) but is never used in either `page.tsx` or `leads-client.tsx` | Dead i18n key | Either use it or remove it |
| 42 | 516–527 | **LOW** | `leads.source` key exists (line 526) but is never used in the UI — source is displayed via `sourceIcons` map with raw enum values | Dead i18n key | Either use `t('source')` as a label or remove the key |

---

## File: schema.ts — OfflineLead Interface

### Issues Found

| # | Line(s) | Severity | Issue | Root Cause | Fix Required |
|---|---------|----------|-------|------------|-------------|
| 43 | 312–328 | **MEDIUM** | `OfflineLead` interface exists in schema.ts but is **never imported or used** in either `page.tsx` or `leads-client.tsx` — both files use `any[]` instead | Interface defined but not consumed | Import `OfflineLead` in both files and use as the type for leads arrays |
| 44 | 312–328 | **LOW** | `OfflineLead` is missing `created_at` field which is used in the code (`page.tsx` line 31: `.order('created_at', ...)`) | Incomplete interface | Add `created_at: string` to `OfflineLead` |

---

## Cross-Cutting Issues

| # | Area | Severity | Issue | Root Cause | Fix Required |
|---|------|----------|-------|------------|-------------|
| 45 | **No Zod Validation** | **CRITICAL** | There are zero Zod schemas anywhere in the leads module — no validation for status changes, trial scheduling, or lead creation | The entire project has no Zod dependency installed (confirmed: `find` for `z.object` returned empty) | Install `zod`, create schemas for `LeadStatusUpdate`, `TrialSchedule`, `LeadCreate` |
| 46 | **No Error Toast/Notification** | **HIGH** | Status changes fail silently — no toast, no alert, no error boundary | Missing notification infrastructure | Integrate a toast library (e.g., `sonner` or `react-hot-toast`) and show errors |
| 47 | **No RLS Error Handling** | **MEDIUM** | If Supabase RLS policies reject a query, the error is silently ignored (`if (!error)` pattern) | Missing RLS-aware error handling | Check for RLS errors specifically and show appropriate messages |
| 48 | **No Loading State** | **MEDIUM** | `LeadsClient` has no loading state — the initial leads are passed as props, but status changes have no spinner/disabled state | Missing loading UX | Add loading state during status updates (disable the dropdown, show spinner) |
| 49 | **No Pagination** | **MEDIUM** | All leads are fetched and rendered at once — no pagination or infinite scroll | Missing pagination | Add Supabase `.range()` pagination or infinite scroll |
| 50 | **No `gym_id` Filter** | **HIGH** | Neither `page.tsx` nor `leads-client.tsx` filters by `gym_id` — in a multi-gym setup, this leaks data across gyms | Missing tenant isolation | Add `gym_id` filter from auth context |

---

## Summary

- **Total issues found: 50**
- **CRITICAL: 5** | **HIGH: 8** | **MEDIUM: 20** | **LOW: 17**

### Top 3 Critical Fixes Needed

1. **Stats are client-side (Issue #4)** — The stats bar at the top of [`page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/page.tsx:35) computes counts via `.filter()` on the full fetched array instead of using server-side `SELECT COUNT(*) ... GROUP BY status`. This is the C2-7 fix that was never implemented. Replace with a single Supabase count query.

2. **No i18n usage anywhere (Issues #6, #8, #23, #25, #29, #31, #38)** — Both [`page.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/page.tsx:47) and [`leads-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/leads-client.tsx:56) use `locale === 'ar' ? 'Arabic string' : 'English string'` ternaries instead of `useTranslations()` / `getTranslations()`. The i18n `leads` namespace exists in all 3 locales but is completely unused. Every user-facing string must be migrated to `t('key')`.

3. **No error handling for status changes (Issues #16, #17, #18)** — [`handleStatusChange`](../../src/app/%5Blocale%5D/(dashboard)/leads/leads-client.tsx:27) has no `try/catch`, no user-facing error notification, and no optimistic UI. If the Supabase update fails (network error, RLS policy, constraint violation), the error is silently swallowed. The user thinks the status changed but it didn't. Add `try/catch`, a toast notification on failure, and optimistic updates with rollback.

### Additional High-Priority Fixes

- **Issue #1**: `any` types on `SOURCE_ICONS` and props — replace with proper interfaces
- **Issue #3**: Missing `gym_id` filter — multi-tenant data leak
- **Issue #19**: Non-atomic `converted_at` update — separate DB call risks inconsistent state
- **Issue #36**: Trial scheduling doesn't save to `trial_classes` table — data is lost
- **Issue #45**: No Zod validation anywhere — all form submissions are unvalidated
- **Issue #50**: No `gym_id` filter across both files — tenant isolation gap
