# Phase C — Test Register

> **Date:** June 7, 2026  
> **Status:** Phase C.1 complete (5 modules). Phase C.2 refinements logged below.

## Blockers Fixed (June 7)

| # | Module | Issue | Root Cause | Fix |
|---|---|---|---|---|
| B1 | All | `landing` namespace missing | en/ar/fr.json had zero `landing` keys | Added `landing.nav.*` + `landing.footer.*` to all 3 locales |
| B2 | All | Demo accounts didn't exist | Migration 000008 was comments-only | Rewrote with `extensions.crypt()` bcrypt inserts, pushed to Supabase |
| B3 | Belts | `MISSING_MESSAGE: belts` | No `belts` namespace in i18n JSONs | Added `belts.*` keys to en/ar/fr.json |
| B4 | Leads | `MISSING_MESSAGE: leads` | No `leads` namespace in i18n JSONs | Added `leads.*` keys to en/ar/fr.json |
| B5 | Camps | `MISSING_MESSAGE: camps` | No `camps` namespace in i18n JSONs | Added `camps.*` keys to en/ar/fr.json |
| B6 | PT | `MISSING_MESSAGE: pt` | No `pt` namespace in i18n JSONs | Added `pt.*` keys to en/ar/fr.json |
| B7 | Rentals | `MISSING_MESSAGE: rentals` | No `rentals` namespace in i18n JSONs | Added `rentals.*` keys to en/ar/fr.json |
| B8 | Belts | Hydration error | `<Badge>` (div) inside `<SelectContent>` (maps to `<select>`) — invalid HTML | Replaced with inline `<span>` with inline CSS classes inside `SelectItem` |
| B9 | Belts | Dropdowns empty | Server query referenced non-existent `user` relation — DB uses `profile_id` → `profiles` | Fixed query to use `profile:profiles(...)` with proper column names |
| B10 | Leads, Camps, PT, Rentals | JSON parse crash | ar.json + fr.json had invalid JSON (`}` afterwards `}`) from `cat >>` append | Fixed with node.js regex replacement |

## Phase C.2 — Refinement Register (To Address Before Production)

### Belt Engine

| # | Feedback | Severity | Suggested Fix |
|---|---|---|---|
| C2-1 | No navigation — feels like an island | MEDIUM | Add breadcrumb nav + "Back to Student" link |
| C2-2 | No clear workflow | MEDIUM | Add stepper: Select Student → Select Discipline → Select Belt → Submit. Visual progress indicator. |
| C2-3 | Empty students list (no seed data) | HIGH | Add seed data: 3-4 demo students with profiles in migration |
| C2-4 | Promotion doesn't auto-refresh | MEDIUM | Add `router.refresh()` or optimistic UI after promotion |

### Lead Pipeline

| # | Feedback | Severity | Suggested Fix |
|---|---|---|---|
| C2-5 | Wireframe feel, no workflow | HIGH | Add status-change dropdown per lead. Add "Schedule Trial" modal. Add "Convert to Student" button. |
| C2-6 | No filter/search | MEDIUM | Add search bar + status filter dropdown |
| C2-7 | No stats integration | LOW | Wire counts to real DB queries instead of client-side counting |

### Camps & Events

| # | Feedback | Severity | Suggested Fix |
|---|---|---|---|
| C2-8 | Create button doesn't work | HIGH | Add camp creation form (modal or page) |
| C2-9 | No homepage integration | MEDIUM | Add "Upcoming Camps" section on landing page, fetched from `camps` table |
| C2-10 | Very basic layout | MEDIUM | Add detailed view with registration list, daily attendance, pickup auth |

### PT Packages

| # | Feedback | Severity | Suggested Fix |
|---|---|---|---|
| C2-11 | Create button doesn't work | HIGH | Add package creation form |
| C2-12 | No purchase workflow | MEDIUM | Add student assignment + credit tracking UI |

### Coach Rentals

| # | Feedback | Severity | Suggested Fix |
|---|---|---|---|
| C2-13 | No calendar view | MEDIUM | Add weekly/monthly booking calendar |
| C2-14 | No booking workflow | MEDIUM | Add booking form: external coach → date/time → confirm |
| C2-15 | No waiver management | MEDIUM | Add waiver upload/view flow |

---

## Verification Standard

All Phase C.2 fixes must pass:
- `npx next build` exit 0
- All 3 locales render without errors
- 10-point quality gate from MASTER_PLAN.md
