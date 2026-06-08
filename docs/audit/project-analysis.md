# PRO LINE Gym Platform — Deep Project Analysis

> **Date:** June 7, 2026  
> **Auditor:** Roo (Architect Mode)  
> **Project Root:** `Agentics/Projects/proline-gym-platform/`  
> **Purpose:** Read-only structural analysis for planning and gap detection

---

## 1. Project Overview

| Attribute | Value |
|---|---|
| **Project** | PRO LINE Gym (برو لاين جيم) — Martial Arts Gym Management Platform |
| **Location** | Sky Business Center, Baabda, Lebanon |
| **Stack** | Next.js 14 (App Router), Supabase (PostgreSQL + Auth + RLS), Tailwind CSS, Radix UI |
| **i18n** | 3 locales: English (default), Arabic (primary UX), French (tertiary) |
| **Auth** | Email/password via Supabase Auth; 4 pre-seeded demo accounts |
| **PWA** | Dexie.js + next-pwa dependencies installed (Phase D, not yet implemented) |
| **Deployment** | Not yet deployed (Phase E) |

### Dependencies (from [`package.json`](../package.json))

- **Framework:** `next@^14.2.0`, `react@^18.3.0`, `react-dom@^18.3.0`
- **UI:** `@radix-ui/react-*` (avatar, dialog, dropdown-menu, label, select, slot, tabs, toast), `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss-animate`
- **Supabase:** `@supabase/supabase-js@^2.45.0`, `@supabase/ssr@^0.5.0`, `@supabase/auth-helpers-nextjs@^0.15.0`
- **i18n:** `next-intl@^3.17.0`
- **PWA (future):** `dexie@^4.4.3`, `html5-qrcode@^2.3.8`, `next-pwa@^5.6.0`
- **Dev:** TypeScript 5.5, ESLint 8.57, Tailwind CSS 3.4, PostCSS, Autoprefixer

---

## 2. Architecture & Route Structure

### 2.1 Portal Architecture (4 Portals, 7 DB Roles)

Per ADR-3, the UI consolidates 7 database roles into 4 portals:

| Portal | Route Group | Layout | Target Roles | Tab Bar |
|---|---|---|---|---|
| **Staff Dashboard** | `(dashboard)/` | Sidebar + Header + Auth guard | owner, head_coach, receptionist | Bottom nav (5 tabs: Dashboard, Students, Classes, Attendance, More) |
| **Coach Mobile App** | `(coach)/` | Mobile-first + bottom tab bar | coach | 3 tabs: Schedule, Attendance, Profile |
| **Member Portal** | `(portal)/` | Mobile-first + bottom tab bar | student, parent | 3 tabs: Schedule, Billing, Profile |
| **Marketing Site** | `(marketing)/` | LandingNav + LandingFooter | (public, no auth) | N/A |

### 2.2 Full Route Map

```
src/app/[locale]/
├── (marketing)/              # Public landing page
│   ├── layout.tsx            # LandingNav + LandingFooter
│   └── page.tsx              # 7-section landing page
├── auth/
│   ├── layout.tsx
│   └── login/                # Login page with demo account cards
├── (dashboard)/              # Staff Portal
│   ├── layout.tsx            # Sidebar + Header + auth guard
│   ├── _components/
│   │   ├── DashboardLayoutClient.tsx   # Client wrapper with NativeTabBar
│   │   ├── DashboardTabConfig.ts       # Tab definitions + role filtering
│   │   └── MoreMenuSheet.tsx           # "More" overflow menu
│   ├── dashboard/            # ✅ Live stats + quick actions
│   ├── students/             # ✅ Full CRUD + search + filters
│   │   ├── page.tsx          #   Server component, fetches students + filters
│   │   ├── add/page.tsx      #   Add student form page
│   │   └── components/       #   StudentList, StudentFilters, StudentForm
│   ├── classes/              # ✅ Full CRUD + enrollment
│   ├── schedule/             # ✅ Weekly calendar view
│   ├── attendance/           # ✅ Dashboard + history + reports
│   ├── payments/             # ✅ Full CRUD + stats
│   ├── invoices/             # ✅ Full CRUD + stats
│   ├── coaches/              # ✅ Full CRUD
│   ├── disciplines/          # ✅ Full CRUD
│   ├── belts/                # 🟡 Phase C.1 — Built, C.2 refinements pending
│   │   ├── page.tsx          #   Server component with breadcrumb nav
│   │   └── belt-engine-client.tsx  # Client: promote tab + history tab
│   ├── leads/                # 🟡 Phase C.1 — Built, C.2 refinements pending
│   │   ├── page.tsx          #   Server component with stats bar
│   │   └── leads-client.tsx  #   Client: search, filter, status change, trial scheduling
│   ├── camps/                # 🟡 Phase C.1 — Built, C.2 refinements pending
│   │   ├── page.tsx          #   Server component
│   │   └── camps-client.tsx  #   Client: create modal, accordion detail, empty state
│   ├── pt/                   # 🟡 Phase C.1 — Built, C.2 refinements pending
│   │   ├── page.tsx          #   Server component
│   │   └── pt-client.tsx     #   Client: create modal, assign-to-student
│   ├── rentals/              # 🟡 Phase C.1 — Built, C.2 refinements pending
│   │   ├── page.tsx          #   Server component
│   │   └── rentals-client.tsx #  Client: weekly calendar, book modal, waivers
│   ├── reports/              # ❌ Stub (Phase E)
│   ├── settings/             # ❌ Stub (Phase E)
│   └── profile/              # ❌ Stub (Phase E)
├── (coach)/                  # Coach Mobile App
│   ├── layout.tsx            # Mobile-first + bottom tab bar
│   ├── schedule/             # Coach's daily schedule
│   ├── attendance/           # Roster + check-in
│   ├── students/             # My students list
│   └── profile/              # Coach profile
├── (portal)/                 # Member Self-Service
│   ├── layout.tsx            # Mobile-first + bottom tab bar
│   ├── schedule/             # My schedule
│   ├── billing/              # My invoices/payments
│   └── profile/              # My profile
└── layout.tsx                # Root shell (RTL-aware, i18n provider)
```

### 2.3 Role-Based Navigation (from [`DashboardTabConfig.ts`](src/app/[locale]/(dashboard)/_components/DashboardTabConfig.ts))

| Role | Visible Dashboard Tabs |
|---|---|
| **owner** | All 17 items: dashboard, students, classes, schedule, attendance, payments, invoices, coaches, ptSessions, rentals, camps, leads, belts, disciplines, reports, settings, profile |
| **head_coach** | 9 items: dashboard, students, classes, schedule, attendance, coaches, ptSessions, reports, profile |
| **receptionist** | 7 items: dashboard, students, payments, invoices, leads, camps, profile |
| **coach** | Empty (uses `(coach)/` portal instead) |
| **student** | Empty (uses `(portal)/` portal instead) |
| **parent** | Empty (uses `(portal)/` portal instead) |
| **external_coach** | Empty (uses rentals module within dashboard) |

---

## 3. Auth System

### 3.1 Authentication Flow

- **Method:** Email/password via Supabase Auth
- **Login Page:** `src/app/[locale]/auth/login/` — branded PRO LINE Gym login
- **Demo Accounts:** 4 pre-seeded accounts (password: `ProlineDemo2024!`):
  - `owner@prolinegym.lb` → role: `owner`
  - `coach@prolinegym.lb` → role: `coach`
  - `reception@prolinegym.lb` → role: `receptionist`
  - `student@prolinegym.lb` → role: `student`
- **Role Assignment:** Via `user_roles` table (user_id, gym_id, role, is_primary)
- **Middleware:** Role-based redirects — authenticated users redirected to their portal; coach/student/parent blocked from `/dashboard`

### 3.2 Role Management (from [`000008_demo_accounts.sql`](supabase/migrations/000008_demo_accounts.sql))

Roles are stored in the `user_roles` table with a `role` column using an enum type. The 7 roles are:
1. `owner` — Full system access
2. `head_coach` — Operational management
3. `coach` — Class delivery, attendance
4. `receptionist` — Front desk, payments, leads
5. `student` — Self-service portal
6. `parent` — Guardian portal (for minors)
7. `external_coach` — Rental bookings only

---

## 4. Database Schema

### 4.1 Migration Stack (9 migrations)

| Migration | Content | Status |
|---|---|---|
| `000001` | All enum types (user_role, lead_status, camp_status, payment_method, invoice_status, attendance_status, etc.) | ✅ Exists |
| `000002` | Core tables: gyms, profiles, students, coaches, disciplines, belt_hierarchies, guardians, user_roles | ✅ Exists |
| `000003` | Operational tables: classes, class_schedules, class_enrollments, invoices, payments, pt_packages, pt_sessions, rentals, rental_bookings, leads, camps, camp_registrations, camp_attendance, documents, notifications | ✅ Exists |
| `000004` | RLS policies for 7 roles | ✅ Exists |
| `000005` | Triggers: updated_at, audit, exchange rate, invoice totals, invoice numbers | ✅ Exists |
| `000006` | Seed data: PRO LINE Gym, 6 disciplines, belt hierarchies (Muay Thai + Boxing), 3 membership plans, 3 PT packages, 3 rental spaces, demo students | ✅ Exists |
| `000007` | Currency preference fix | ✅ Exists |
| `000008` | Demo accounts (4 users in auth.users + user_roles) | ✅ Exists |
| `000009` | Public lead submission RPC (`submit_public_lead`) | ✅ Exists |

### 4.2 Key Tables & Relationships

| Table | Key Columns | Relationships |
|---|---|---|
| `gyms` | id, name_*, slug, address_*, phone, email, currency_preference | Parent of most tables |
| `profiles` | id (FK→auth.users), gym_id, first_name_*, last_name_*, phone, gender | Extended user data |
| `students` | id, profile_id (FK→profiles), gym_id, current_belt_rank, belt_promotion_date, is_active, emergency_contact_*, discipline_id | Links profile to gym as student |
| `coaches` | id, profile_id (FK→profiles), gym_id, specialization, is_active | Links profile to gym as coach |
| `user_roles` | user_id (FK→auth.users), gym_id, role (enum), is_primary | Role assignment |
| `disciplines` | id, gym_id, name_*, sort_order | Programs offered |
| `belt_hierarchies` | id, discipline_id, rank, name_*, sort_order, stripe_count, is_black_belt | Belt ranks per discipline |
| `belt_promotions` | id, student_id, coach_id, discipline_id, belt_hierarchy_id, from_rank, to_rank, promotion_date, notes_* | Promotion history |
| `membership_plans` | id, gym_id, name_*, duration_days, price_usd, max_classes_per_week, includes_pt | Plan templates |
| `pt_packages` | id, gym_id, name_*, session_count, price_usd, validity_days | PT package templates |
| `pt_sessions` | id, pt_package_id, student_id, coach_id, session_date, status | Individual PT sessions |
| `rentals` | id, gym_id, name_*, hourly_rate_usd, status | Rental spaces |
| `rental_bookings` | id, rental_id, booking_date, time_from, time_to, external_coach_name, external_coach_phone, status | Bookings |
| `leads` | id, gym_id, first_name, last_name, phone, email, source, status, interested_discipline_id, notes, converted_at | Lead pipeline |
| `camps` | id, gym_id, name_*, start_date, end_date, location_*, time_from, time_to, max_capacity, description_*, price_usd, status | Camps & events |
| `camp_registrations` | id, camp_id, student_id, registered_at, status | Camp enrollment |
| `camp_attendance` | id, camp_registration_id, date, status, pickup_authorized_by | Daily camp attendance |
| `classes` | id, gym_id, discipline_id, name_*, capacity, status | Class definitions |
| `class_schedules` | id, class_id, coach_id, day_of_week, time_from, time_to, room | Recurring schedule |
| `class_enrollments` | id, class_id, student_id, enrolled_at, status | Student enrollment |
| `invoices` | id, gym_id, student_id, invoice_number, issue_date, due_date, total_amount_usd, total_amount_lbp, status | Billing |
| `payments` | id, gym_id, invoice_id, student_id, amount_usd, amount_lbp, payment_method, payment_date, status | Payment records |
| `documents` | id, gym_id, student_id, document_type, file_url, uploaded_at | Waivers, forms |
| `notifications` | id, user_id, title_*, body_*, type, read, action_url | In-app notifications |

### 4.3 Dual-Currency Design

All financial tables have `amount_usd` and `amount_lbp` columns plus `exchange_rate` and `rate_date` (per ADR-6). This is critical for Lebanon's dual-currency economy.

---

## 5. Dashboard Modules — Detailed Analysis

### 5.1 ✅ Core Modules (Phase A — Complete)

#### Students (`/students/`)
- **Server component** ([`page.tsx`](src/app/[locale]/(dashboard)/students/page.tsx)): Fetches students with profile join, supports search (name/phone), status filter, discipline/belt filter dropdowns
- **Add Student** ([`add/page.tsx`](src/app/[locale]/(dashboard)/students/add/page.tsx)): Form page with discipline selector, belt rank selector, guardian selector
- **Components:** `StudentList`, `StudentFilters`, `StudentForm` (in `components/` subdirectory)
- **Status:** ✅ Fully functional CRUD with search/filter

#### Classes, Schedule, Attendance, Payments, Invoices, Coaches, Disciplines
- All described as "Full CRUD" in MASTER_PLAN
- **Status:** ✅ Built in Phase A (not audited in detail for this analysis)

### 5.2 🟡 Phase C Modules (Built in C.1, Refinements in C.2)

#### Belt Engine (`/belts/`)
- **Server component** ([`page.tsx`](src/app/[locale]/(dashboard)/belts/page.tsx)): Fetches students, disciplines, coaches, belt hierarchies, promotions. Has breadcrumb nav + "Back to Students" link.
- **Client component** ([`belt-engine-client.tsx`](src/app/[locale]/(dashboard)/belts/belt-engine-client.tsx)): Two tabs — "Promote" (student select → discipline → belt → coach → notes → submit) and "History" (promotion timeline). Uses native HTML `<select>` elements to avoid Radix hydration issues.
- **Known gaps (from test register):**
  - C2-1: No navigation (partially fixed — breadcrumb added to server component)
  - C2-2: No clear workflow stepper (not yet implemented)
  - C2-3: Empty students list (seed data added to `000006_seed_data.sql`)
  - C2-4: No auto-refresh after promotion (not yet implemented)

#### Lead Pipeline (`/leads/`)
- **Server component** ([`page.tsx`](src/app/[locale]/(dashboard)/leads/page.tsx)): Fetches all leads + disciplines. Shows 5-column stats bar (All, New, Contacted, Scheduled, Converted). **Stats are client-side computed** (`.filter().length`), not server-aggregated.
- **Client component** ([`leads-client.tsx`](src/app/[locale]/(dashboard)/leads/leads-client.tsx)): Search bar, status filter dropdown, lead cards with inline status change, "Schedule Trial" expandable section, "Convert" button.
- **Known gaps (from test register):**
  - C2-5: Wireframe feel — status change dropdown works, trial scheduling works, convert works. **Partially addressed.**
  - C2-6: Search/filter — **implemented** (search bar + status filter).
  - C2-7: Stats are client-side, not server-side COUNT queries. **Not yet fixed.**

#### Camps & Events (`/camps/`)
- **Server component** ([`page.tsx`](src/app/[locale]/(dashboard)/camps/page.tsx)): Fetches all camps ordered by start_date.
- **Client component** ([`camps-client.tsx`](src/app/[locale]/(dashboard)/camps/camps-client.tsx)): "New Camp" button opens modal form (name in 3 languages, dates, times, capacity, price). Camp cards with expandable detail accordion. Empty state.
- **Known gaps (from test register):**
  - C2-8: Create button — **fixed** (modal form implemented).
  - C2-9: No homepage integration — **not yet implemented** (no upcoming camps on landing page).
  - C2-10: Basic layout — **partially addressed** (accordion detail view added).

#### PT Packages (`/pt/`)
- **Server component** ([`page.tsx`](src/app/[locale]/(dashboard)/pt/page.tsx)): Fetches packages + students with profiles.
- **Client component** ([`pt-client.tsx`](src/app/[locale]/(dashboard)/pt/pt-client.tsx)): "New Package" button opens modal form (name, sessions, price, validity). Package cards with "Assign to Student" dropdown. Empty state.
- **Known gaps (from test register):**
  - C2-11: Create button — **fixed** (modal form implemented).
  - C2-12: No purchase workflow — **partially addressed** (assign-to-student UI works, but no credit tracking or expiry enforcement).

#### Coach Rentals (`/rentals/`)
- **Server component** ([`page.tsx`](src/app/[locale]/(dashboard)/rentals/page.tsx)): Fetches rentals + bookings.
- **Client component** ([`rentals-client.tsx`](src/app/[locale]/(dashboard)/rentals/rentals-client.tsx)): Weekly calendar grid (spaces × days), prev/next week navigation, rental cards with "Book" and "Waiver" buttons, booking modal form, waivers section (placeholder).
- **Known gaps (from test register):**
  - C2-13: Calendar view — **implemented** (weekly grid with booked indicators).
  - C2-14: Booking workflow — **implemented** (modal form with date/time/coach info).
  - C2-15: Waiver management — **placeholder only** ("No waivers on file yet. Waiver upload coming soon.").

### 5.3 ❌ Stub Modules (Not Yet Built)

| Module | Route | Planned Phase |
|---|---|---|
| Reports | `/reports/` | Phase E |
| Settings | `/settings/` | Phase E |
| Profile | `/profile/` | Phase E |

---

## 6. i18n Coverage

### 6.1 Translation Keys

| Namespace | Key Count (en.json) | Status |
|---|---|---|
| `app` | 5 | ✅ Complete |
| `auth` | 18 | ✅ Complete |
| `nav` | 19 | ✅ Complete |
| `common` | 60+ | ✅ Complete |
| `language` | 4 | ✅ Complete |
| `direction` | 1 | ✅ Complete |
| `dashboard` | 18 | ✅ Complete |
| `students` | 40+ | ✅ Complete |
| `coaches` | 18 | ✅ Complete |
| `disciplines` | 12 | ✅ Complete |
| `classes` | 30+ | ✅ Complete |
| `schedule` | 10 | ✅ Complete |
| `attendance` | 50+ | ✅ Complete |
| `payments` | 40+ | ✅ Complete |
| `invoices` | 25+ | ✅ Complete |
| `status` | 10 | ✅ Complete |
| `landing` | 18 | ✅ Complete |
| `belts` | 14 | ✅ Complete |
| `leads` | 9 | ✅ Complete |
| `camps` | 10 | ✅ Complete |
| `pt` | 8 | ✅ Complete |
| `rentals` | 8 | ✅ Complete |

**Total:** ~439 keys per locale (ar/en/fr)

### 6.2 Observations

- All 3 locales (ar.json, en.json, fr.json) are present and structurally aligned
- Arabic is the primary UX target (RTL layout)
- Some Phase C modules have minimal i18n keys (e.g., `leads` has only 9 keys, `rentals` has 8)
- Several components use inline hardcoded strings with ternary locale checks instead of `useTranslations()` (e.g., `locale === 'ar' ? 'محرك الأحزمة' : 'Belt Engine'`). This is a **code quality gap** — the MASTER_PLAN mandates all UI text use i18n keys.

---

## 7. Gaps & Issues Found

### 7.1 Critical Gaps

| # | Issue | Location | Severity |
|---|---|---|---|
| G1 | **No test files exist** — Zero unit, integration, or E2E tests despite 80% coverage mandate | Entire project | CRITICAL |
| G2 | **Hardcoded strings in components** — Many Phase C components use `locale === 'ar' ? ... : ...` ternaries instead of `useTranslations()` | belts, leads, camps, pt, rentals client components | HIGH |
| G3 | **Client-side stats instead of server queries** — Lead stats use `.filter().length` instead of SQL `COUNT` | [`leads/page.tsx`](src/app/[locale]/(dashboard)/leads/page.tsx) lines 35-41 | MEDIUM |
| G4 | **No optimistic UI after promotion** — Belt promotion doesn't refresh student list | [`belt-engine-client.tsx`](src/app/[locale]/(dashboard)/belts/belt-engine-client.tsx) | MEDIUM |
| G5 | **No seed data for camps** — Camps table is empty; no demo camps exist | DB seed | MEDIUM |
| G6 | **Waiver upload is placeholder** — No actual file upload to Supabase Storage | [`rentals-client.tsx`](src/app/[locale]/(dashboard)/rentals/rentals-client.tsx) | MEDIUM |
| G7 | **No conflict detection for rentals** — Booking modal doesn't check for overlapping bookings | [`rentals-client.tsx`](src/app/[locale]/(dashboard)/rentals/rentals-client.tsx) | MEDIUM |

### 7.2 Minor Gaps

| # | Issue | Location | Severity |
|---|---|---|---|
| G8 | **No breadcrumb navigation** on leads, camps, pt, rentals pages | Phase C pages | LOW |
| G9 | **No "Back to Students" link** on leads, camps, pt, rentals (only belts has it) | Phase C pages | LOW |
| G10 | **No loading skeletons** for Phase C pages (only belts has Suspense fallback) | Phase C pages | LOW |
| G11 | **No error boundaries** — All Phase C pages lack error handling beyond basic console.error | Phase C pages | LOW |
| G12 | **Migration files 000001-000005, 000007 not found** at expected paths — may have different filenames or be missing | `supabase/migrations/` | LOW (needs verification) |

### 7.3 Architectural Observations

1. **Server/Client split is inconsistent**: Some Phase C modules fetch data in server components and pass to client components (good pattern), but others mix server and client concerns.
2. **Radix UI hydration workaround**: The belt engine uses native `<select>` instead of Radix `<Select>` to avoid hydration errors — this is a pragmatic choice but inconsistent with the rest of the app.
3. **No TypeScript types for DB queries**: Phase C components use `any` types extensively instead of generated types from `src/types/database.ts`.
4. **No Zod validation schemas**: Phase C forms lack Zod validation (violates SSOT Rule #6 from MASTER_PLAN).
5. **Coach and Member portals exist but were not audited** in this analysis (out of scope).

---

## 8. Summary

### What's Complete
- ✅ Full database schema (9 migrations) with RLS, triggers, seed data
- ✅ 4-portal route architecture (marketing, dashboard, coach, portal)
- ✅ 9 core dashboard modules (dashboard, students, classes, schedule, attendance, payments, invoices, coaches, disciplines)
- ✅ 5 Phase C modules built (belts, leads, camps, pt, rentals) — functional but rough
- ✅ 439 i18n keys per locale (ar/en/fr)
- ✅ Landing page with 7 sections + public lead capture
- ✅ Auth with 4 demo accounts + role-based middleware

### What Needs Work (Phase C.2 Refinements)
- 🟡 Belt Engine: Add workflow stepper, auto-refresh after promotion
- 🟡 Lead Pipeline: Wire stats to server-side COUNT queries
- 🟡 Camps: Add upcoming camps to landing page
- 🟡 PT Packages: Add credit tracking and expiry enforcement
- 🟡 Rentals: Add conflict detection, real waiver upload

### What's Not Started
- ❌ Testing (unit, integration, E2E)
- ❌ Offline sync (Dexie.js, sync engine)
- ❌ PWA (service worker, manifest)
- ❌ WhatsApp integration
- ❌ Reports, Settings, Profile modules
- ❌ Security audit
- ❌ Production deployment

---

*Analysis generated by Roo (Architect Mode) on June 7, 2026. This is a read-only document — no code was modified.*
