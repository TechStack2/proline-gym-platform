# PRO LINE Gym Platform — Portal / User / Feature Map

> **Created:** June 8, 2026
> **Purpose:** Wireframe parity audit — single reference for every portal, user type, route, and feature claim
> **Methodology:** Cross-referenced MASTER_PLAN.md, blueprint, technical architecture, test register, dispatch spec, and actual source code
> **Status:** READ-ONLY — No code changes

---

## 1. Portal Architecture (ADR-3)

7 roles consolidated into 4 portals. Roles preserved at DB/RLS level.

```
┌─────────────────────────────────────────────────────────────┐
│                    PORTAL ARCHITECTURE                        │
│                                                               │
│  PORTAL A: (marketing)        → Public (no auth)             │
│  PORTAL B: (dashboard)        → owner / head_coach /         │
│                                  receptionist                 │
│  PORTAL C: coach/              → coach only                   │
│  PORTAL D: portal/             → student / parent             │
│                                                               │
│  external_coach → (dashboard)/rentals/ (via staff portal)    │
│                    No dedicated portal. Managed by staff.     │
└─────────────────────────────────────────────────────────────┘
```

| Portal | Route Group | Auth Required | Roles Served | Layout | Tab Bar |
|--------|------------|---------------|-------------|--------|---------|
| **Marketing** | [`(marketing)/`](src/app/[locale]/(marketing)/layout.tsx) | No | Public | LandingNav + LandingFooter | None |
| **Staff Dashboard** | [`(dashboard)/`](src/app/[locale]/(dashboard)/layout.tsx) | Yes | owner, head_coach, receptionist | Sidebar (desktop) + NativeHeader + NativeTabBar (mobile) | 5 primary tabs + "More" sheet |
| **Coach App** | [`coach/`](src/app/[locale]/coach/layout.tsx) | Yes | coach | Mobile-first + NativeHeader + NativeTabBar | 4 tabs |
| **Member Portal** | [`portal/`](src/app/[locale]/portal/layout.tsx) | Yes | student, parent | Mobile-first + NativeHeader + NativeTabBar | 4 tabs |
| **Auth** | [`auth/`](src/app/[locale]/auth/layout.tsx) | No | All (login) | Clean auth shell | None |
| **Login (unified)** | [`login/`](src/app/[locale]/login/page.tsx) | No | All | PRO LINE branding, demo accounts | None |

---

## 2. User Roles & Permissions

### 2.1 Role Definitions

| Role | Portal | DB Table | Auth Method | Demo Account |
|------|--------|----------|-------------|-------------|
| **owner** | (dashboard) | `profiles` + `user_roles` | Email/Password | ✅ `owner@prolinegym.lb` |
| **head_coach** | (dashboard) | `profiles` + `user_roles` | Email/Password | ✅ `headcoach@prolinegym.lb` |
| **coach** | coach/ | `coaches` + `profiles` | Email/Password | ✅ `coach@prolinegym.lb` |
| **receptionist** | (dashboard) | `profiles` + `user_roles` | Email/Password | ✅ `reception@prolinegym.lb` |
| **student** | portal/ | `students` + `profiles` | Email/Password | ✅ `student@prolinegym.lb` |
| **parent** | portal/ | `students` (guardian) | Email/Password | No dedicated demo |
| **external_coach** | N/A (managed via staff) | `external_coaches` | None (v1) | No demo account |

### 2.2 Role-Based Navigation (Verified in DashboardTabConfig.ts)

**Source:** [`DashboardTabConfig.ts`](src/app/[locale]/(dashboard)/_components/DashboardTabConfig.ts:56-63)

| Role | Visible Dashboard Items |
|------|------------------------|
| **owner** | dashboard, students, classes, schedule, attendance, payments, invoices, coaches, ptSessions, rentals, camps, leads, belts, disciplines, reports, settings, profile (17 items) |
| **head_coach** | dashboard, students, classes, schedule, attendance, coaches, ptSessions, reports, profile (9 items) |
| **receptionist** | dashboard, students, payments, invoices, leads, camps, profile (7 items) |
| **coach** | → routed to `/coach` portal (not dashboard) |
| **student** | → routed to `/portal` |
| **parent** | → routed to `/portal` |
| **external_coach** | → no portal access |

### 2.3 Permission Matrix (Blueprint §3)

See [proline-gym-platform-blueprint.md](docs/plans/proline-gym-platform-blueprint.md#3-user-roles--permissions) — 24 capability rows across 7 roles. Implemented via Supabase RLS (migration `000004`).

---

## 3. Complete Route Inventory

### 3.1 PORTAL A — Marketing (Public)

| Route | File | Status | Notes |
|-------|------|--------|-------|
| `/` | [`(marketing)/page.tsx`](src/app/[locale]/(marketing)/page.tsx) | ✅ Complete | 7-section landing page |
| `/login` | [`login/page.tsx`](src/app/[locale]/login/page.tsx) | ✅ Complete | Unified login, 4 demo accounts |

**Landing Page Sections:**
1. ✅ Hero Section → [`HeroSection.tsx`](src/components/marketing/HeroSection.tsx)
2. ✅ Disciplines → [`DisciplinesSection.tsx`](src/components/marketing/DisciplinesSection.tsx) (server-fetched from DB)
3. ✅ Why PRO LINE → [`WhySection.tsx`](src/components/marketing/WhySection.tsx)
4. ✅ Pricing → [`PricingSection.tsx`](src/components/marketing/PricingSection.tsx)
5. ✅ Facility → [`FacilitySection.tsx`](src/components/marketing/FacilitySection.tsx)
6. ✅ Trial CTA → [`TrialCTASection.tsx`](src/components/marketing/TrialCTASection.tsx) (→ `submit_public_lead` RPC)
7. ✅ Footer → [`LandingFooter.tsx`](src/components/layout/LandingFooter.tsx)

---

### 3.2 PORTAL B — Staff Dashboard `(dashboard)/`

**Layout:** [`(dashboard)/layout.tsx`](src/app/[locale]/(dashboard)/layout.tsx) — Sidebar (desktop) + NativeHeader + NativeTabBar (mobile)
**Tab Config:** [`DashboardTabConfig.ts`](src/app/[locale]/(dashboard)/_components/DashboardTabConfig.ts)

| # | Route | Page File | Client Component | Status | Phase | Notes |
|---|-------|-----------|-----------------|--------|-------|-------|
| 1 | `/dashboard` | [`dashboard/page.tsx`](src/app/[locale]/(dashboard)/dashboard/page.tsx) | — | ✅ Complete | A | Live stats from Supabase |
| 2 | `/students` | [`students/page.tsx`](src/app/[locale]/(dashboard)/students/page.tsx) | `student-list.tsx`, `student-filters.tsx`, `student-form.tsx`, `student-detail.tsx` | ✅ Complete | A | Full CRUD + search/filters |
| 3 | `/students/add` | [`students/add/page.tsx`](src/app/[locale]/(dashboard)/students/add/page.tsx) | — | ✅ Complete | A | |
| 4 | `/students/[id]` | [`students/[id]/page.tsx`](src/app/[locale]/(dashboard)/students/[id]/page.tsx) | — | ✅ Complete | A | |
| 5 | `/classes` | [`classes/page.tsx`](src/app/[locale]/(dashboard)/classes/page.tsx) | `ClassesList.tsx`, `AddClassModal.tsx` | ✅ Complete | A | Full CRUD + enrollment |
| 6 | `/classes/[id]` | [`classes/[id]/page.tsx`](src/app/[locale]/(dashboard)/classes/[id]/page.tsx) | `ClassDetail.tsx`, `EnrollStudentModal.tsx` | ✅ Complete | A | |
| 7 | `/schedule` | [`schedule/page.tsx`](src/app/[locale]/(dashboard)/schedule/page.tsx) | `WeeklySchedule.tsx` | ✅ Complete | A | Weekly calendar |
| 8 | `/attendance` | [`attendance/page.tsx`](src/app/[locale]/(dashboard)/attendance/page.tsx) | `attendance-dashboard-client.tsx` | ✅ Complete | A | Dashboard view |
| 9 | `/attendance/history` | [`attendance/history/page.tsx`](src/app/[locale]/(dashboard)/attendance/history/page.tsx) | `attendance-history-client.tsx` | ✅ Complete | A | |
| 10 | `/attendance/reports` | [`attendance/reports/page.tsx`](src/app/[locale]/(dashboard)/attendance/reports/page.tsx) | `attendance-reports-client.tsx` | ✅ Complete | A | |
| 11 | `/payments` | [`payments/page.tsx`](src/app/[locale]/(dashboard)/payments/page.tsx) | `payment-list.tsx`, `payment-filters.tsx`, `payment-stats.tsx` | ✅ Complete | A | Full CRUD + stats |
| 12 | `/payments/new` | [`payments/new/page.tsx`](src/app/[locale]/(dashboard)/payments/new/page.tsx) | — | ✅ Complete | A | |
| 13 | `/payments/[id]` | [`payments/[id]/page.tsx`](src/app/[locale]/(dashboard)/payments/[id]/page.tsx) | `payment-detail.tsx`, `payment-form.tsx` | ✅ Complete | A | |
| 14 | `/invoices` | [`invoices/page.tsx`](src/app/[locale]/(dashboard)/invoices/page.tsx) | `invoice-list.tsx`, `invoice-filters.tsx`, `invoice-form.tsx`, `invoice-stats.tsx` | ✅ Complete | A | Full CRUD + stats |
| 15 | `/invoices/new` | [`invoices/new/page.tsx`](src/app/[locale]/(dashboard)/invoices/new/page.tsx) | — | ✅ Complete | A | |
| 16 | `/coaches` | [`coaches/page.tsx`](src/app/[locale]/(dashboard)/coaches/page.tsx) | `coach-list.tsx`, `coach-filters.tsx` | ✅ Complete | A | Full CRUD |
| 17 | `/coaches/add` | [`coaches/add/page.tsx`](src/app/[locale]/(dashboard)/coaches/add/page.tsx) | `coach-form.tsx` | ✅ Complete | A | |
| 18 | `/coaches/[id]` | [`coaches/[id]/page.tsx`](src/app/[locale]/(dashboard)/coaches/[id]/page.tsx) | `coach-detail.tsx` | ✅ Complete | A | |
| 19 | `/disciplines` | [`disciplines/page.tsx`](src/app/[locale]/(dashboard)/disciplines/page.tsx) | `discipline-list.tsx` | ✅ Complete | A | Full CRUD |
| 20 | `/disciplines/add` | [`disciplines/add/page.tsx`](src/app/[locale]/(dashboard)/disciplines/add/page.tsx) | `discipline-form.tsx` | ✅ Complete | A | |
| 21 | `/belts` | [`belts/page.tsx`](src/app/[locale]/(dashboard)/belts/page.tsx) | `belt-engine-client.tsx` | ⚠️ C.1 Done / C.2 Partial | C | Has breadcrumb + back link (C2-1 fix). Promotion auto-refresh pending (C2-4). No stepper yet (C2-2). |
| 22 | `/leads` | [`leads/page.tsx`](src/app/[locale]/(dashboard)/leads/page.tsx) | `leads-client.tsx` | ⚠️ C.1 Done / C.2 Partial | C | Stats wired to COUNT (C2-7 ✅). Status dropdown + trial scheduling pending (C2-5). Search filter via searchParams exists (C2-6 ✅). |
| 23 | `/camps` | [`camps/page.tsx`](src/app/[locale]/(dashboard)/camps/page.tsx) | `camps-client.tsx` | ⚠️ C.1 Done / C.2 Partial | C | Creation form pending (C2-8). Landing page integration pending (C2-9). |
| 24 | `/pt` | [`pt/page.tsx`](src/app/[locale]/(dashboard)/pt/page.tsx) | `pt-client.tsx` | ⚠️ C.1 Done / C.2 Partial | C | Fetches packages + students + coaches + assignments. Package creation pending (C2-11). Student assignment pending (C2-12). |
| 25 | `/rentals` | [`rentals/page.tsx`](src/app/[locale]/(dashboard)/rentals/page.tsx) | `rentals-client.tsx` | ⚠️ C.1 Done / C.2 Partial | C | Fetches rentals + bookings. Calendar view pending (C2-13). Booking form pending (C2-14). Waiver pending (C2-15). |
| 26 | `/reports` | [`reports/page.tsx`](src/app/[locale]/(dashboard)/reports/page.tsx) | `reports-tabs.tsx`, `attendance-report.tsx`, `belt-progression-report.tsx`, `revenue-report.tsx` | ✅ Beyond stub | E | Full reports page with 3 report types, breadcrumb, tabs. |
| 27 | `/settings` | [`settings/page.tsx`](src/app/[locale]/(dashboard)/settings/page.tsx) | `settings-client.tsx`, `gym-settings.tsx`, `exchange-rates.tsx`, `membership-plans.tsx`, `discipline-settings.tsx` | ✅ Beyond stub | E | Full settings with 4 tabs, fetches gyms, rates, plans, disciplines. |
| 28 | `/profile` | [`profile/page.tsx`](src/app/[locale]/(dashboard)/profile/page.tsx) | — (inline server action) | ✅ Beyond stub | E | Full profile view with avatar, role badges, edit form (tri-lingual names, phone, locale), server action `updateProfile`. |
| 29 | `/notifications` | [`notifications/page.tsx`](src/app/[locale]/(dashboard)/notifications/page.tsx) | `notifications-client.tsx` | ✅ Complete | A | Notification center |

---

### 3.3 PORTAL C — Coach App `coach/`

**Layout:** [`coach/layout.tsx`](src/app/[locale]/coach/layout.tsx) — Mobile-first, NativeHeader + NativeTabBar
**Tab Config:** [`CoachTabConfig.ts`](src/app/[locale]/coach/_components/CoachTabConfig.ts)

| # | Tab Key | Route | Page File | Status | Notes |
|---|---------|-------|-----------|--------|-------|
| 1 | `schedule` | `/coach` | [`coach/page.tsx`](src/app/[locale]/coach/page.tsx) | ✅ Complete | Coach's daily schedule |
| 2 | `attendance` | `/coach/attendance` | [`coach/attendance/page.tsx`](src/app/[locale]/coach/attendance/page.tsx) | ✅ Complete | Roster + check-in |
| 3 | `students` | `/coach/students` | [`coach/students/page.tsx`](src/app/[locale]/coach/students/page.tsx) | ✅ Complete | My students list |
| 4 | `profile` | `/coach/profile` | [`coach/profile/page.tsx`](src/app/[locale]/coach/profile/page.tsx) | ✅ Complete | Coach profile |

**Icons:** Calendar, ClipboardCheck, Users, User

---

### 3.4 PORTAL D — Member Portal `portal/`

**Layout:** [`portal/layout.tsx`](src/app/[locale]/portal/layout.tsx) — Mobile-first, NativeHeader + NativeTabBar
**Tab Config:** [`PortalTabConfig.ts`](src/app/[locale]/portal/_components/PortalTabConfig.ts)

| # | Tab Key | Route | Page File | Status | Notes |
|---|---------|-------|-----------|--------|-------|
| 1 | `home` | `/portal` | [`portal/page.tsx`](src/app/[locale]/portal/page.tsx) | ✅ Complete | Welcome page |
| 2 | `schedule` | `/portal/schedule` | [`portal/schedule/page.tsx`](src/app/[locale]/portal/schedule/page.tsx) | ✅ Complete | My schedule |
| 3 | `billing` | `/portal/billing` | [`portal/billing/page.tsx`](src/app/[locale]/portal/billing/page.tsx) | ✅ Complete | My invoices/payments |
| 4 | `profile` | `/portal/profile` | [`portal/profile/page.tsx`](src/app/[locale]/portal/profile/page.tsx) | ✅ Complete | My profile |

**Icons:** Grid, Calendar, CreditCard, User

---

## 4. Feature Claims vs. Reality

### 4.1 Phase A Modules (✅ COMPLETE — 9 modules)

| Module | Claimed | Verified | Notes |
|--------|---------|----------|-------|
| Landing Page (7 sections) | ✅ | ✅ | Verified in [`(marketing)/page.tsx`](src/app/[locale]/(marketing)/page.tsx) |
| Auth (email/password + 4 demos) | ✅ | ✅ | [`login/page.tsx`](src/app/[locale]/login/page.tsx) |
| i18n (439 keys, ar/en/fr) | ✅ | ✅ | [`i18n/messages/`](src/i18n/messages/) |
| Students CRUD | ✅ | ✅ | Full CRUD with filters, detail, add |
| Classes CRUD | ✅ | ✅ | Full CRUD with enrollment, modal |
| Schedule (weekly) | ✅ | ✅ | WeeklySchedule.tsx |
| Attendance (dashboard + history + reports) | ✅ | ✅ | 3 sub-routes all populated |
| Payments CRUD | ✅ | ✅ | Full CRUD with stats, filters |
| Invoices CRUD | ✅ | ✅ | Full CRUD with stats, filters |
| Coaches CRUD | ✅ | ✅ | Full CRUD with filters, detail |
| Disciplines CRUD | ✅ | ✅ | Full CRUD |
| Dashboard (live stats) | ✅ | ✅ | Supabase aggregation queries |
| Notifications | ✅ | ✅ | Notification center with bell |

### 4.2 Phase B Modules (✅ COMPLETE)

| Module | Claimed | Verified | Notes |
|--------|---------|----------|-------|
| Role-based routing middleware | ✅ | ✅ | Middleware redirects |
| Staff Dashboard layout | ✅ | ✅ | Sidebar + Header + NativeTabBar |
| Coach App layout + 4 pages | ✅ | ✅ | NativeTabBar with 4 tabs |
| Member Portal layout + 3 pages | ✅ | ✅ | NativeTabBar with 4 tabs |
| Native components | ✅ | ✅ | NativeHeader, NativeTabBar, SwipeableSheet, PageTransition |

### 4.3 Phase C Modules (⚠️ PARTIAL — C.1 done, C.2 in progress)

| Module | C.1 Status | C.2 Gaps | Dispatch Spec Agent |
|--------|-----------|----------|---------------------|
| **Belt Engine** | ✅ Page exists with breadcrumb + back link | Stepper workflow (C2-2), demo students (C2-3), auto-refresh (C2-4) | `c2-belt-engine` |
| **Lead Pipeline** | ✅ Page exists with server COUNT stats, searchParams filter | Status dropdown + trial scheduling + convert button (C2-5) | `c2-lead-pipeline` |
| **Camps & Events** | ✅ Page exists with CampsClient | Create form (C2-8), landing integration (C2-9), detail view (C2-10) | `c2-camps-events` |
| **PT Packages** | ✅ Page exists with PTPackagesClient, fetches all related data | Package creation (C2-11), student assignment (C2-12) | `c2-pt-packages` |
| **Coach Rentals** | ✅ Page exists with RentalsClient, fetches rentals + bookings | Calendar view (C2-13), booking form (C2-14), waiver management (C2-15) | `c2-coach-rentals` |

**C.1 Deliverables Verified (actual code exists):**
- ✅ All 5 server components load data from Supabase with gym_id isolation
- ✅ All 5 have i18n namespaces (belts, leads, camps, pt, rentals)
- ✅ All 5 have Suspense boundaries with loading skeletons
- ✅ Lead stats use server-side COUNT (not client-side filter — C2-7 already resolved)
- ✅ Lead page has searchParams-based search/filter (C2-6 already resolved)

**C.2 Remaining Work (per dispatch-spec.json):**
The dispatch spec at [`Shared/missions/phase-c-refinements/dispatch-spec.json`](../../../Shared/missions/phase-c-refinements/dispatch-spec.json) defines 5 parallel agents with precise file targets. Each agent addresses 2-4 specific test register items.

### 4.4 Phase E Modules (⚠️ Beyond stub — significant code exists)

| Module | Claimed (MASTER_PLAN) | Actual Status | Notes |
|--------|----------------------|---------------|-------|
| **Reports** | 🏗️ Stub | ✅ Advanced stub — 3 report types (attendance, belt progression, revenue) with tabs | [`reports/page.tsx`](src/app/[locale]/(dashboard)/reports/page.tsx) |
| **Settings** | 🏗️ Stub | ✅ Advanced stub — 4 tabs (gym, exchange rates, plans, disciplines) | [`settings/page.tsx`](src/app/[locale]/(dashboard)/settings/page.tsx) |
| **Profile** | 🏗️ Stub | ✅ Full implementation — avatar, role badges, tri-lingual edit form, server action | [`profile/page.tsx`](src/app/[locale]/(dashboard)/profile/page.tsx) |

### 4.5 Phase D Modules (☐ NOT STARTED)

| Module | Status | Key Files |
|--------|--------|-----------|
| Dexie.js offline DB | ☐ Not started | — (spec in MASTER_PLAN.md) |
| Sync engine | ☐ Not started | — (spec in technical architecture) |
| Service Worker / PWA | ⚠️ Partial — manifest.json + offline.html exist, no SW | [`public/manifest.json`](public/manifest.json), [`public/offline.html`](public/offline.html) |
| WhatsApp Cloud API | ⚠️ Partial — types + client lib exist, no integration | [`lib/whatsapp/types.ts`](src/lib/whatsapp/types.ts), [`lib/whatsapp/client.ts`](src/lib/whatsapp/client.ts) |
| Offline QR attendance | ⚠️ Partial — scanner component exists | [`offline-qr-scanner.tsx`](src/components/attendance/offline-qr-scanner.tsx) |
| PWA install prompt | ✅ Complete | [`pwa-install-prompt.tsx`](src/components/pwa/pwa-install-prompt.tsx) |

---

## 5. Component Inventory

### 5.1 Shared Native Primitives

| Component | File | Status |
|-----------|------|--------|
| NativeTabBar | [`components/native/NativeTabBar.tsx`](src/components/native/NativeTabBar.tsx) | ✅ Built |
| NativeHeader | [`components/native/NativeHeader.tsx`](src/components/native/NativeHeader.tsx) | ✅ Built |
| SwipeableSheet | [`components/native/SwipeableSheet.tsx`](src/components/native/SwipeableSheet.tsx) | ✅ Built |
| PageTransition | [`components/native/PageTransition.tsx`](src/components/native/PageTransition.tsx) | ✅ Built |
| Native index | [`components/native/index.ts`](src/components/native/index.ts) | ✅ Exports all + TabItem type |

### 5.2 UI Primitives

| Component | File |
|-----------|------|
| Button | [`components/ui/button.tsx`](src/components/ui/button.tsx) |
| Card | [`components/ui/card.tsx`](src/components/ui/card.tsx) |
| Input | [`components/ui/input.tsx`](src/components/ui/input.tsx) |
| Select | [`components/ui/select.tsx`](src/components/ui/select.tsx) |
| Badge | [`components/ui/badge.tsx`](src/components/ui/badge.tsx) |
| DropdownMenu | [`components/ui/dropdown-menu.tsx`](src/components/ui/dropdown-menu.tsx) |
| Label | [`components/ui/label.tsx`](src/components/ui/label.tsx) |
| Textarea | [`components/ui/textarea.tsx`](src/components/ui/textarea.tsx) |
| Skeleton | [`components/ui/skeleton.tsx`](src/components/ui/skeleton.tsx) |
| Toast hook | [`components/ui/use-toast.ts`](src/components/ui/use-toast.ts) |

### 5.3 Layout Components

| Component | File |
|-----------|------|
| Header | [`components/layout/Header.tsx`](src/components/layout/Header.tsx) |
| Sidebar | [`components/layout/Sidebar.tsx`](src/components/layout/Sidebar.tsx) |
| LandingNav | [`components/layout/LandingNav.tsx`](src/components/layout/LandingNav.tsx) |
| LandingFooter | [`components/layout/LandingFooter.tsx`](src/components/layout/LandingFooter.tsx) |
| LanguageSwitcher | [`components/layout/LanguageSwitcher.tsx`](src/components/layout/LanguageSwitcher.tsx) |

### 5.4 Marketing Components

| Component | File |
|-----------|------|
| HeroSection | [`components/marketing/HeroSection.tsx`](src/components/marketing/HeroSection.tsx) |
| DisciplinesSection | [`components/marketing/DisciplinesSection.tsx`](src/components/marketing/DisciplinesSection.tsx) |
| WhySection | [`components/marketing/WhySection.tsx`](src/components/marketing/WhySection.tsx) |
| PricingSection | [`components/marketing/PricingSection.tsx`](src/components/marketing/PricingSection.tsx) |
| FacilitySection | [`components/marketing/FacilitySection.tsx`](src/components/marketing/FacilitySection.tsx) |
| TrialCTASection | [`components/marketing/TrialCTASection.tsx`](src/components/marketing/TrialCTASection.tsx) |

### 5.5 Notification Components

| Component | File |
|-----------|------|
| NotificationBell | [`components/notifications/notification-bell.tsx`](src/components/notifications/notification-bell.tsx) |
| NotificationDropdown | [`components/notifications/notification-dropdown.tsx`](src/components/notifications/notification-dropdown.tsx) |
| NotificationItem | [`components/notifications/notification-item.tsx`](src/components/notifications/notification-item.tsx) |

### 5.6 PWA Components

| Component | File |
|-----------|------|
| PWAInstallPrompt | [`components/pwa/pwa-install-prompt.tsx`](src/components/pwa/pwa-install-prompt.tsx) |
| Offline QR Scanner | [`components/attendance/offline-qr-scanner.tsx`](src/components/attendance/offline-qr-scanner.tsx) |

---

## 6. Database & Infrastructure

### 6.1 Supabase Migrations (9 migrations)

| Migration | Content | Status |
|-----------|---------|--------|
| `000001` | All enum types | ✅ Applied |
| `000002` | Core tables (gyms, profiles, students, coaches, disciplines, etc.) | ✅ Applied |
| `000003` | Operational tables (classes, invoices, payments, PT, rentals, leads, etc.) | ✅ Applied |
| `000004` | RLS policies for 7 roles | ✅ Applied |
| `000005` | Triggers (updated_at, audit, exchange rate, invoice totals) | ✅ Applied |
| `000006` | Seed data (PRO LINE Gym) | ✅ Applied |
| `000007` | Currency preference fix | ✅ Applied |
| `000008` | Demo accounts | ✅ Applied |
| `000009` | Public lead submissions RPC | ✅ Applied |

### 6.2 Library Layer

| Library | File | Purpose |
|---------|------|---------|
| DB Index | [`lib/db/index.ts`](src/lib/db/index.ts) | Dexie.js initialization |
| DB Schema | [`lib/db/schema.ts`](src/lib/db/schema.ts) | IndexedDB table definitions |
| Sync Engine | [`lib/db/sync-engine.ts`](src/lib/db/sync-engine.ts) | Offline sync logic |
| Supabase Client | [`lib/supabase/client.ts`](src/lib/supabase/client.ts) | Browser client |
| Supabase Server | [`lib/supabase/server.ts`](src/lib/supabase/server.ts) | Server component client |
| Supabase Middleware | [`lib/supabase/middleware.ts`](src/lib/supabase/middleware.ts) | Auth middleware |
| Design Tokens | [`lib/design-tokens.ts`](src/lib/design-tokens.ts) | NATIVE token object |
| i18n Helpers | [`lib/i18n/helpers.ts`](src/lib/i18n/helpers.ts) | Locale utilities |
| Utils | [`lib/utils.ts`](src/lib/utils.ts) | cn() helper |
| WhatsApp Types | [`lib/whatsapp/types.ts`](src/lib/whatsapp/types.ts) | WA API types |
| WhatsApp Client | [`lib/whatsapp/client.ts`](src/lib/whatsapp/client.ts) | WA Cloud API client |
| Hooks | [`hooks/useDebounce.ts`](src/hooks/useDebounce.ts) | Debounce hook |

### 6.3 Validators (Zod Schemas)

| Validator | File |
|-----------|------|
| Attendance | [`lib/validators/attendance.schema.ts`](src/lib/validators/attendance.schema.ts) |
| Belts | [`lib/validators/belts.schema.ts`](src/lib/validators/belts.schema.ts) |
| Camps | [`lib/validators/camps.schema.ts`](src/lib/validators/camps.schema.ts) |
| Leads | [`lib/validators/leads.schema.ts`](src/lib/validators/leads.schema.ts) |
| Memberships | [`lib/validators/memberships.schema.ts`](src/lib/validators/memberships.schema.ts) |
| PT | [`lib/validators/pt.schema.ts`](src/lib/validators/pt.schema.ts) |
| Rentals | [`lib/validators/rentals.schema.ts`](src/lib/validators/rentals.schema.ts) |
| Students | [`lib/validators/students.schema.ts`](src/lib/validators/students.schema.ts) |
| Index | [`lib/validators/index.ts`](src/lib/validators/index.ts) |

---

## 7. SSOT Architecture Compliance

**Source:** [MASTER_PLAN.md §SSOT](docs/plans/MASTER_PLAN.md#ssot-architecture--single-source-of-truth)

| SSOT Rule | Status | Evidence |
|-----------|--------|----------|
| DB schema in migration files only | ✅ | 9 migrations in `supabase/migrations/` |
| Generated types never hand-edited | ⚠️ Unknown | Need to verify `src/types/database.ts` is `supabase gen types` output |
| Design tokens in config only | ✅ | `tailwind.config.ts` + `lib/design-tokens.ts` |
| i18n keys in JSON only | ✅ | `i18n/messages/{en,ar,fr}.json` |
| Config in DB tables | ✅ | gyms, membership_plans, exchange_rates tables |
| Zod = form truth | ✅ | 8 validator files |
| No duplicate constants | ✅ | Enums defined in DB migration 000001 |

### i18n Namespace Coverage

| Namespace | en.json | ar.json | fr.json | Notes |
|-----------|---------|---------|---------|-------|
| common | ✅ | ✅ | ✅ | Shared UI strings |
| landing | ✅ | ✅ | ✅ | Added in blocker fix B1 |
| nav | ✅ | ✅ | ✅ | Navigation labels |
| belts | ✅ | ✅ | ✅ | Added in blocker fix B3 |
| leads | ✅ | ✅ | ✅ | Added in blocker fix B4 |
| camps | ✅ | ✅ | ✅ | Added in blocker fix B5 |
| pt | ✅ | ✅ | ✅ | Added in blocker fix B6 |
| rentals | ✅ | ✅ | ✅ | Added in blocker fix B7 |
| reportsDashboard | ✅ | ✅ | ✅ | Reports module |
| settings | ✅ | ✅ | ✅ | Settings module |
| native | ⚠️ Spec'd | ⚠️ Spec'd | ⚠️ Spec'd | In native-mobile-design-spec.md |

---

## 8. Phase C.2 Gap Analysis Summary

The dispatch spec ([`dispatch-spec.json`](../../../Shared/missions/phase-c-refinements/dispatch-spec.json)) defines 5 **independent** parallel agents. No shared files. No dependencies. Here's what each agent must accomplish:

### Agent C1: Belt Engine
- **Files:** `belts/page.tsx`, `belt-engine-client.tsx`, `000006_seed_data.sql`
- **Gaps:** Stepper workflow, demo student seed data, promotion auto-refresh
- **Severity:** MEDIUM (2 medium, 1 high)

### Agent C2: Lead Pipeline
- **Files:** `leads/page.tsx`, `leads-client.tsx`
- **Gaps:** Status dropdown per lead, trial scheduling, convert-to-student button
- **Severity:** HIGH (1 high — wireframe feel)

### Agent C3: Camps & Events
- **Files:** `camps/page.tsx`, `camps-client.tsx`, `(marketing)/page.tsx`
- **Gaps:** Create form (modal or new page), landing page integration, detail view
- **Severity:** HIGH (create button doesn't work)

### Agent C4: PT Packages
- **Files:** `pt/page.tsx`, `pt-client.tsx`
- **Gaps:** Package creation form, student assignment UI
- **Severity:** HIGH (create button doesn't work)

### Agent C5: Coach Rentals
- **Files:** `rentals/page.tsx`, `rentals-client.tsx`
- **Gaps:** Weekly calendar grid, booking form with conflict check, waiver upload section
- **Severity:** MEDIUM (3 medium items)

---

## 9. Phase Readiness Summary

```
┌────────────────────────────────────────────────────────────────┐
│                     PHASE READINESS MAP                         │
│                                                                 │
│  Phase A: ████████████████████ 100% — 9 core modules            │
│  Phase B: ████████████████████ 100% — 4 portals + route arch   │
│  Phase C: ████████████░░░░░░░░  60% — C.1 done (all 5 pages    │
│            exist with data fetching), C.2 refinement pending    │
│  Phase D: ██░░░░░░░░░░░░░░░░░░  10% — manifest.json, offline   │
│            page, PWA prompt, WA types/client exist. No SW.     │
│            No Dexie schema. No sync engine.                    │
│  Phase E: ████████░░░░░░░░░░░░  40% — Reports, Settings,       │
│            Profile are beyond stub. Still need:                │
│            Design QA, Security audit, Performance, Launch.     │
└────────────────────────────────────────────────────────────────┘
```

---

*Map compiled from: MASTER_PLAN.md (v2.1), proline-gym-platform-blueprint.md (v1.0), proline-gym-technical-architecture.md (v1.0), PHASE_C_TEST_REGISTER.md, native-mobile-design-spec.md (v1.0), dispatch-spec.json, and actual source code in `src/app/[locale]/` tree.*
