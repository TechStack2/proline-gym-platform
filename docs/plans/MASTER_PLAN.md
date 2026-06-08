# PRO LINE Gym Platform — Master Development Plan

> **Version:** 2.1 — Arsenal-Reviewed
> **Date:** June 7, 2026
> **Status:** ACTIVE — Tracking MVP Development
> **Arsenal Review:** [ECC](https://github.com/anthropics/everything-claude-code) | [Superpowers](https://github.com/obra/superpowers) | [Karpathy Principles](https://github.com/forrestchang/andrej-karpathy-skills) | [Open Design](https://github.com/nexu-io/open-design)
> **Sources:** [Battle Plan](../../../../Config/plans/proline-gym-mvp-battle-plan.md) | Continue Session `cb55357e` | Dispatch Specs (`proline-mvp-research`, `proline-db-retry`, `phase4-core-modules`)
> **Project Root:** `Agentics/Projects/proline-gym-platform/`
> **Reference Docs:** [Platform Blueprint](./proline-gym-platform-blueprint.md) | [Technical Architecture](./proline-gym-technical-architecture.md) | [Client Proposal](../../../../Clients/_active/proline-gym/docs/proline-gym-proposal.md)

---

## ⚠️ Arsenal Review Findings (June 7, 2026)

This plan was audited against the four Arsenal frameworks installed at `Agentics/Arsenal/`. The following gaps were identified and resolved in v2.1:

| # | Finding | Framework | Severity | Resolution |
|---|---|---|---|---|
| 1 | **No testing strategy** — Zero mention of unit/integration/E2E tests, TDD workflow, or 80% coverage mandate | ECC AGENTS.md | CRITICAL | Added Testing Strategy section + per-phase test gates |
| 2 | **No SSOT enforcement** — Missing explicit reference to generated DB types (`src/types/database.ts`), Zod schemas, and enums file as Single Source of Truth | ECC AGENTS.md | HIGH | Added SSOT Architecture section defining the truth chain |
| 3 | **Security review relegated to final phase** — Should be proactive, per-phase | ECC security-reviewer | HIGH | Added security-reviewer gate to every phase |
| 4 | **No code-review workflow** — ECC mandates code-reviewer after every module write | ECC AGENTS.md | HIGH | Added per-phase code-reviewer invocation |
| 5 | **No concrete success criteria** — Violates Karpathy Goal-Driven Execution principle | Karpathy Principles §4 | HIGH | Added verifiable success gates to every phase |
| 6 | **Missing Integration Gate spec** — Phase C mentions `/quality-gate` but doesn't define what it checks | ECC commands | MEDIUM | Defined quality-gate checklist (types, lint, build, RTL, i18n, RLS, Lighthouse) |
| 7 | **No database-reviewer invocation** — ECC has a PostgreSQL/Supabase reviewer agent that should audit schema changes | ECC database-reviewer | MEDIUM | Added database-reviewer gate for any phase touching migrations |
| 8 | **Missing checkpoint/save-session** — No explicit checkpoint workflow | ECC commands | MEDIUM | Added `/checkpoint` gates to each phase boundary |

---

## Executive Summary

This master plan consolidates ALL planning work done across multiple tools (Continue, OpenCode, manual planning) into a single, trackable document. It maps the original 7-phase Battle Plan against the A→E execution phases developed during Continue sessions, reconciles the `proline-db-retry` recovery effort, and provides a clear "You Are Here" marker.

### Plan Genealogy

| Plan Document | Role | Date |
|---|---|---|
| `Config/plans/proline-gym-mvp-battle-plan.md` | Original 7-phase blueprint (the WHAT) | June 6, 2026 |
| `Shared/missions/proline-mvp-research/` | Phase 0: 9 parallel research agents | June 6, 2026 |
| `Shared/missions/proline-db-retry/` | **Recovery plan** — DB schema re-dispatched into 3 agents after token limit failure | June 6, 2026 |
| `Shared/missions/phase4-core-modules/` | Phase 4: 4 parallel code agents building core modules | June 6, 2026 |
| Continue Session `cb55357e` | Strategic re-plan: Phases A→E with 5-agent Phase C dispatch | June 6-7, 2026 |

### Key Architectural Decisions (Locked)

| ADR | Decision | Rationale |
|---|---|---|
| ADR-1 | **PWA over native apps** | Single codebase. Offline-capable. No App Store dependency. |
| ADR-2 | **Supabase over custom backend** | Managed PostgreSQL + Auth + Realtime + RLS. Cuts backend code ~60%. |
| ADR-3 | **4 portals, not 7 roles** | UI consolidation: Staff Dashboard (owner/head_coach/receptionist), Coach App (coach), Member Portal (student/parent), External Coach (within rentals). 7 roles preserved at DB/RLS level. |
| ADR-4 | **English default, Arabic primary UX** | `defaultLocale: 'en'` per client. Arabic RTL is the primary UX target. French tertiary. |
| ADR-5 | **Email/Password auth for MVP demo** | No Twilio/WhatsApp dependency for demo. 4 pre-seeded demo accounts. Phone OTP architecture preserved for V2. |
| ADR-6 | **Dual-currency at DB level** | `amount_usd`, `amount_lbp`, `exchange_rate`, `rate_date` on all financial tables. |
| ADR-7 | **Offline-first (Phase D)** | Dexie.js IndexedDB mirror + custom sync engine. Critical for Lebanon power cuts. |

### Gym Identity (from social media research)

| Field | Value |
|---|---|
| **Name** | PRO LINE Gym (برو لاين جيم) |
| **Location** | Sky Business Center, Baabda, Lebanon |
| **Phone** | +961 70 628 601 |
| **Email** | alifakih998@gmail.com |
| **Website** | https://prolinegym.lb |
| **Programs** | Muay Thai, Boxing, Fitness, Zumba, Ladies Training, Kids |
| **Brand Colors** | Crimson Red `#cd1419`, Dark Charcoal `#252525` |
| **Ownership** | Fakih Brothers |

---

## Phase Mapping: Battle Plan ↔ Execution Phases

| Execution Phase | Battle Plan Phases | Status | Key Deliverables |
|---|---|---|---|
| **Phase A** | Phases 0, 1, 2, 3, 4 | ✅ **COMPLETE** | Foundation + Core Modules + Landing Page |
| **Phase B** | Phase 2-3 (portal routing), Phase 4 (role architecture) | ✅ **COMPLETE** | Portal Architecture + Role-Based Routing + Native Feel |
| **Phase C** | Phase 5 | ⏳ **NEXT** | Secondary Modules (5 parallel agents) |
| **Phase D** | Phase 6 | ☐ **PLANNED** | Offline Sync + PWA + WhatsApp Integration |
| **Phase E** | Phase 7 | ☐ **PLANNED** | Polish + Security + Design QA |

---

## SSOT Architecture — Single Source of Truth

Every concept in the platform MUST have exactly ONE authoritative definition. Duplication creates drift. Drift creates bugs.

### The Truth Chain

```
┌─────────────────────────────────────────────────────────────┐
│ SSOT TRUTH CHAIN — When in doubt, trust in this order       │
│                                                              │
│  Layer 1: PostgreSQL Schema (supabase/migrations/)          │
│     ↓  Generated via: supabase gen types typescript         │
│  Layer 2: TypeScript Types (src/types/database.ts)          │
│     ↓  Validated against DB at CI time                      │
│  Layer 3: Zod Schemas (src/lib/validators/*.ts)             │
│     ↓  Used by Server Actions & Client forms                │
│  Layer 4: Server Actions / API Routes                       │
│     ↓  Consumed by Client Components                        │
│  Layer 5: i18n Keys (src/i18n/messages/*.json)              │
│     ↓  Rendered in UI                                       │
│  Layer 6: UI Components (src/components/*)                  │
│                                                              │
│ VIOLATION DETECTION: TS/DB drift checked in CI              │
│ Command: npx supabase gen types typescript --local          │
└─────────────────────────────────────────────────────────────┘
```

### SSOT Rules (Enforced by ECC Agents)

| Rule | What It Means | Enforced By |
|---|---|---|
| **One schema source** | DB schema lives ONLY in migration files. Never duplicate table shapes in comments, docs, or config files. | `database-reviewer` agent |
| **Generated types** | `src/types/database.ts` is NEVER hand-edited. Always generated via `supabase gen types` | CI gate |
| **One token source** | Design tokens live ONLY in `tailwind.config.ts` + `src/lib/design-tokens.ts`. Never hardcode colors/spacing. | `code-reviewer` agent |
| **One i18n source** | Translation keys live ONLY in `src/i18n/messages/*.json`. Never hardcode strings in UI. | `code-reviewer` agent |
| **One config source** | Gym settings, membership plans, exchange rates → DB tables. Never env vars or hardcoded constants. | `architect` agent |
| **Zod = form truth** | All form validation uses Zod schemas from `src/lib/validators/`. Server and client share schemas. | `code-reviewer` agent |
| **No duplicate constants** | Enums/constants defined once in DB → generated to TS → used everywhere. | `security-reviewer` agent |

---

## Testing Strategy

### Coverage Mandate (from ECC AGENTS.md)

**Minimum: 80% coverage.** Required across unit + integration + E2E.

### TDD Workflow

```
1. Write test first (RED)   — test FAILS
2. Write minimal code (GREEN) — test PASSES
3. Refactor (IMPROVE)        — verify coverage 80%+
```

### Per-Phase Test Requirements

| Phase | Unit Tests | Integration Tests | E2E Tests |
|---|---|---|---|
| **A** (Complete) | Retro-fit: Students CRUD, Auth flow | Auth + RLS probe | Login → Dashboard → Register → Payment |
| **C** (Next) | Belt logic, Lead transitions, Camp validations, PT credit calc, Rental conflict detection | Belt promotion RLS, Lead conversion, Camp registration, PT session debit, Rental booking | Each module's key workflow E2E |
| **D** | Sync engine, Offline queue, WhatsApp templates | Offline→Online sync, QR attendance sync, Webhook parsing | Full offline→online cycle |
| **E** | Report generation, PDF export, Notifications | Cross-role security probes, Performance benchmarks | All 4 portals walkthrough |

---

## Governance Gates (Per Phase)

Every phase MUST pass these ECC gates:

```
🏗️ /plan           → Generate implementation spec per module
💻 Implement        → Write code (subagent-driven)
🔍 /code-review    → ECC code-reviewer agent per module
🗄️ database-reviewer → Audit schema changes (if migrations)
🔐 security-reviewer → Audit auth, RLS, input validation
📋 /quality-gate   → 10-point checklist (see below)
🔖 /checkpoint     → Commit + push + update MASTER_PLAN.md
💾 /save-session   → Persist workspace state
```

### Quality Gate Checklist (`/quality-gate`)

| # | Check | Method |
|---|---|---|
| 1 | TypeScript compiles | `npx tsc --noEmit` |
| 2 | Linter passes | `npx eslint . --ext .ts,.tsx` |
| 3 | Build succeeds | `npx next build` |
| 4 | All 3 locales render | Manual: `/en`, `/ar`, `/fr` |
| 5 | RTL layout correct | Manual: Arabic pages RTL |
| 6 | i18n keys complete | No hardcoded strings — new UI text has keys |
| 7 | RLS policies verified | Cross-role probe: login as each role |
| 8 | Mobile responsive | 375px viewport test |
| 9 | No dead code/stubs | All "Under Development" pages identified |
| 10 | Build exit code 0 | CI-equivalent check |

---

## Phase A — Foundation & Core Modules ✅ COMPLETE

### What Was Built

#### A0: Seed Data Rewrite
- ✅ Gym: PRO LINE Gym, Baabda, Sky Business Center
- ✅ Disciplines: 6 programs from social media (Muay Thai, Boxing, Fitness, Zumba, Ladies Training, Kids)
- ✅ Belt hierarchies: Only Muay Thai (prajoud) and Boxing (3 tiers). Fitness/Kids/Zumba/Ladies have no belts.
- ✅ Membership plans: 3 tiers (Monthly $50, Quarterly $130, Annual $450)
- ✅ PT packages: 3 packages (5/10/20 sessions)
- ✅ Rentals: 3 facility spaces
- ✅ Migration `000009_public_lead_submissions.sql`

#### A1: Root Layout Refactor
- ✅ Root `layout.tsx` stripped to clean shell (no sidebar, no header)
- ✅ All 16 dashboard feature pages moved into `(dashboard)/` route group
- ✅ `(dashboard)/layout.tsx` created with Sidebar + Header + Auth guard
- ✅ `(marketing)/layout.tsx` created with LandingNav + LandingFooter

#### A2-A4: Landing Page (7 Sections)
- ✅ **Hero Section** — Logo, tagline, CTAs, IG follower count
- ✅ **Disciplines Section** — 6 program cards, server-fetched from DB
- ✅ **Why PRO LINE Section** — 3-column value props
- ✅ **Pricing Section** — 3 plans with Best Value badge
- ✅ **Facility Section** — Map embed, contact cards
- ✅ **Trial CTA Section** — Name/Phone/Program form → Supabase `submit_public_lead` RPC
- ✅ **Footer** — Social links, contact, hours
- ✅ LandingNav (transparent→solid on scroll) + LandingFooter

#### A5: Auth Simplification
- ✅ Email/password login with PRO LINE branding
- ✅ 4 demo accounts (owner, coach, reception, student) — password: `ProlineDemo2024!`
- ✅ Demo account card with one-click fill
- ✅ "Back to site" link
- ✅ Language switcher on login page

#### A6: i18n
- ✅ Default locale flipped to `en` in `routing.ts`
- ✅ App name corrected to "PRO LINE Gym" across all 3 locales
- ✅ 439 translation keys per locale (ar/en/fr)
- ✅ Landing namespace added (`landing.*` keys)

#### A7: Style Guide
- ✅ `/en/design` style guide page (dev reference)

#### Migration Stack (9 migrations)
| Migration | Content |
|---|---|
| `000001` | All enum types |
| `000002` | Core tables (gyms, profiles, students, coaches, disciplines, etc.) |
| `000003` | Operational tables (classes, invoices, payments, PT, rentals, leads, etc.) |
| `000004` | RLS policies for 7 roles |
| `000005` | Triggers (updated_at, audit, exchange rate, invoice totals, invoice numbers) |
| `000006` | Seed data (PRO LINE Gym data) |
| `000007` | Currency preference fix |
| `000008` | Demo accounts |
| `000009` | Public lead submissions RPC |

### Modules Built (Phase 4 — Parallel Dispatch)

| Module | Agent | Files | Status |
|---|---|---|---|
| **Core Gym Ops** | agent-core-gym-ops | Students CRUD, Coaches CRUD, Disciplines CRUD | ✅ Built |
| **Classes & Schedule** | agent-classes-schedule | Classes CRUD, Weekly Schedule, Enrollment | ✅ Built |
| **Payments & Invoicing** | agent-payments-invoicing | Payments CRUD, Invoices CRUD, Membership Plans | ✅ Built |
| **Attendance Engine** | agent-attendance-engine | Attendance Dashboard, History, Reports | ✅ Built |

---

## Phase B — Portal Architecture & Native Feel ✅ COMPLETE

### What Was Built

#### Agent A: Role-Based Routing
- ✅ `PORTAL_ROLE_MAP` type definitions (`src/types/roles.ts`)
- ✅ `ROLE_PORTAL_MAP` mapping: owner/head_coach/receptionist → `/dashboard`, coach → `/coach`, student/parent → `/portal`
- ✅ Middleware role-based redirects:
  - Authenticated user on `/auth/login` → redirected to role-specific portal
  - Coach/student/parent trying to access `/dashboard` → redirected to correct portal
- ✅ Protected route paths expanded to include `/coach` and `/portal`

#### Agent B: Staff Dashboard Layout
- ✅ `(dashboard)/layout.tsx` — Sidebar + Header + Auth guard
- ✅ Sidebar receives `role` prop for filtered menu visibility
- ✅ Role-based menu visibility:
  - **Owner**: Full access (all 16 items)
  - **Head Coach**: Students, Classes, Schedule, Attendance, Coaches, PT, Reports, Profile
  - **Receptionist**: Students, Payments, Invoices, Leads, Camps, Profile

#### Agent C: Coach Mobile App
- ✅ `(coach)/layout.tsx` — Mobile-first layout with bottom tab bar
- ✅ `CoachBottomNav.tsx` — 3 tabs: Schedule | Attendance | Profile
- ✅ `(coach)/schedule/page.tsx` — Coach's class schedule
- ✅ `(coach)/attendance/page.tsx` — Attendance taking page
- ✅ `(coach)/students/page.tsx` — Coach's student list
- ✅ `(coach)/profile/page.tsx` — Coach profile

#### Agent D: Member Portal (Student/Parent)
- ✅ `(portal)/layout.tsx` — Mobile-first layout with bottom tab bar
- ✅ `PortalBottomNav.tsx` — 3 tabs: Schedule | Billing | Profile
- ✅ `(portal)/schedule/page.tsx` — Member's schedule view
- ✅ `(portal)/billing/page.tsx` — Member's billing/invoice view  
- ✅ `(portal)/profile/page.tsx` — Member profile

#### Agent E: Dashboard Live Stats
- ✅ Dashboard stats wired to real Supabase aggregation queries
- ✅ Stat cards: Total Students, Active Memberships, Today's Classes, Monthly Revenue
- ✅ Quick action buttons: Register Student, Record Payment, Take Attendance
- ✅ Recent activity feed (placeholder structure)

### Route Architecture (Final)

```
src/app/[locale]/
├── (marketing)/          # Public landing page (no auth)
│   ├── layout.tsx        #   LandingNav + LandingFooter
│   └── page.tsx          #   7-section landing page
├── auth/                 # Auth (login, OTP verify)
│   ├── layout.tsx
│   └── login/
├── (dashboard)/          # Staff Portal (owner/head_coach/receptionist)
│   ├── layout.tsx        #   Sidebar + Header + auth guard
│   ├── dashboard/        #   Live stats + quick actions
│   ├── students/         #   Full CRUD + search + filters
│   ├── classes/          #   Full CRUD + enrollment
│   ├── schedule/         #   Weekly calendar view
│   ├── attendance/       #   Dashboard + history + reports
│   ├── payments/         #   Full CRUD + stats
│   ├── invoices/         #   Full CRUD + stats
│   ├── coaches/          #   Full CRUD
│   ├── disciplines/      #   Full CRUD
│   ├── camps/            #   🏗️ Stub (Phase C)
│   ├── leads/            #   🏗️ Stub (Phase C)
│   ├── pt/               #   🏗️ Stub (Phase C)
│   ├── rentals/          #   🏗️ Stub (Phase C)
│   ├── reports/          #   🏗️ Stub (Phase E)
│   ├── settings/         #   🏗️ Stub (Phase E)
│   └── profile/          #   🏗️ Stub (Phase E)
├── (coach)/              # Coach Mobile App
│   ├── layout.tsx        #   Mobile-first + bottom tab bar
│   ├── schedule/         #   Coach's daily schedule
│   ├── attendance/       #   Roster + check-in
│   ├── students/         #   My students list
│   └── profile/          #   Coach profile
├── (portal)/             # Member Self-Service
│   ├── layout.tsx        #   Mobile-first + bottom tab bar
│   ├── schedule/         #   My schedule
│   ├── billing/          #   My invoices/payments
│   └── profile/          #   My profile
└── layout.tsx            # Root shell (RTL-aware, i18n provider)
```

---

## Phase C — Secondary Modules ⏳ NEXT (CURRENT)

### 5-Agent Parallel Dispatch Plan

All 5 agents are independent. No shared files. No dependencies. Can run in parallel.

| Agent | Module | Route | Key Features | Success Criterion |
|---|---|---|---|---|
| **C1** | Belt Engine | `(dashboard)/belts/` | Promotion workflow, progress visualization, eligibility check, belt timeline | Coach promotes student → DB updates → profile shows new belt → timeline reflects change |
| **C2** | Lead Pipeline | `(dashboard)/leads/` | Status board (kanban), trial scheduling, convert-to-student | Landing form submission → leads board → trial scheduled → status updated → convert to student |
| **C3** | Camps & Events | `(dashboard)/camps/` | Camp creation, registration, pickup authorization, daily attendance | Staff creates camp → parent registers → attendance logged daily → pickup verified |
| **C4** | PT Packages | `(dashboard)/pt/` | Package creation, credit tracking, session scheduling, expiry enforcement | Package created → sessions consumed on use → remaining credits tracked → expiry enforced |
| **C5** | Coach Rentals | `(dashboard)/rentals/` | Booking calendar, external coach profiles, digital waivers, payment tracking | External coach books slot → pays → waiver signed → booking confirmed → conflict detection |

### Agent Contract (Each Agent Gets)

```
┌─────────────────────────────────────────────────────┐
│ AGENT CONTRACT                                       │
│                                                      │
│ 📁 Files to touch:   Only module folder + migration   │
│ 🗄️ Migration:       Numbered SQL (0010-0014)         │
│ 🌐 i18n Namespace:  Own section in en/ar/fr.json     │
│ 🧩 Components:      src/components/[module]/         │
│ 🎯 Success Criterion: Single testable condition       │
│ 🚫 Off-limits:      Core modules, layouts, middleware │
│                                                      │
│ Output: Working CRUD + 1 key workflow + i18n keys     │
└─────────────────────────────────────────────────────┘
```

### DB Tables Already Seeded (Ready for Modules)

| Module | Existing Tables | Seed Data Ready |
|---|---|---|
| Belt Engine | `belt_hierarchies`, `belt_promotions`, `students.current_belt_rank` | ✅ Muay Thai + Boxing tiers |
| Lead Pipeline | `leads`, `trial_classes` | ✅ Public lead RPC (`submit_public_lead`) |
| Camps & Events | `camps`, `camp_registrations`, `camp_attendance` | Table exists, needs seed |
| PT Packages | `pt_packages`, `pt_sessions` | ✅ 3 packages seeded |
| Coach Rentals | `rentals`, `rental_bookings`, `external_coaches`, `documents` (waivers) | ✅ 3 spaces seeded |

### Files Expected Per Agent

| Agent | New Files | Modified Files |
|---|---|---|
| **C1 Belt Engine** | `(dashboard)/belts/page.tsx`, `components/belts/BeltProgress.tsx`, `components/belts/PromotionForm.tsx`, `i18n/belts.*` | `i18n/en.json`, `i18n/ar.json`, Sidebar menu |
| **C2 Lead Pipeline** | `(dashboard)/leads/` pages (rewrite from stub), `components/leads/LeadBoard.tsx`, `components/leads/TrialScheduler.tsx`, `i18n/leads.*` | `i18n/en.json`, `i18n/ar.json` |
| **C3 Camps** | `(dashboard)/camps/` pages (rewrite from stub), `components/camps/CampForm.tsx`, `components/camps/RegistrationList.tsx`, `components/camps/PickupAuth.tsx`, `i18n/camps.*` | `i18n/en.json`, `i18n/ar.json` |
| **C4 PT Packages** | `(dashboard)/pt/` pages (rewrite from stub), `components/pt/PackageCard.tsx`, `components/pt/SessionTracker.tsx`, `i18n/pt.*` | `i18n/en.json`, `i18n/ar.json` |
| **C5 Rentals** | `(dashboard)/rentals/` pages (rewrite from stub), `components/rentals/BookingCalendar.tsx`, `components/rentals/WaiverForm.tsx`, `i18n/rentals.*` | `i18n/en.json`, `i18n/ar.json` |

### Phase C Execution Strategy

```
┌─────────────────────────────────────────────────────────────┐
│ PHASE C — 5-AGENT PARALLEL DISPATCH                         │
│                                                              │
│  C1: Belt Engine ────┐                                      │
│  C2: Lead Pipeline ──┤                                      │
│  C3: Camps & Events ─┼── All 5 run simultaneously ──►       │
│  C4: PT Packages ────┤   (zero shared files)               │
│  C5: Coach Rentals ──┘                                      │
│                                                              │
│  Integration Gate: /quality-gate after all 5 complete        │
│  Verify: build passes, i18n complete, routes work           │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase D — Offline Sync & PWA ☐ PLANNED

### Tasks

| # | Task | Details |
|---|---|---|
| D1 | **Dexie.js Client Schema** | Mirror critical PostgreSQL tables in IndexedDB: students, classes, attendance, invoices, payments |
| D2 | **Sync Engine** | Outbox queue (local → server), pull sync (server → local), conflict resolution (last-write-wins + field-level merge) |
| D3 | **Offline QR Attendance** | QR scanner + attendance marking works entirely offline. Queue records → sync when online |
| D4 | **Service Worker + PWA Manifest** | next-pwa setup, Workbox caching strategies (NetworkFirst for API, CacheFirst for static, StaleWhileRevalidate for images) |
| D5 | **WhatsApp Cloud API Integration** | Template management (tri-lingual AR/EN/FR), webhook handler (Supabase Edge Function), message logging |
| D6 | **Install Prompt + Offline Fallback** | PWA install UX, offline page (tri-lingual: "You are offline. The app is working with saved data.") |

### Technology Stack (Phase D)

| Component | Technology |
|---|---|
| Client DB | Dexie.js (IndexedDB wrapper) |
| Sync Engine | Custom (~500 LOC): push queue + pull sync + conflict resolution |
| Service Worker | next-pwa + Workbox |
| Offline QR | html5-qrcode (offline-capable) |
| WhatsApp API | WhatsApp Cloud API (direct, Supabase Edge Function) |
| PWA Manifest | Auto-generated per locale (ar/en/fr splash screens) |

---

## Phase E — Polish, Security & Launch ☐ PLANNED

### Tasks

| # | Task | Details |
|---|---|---|
| E1 | **Tri-lingual Design QA** | Every screen reviewed in AR/EN/FR. RTL layout audit. |
| E2 | **Reports Module** | Attendance reports, revenue reports, belt progression reports. Export to PDF/CSV. |
| E3 | **Settings Module** | Gym profile, exchange rates, membership plans management, discipline/belt management. |
| E4 | **Profile Pages** | Staff profile, student profile, coach profile. |
| E5 | **Notifications Center** | In-app notification bell, read/unread tracking, action links. |
| E6 | **Security Audit** | RLS policy audit, auth edge cases, offline data encryption, PII handling for minors. |
| E7 | **Performance Audit** | Lighthouse PWA score ≥ 95, Core Web Vitals, mobile device testing (iPhone + budget Android). |
| E8 | **Backup & DR** | Supabase daily backups, PITR, manual export script, incident response plan. |
| E9 | **Launch Checklist** | Domain setup (prolinegym.lb), Vercel deployment, Supabase production project, env separation. |

---

## Frameworks & Governance (Always Active)

### Arsenal Frameworks

| Framework | Application |
|---|---|
| 🧠 **Karpathy Principles** | Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution — govern EVERY step |
| ⚡ **Superpowers** | Brainstorming → Design → Plan → Subagent Execution → Review → Deliver per module |
| 🏗️ **ECC** | `/plan` for module specs, `/code-review` after each phase, `/quality-gate` before promotion |
| 🚀 **Parallel Dispatch** | Phase A: 9 research agents. Phase 4: 4 code agents. Phase C: 5 code agents. Phase D: 6 agents. |

### Quality Gates (Per Phase)

| Gate | When | Criteria |
|---|---|---|
| `/code-review` | After each module | Lint passes, types check, no hardcoded strings, i18n complete |
| `/quality-gate` | Before phase promotion | `tsc --noEmit` clean, `next build` passes, all 3 locales render, RTL layout correct |
| `/checkpoint` | After each phase | Commit + push, update this master plan status |

---

## Current Project State Snapshot

### ✅ Done
- 9 Supabase migrations (full DB schema + RLS + seeds + demo accounts)
- 439 i18n keys per locale (ar/en/fr)
- Landing page (7 sections) with public lead capture
- 4-portal route architecture (marketing, dashboard, coach, portal)
- 9 core dashboard modules built (dashboard, students, classes, schedule, attendance, payments, invoices, coaches, disciplines)
- 4 demo accounts (owner, coach, reception, student)
- Role-based middleware redirects
- Role-filtered Sidebar menu
- Coach mobile app layout + 4 pages
- Member portal layout + 3 pages
- Dashboard live stats from Supabase

### 🏗️ Stubs (7 pages — Phase C targets)
- `(dashboard)/camps/page.tsx`
- `(dashboard)/leads/page.tsx`
- `(dashboard)/pt/page.tsx`
- `(dashboard)/rentals/page.tsx`
- `(dashboard)/reports/page.tsx`
- `(dashboard)/settings/page.tsx`
- `(dashboard)/profile/page.tsx`

### ❌ Not Yet Started
- Dexie.js offline DB (Phase D)
- Sync engine (Phase D)
- Service Worker / PWA manifest (Phase D)
- WhatsApp Cloud API integration (Phase D)
- Offline QR attendance (Phase D)
- Notifications system (Phase E)
- PDF/CSV report exports (Phase E)
- Security audit (Phase E)
- Production deployment (Phase E)

---

## Arsenal Execution Framework — How We Build

This plan is executed using four Arsenal frameworks combined into a single repeatable workflow. Every phase from here forward follows this exact pattern.

### Framework Stack

| Framework | Role in Execution | Source |
|---|---|---|
| **🧠 Karpathy Principles** | Governs ALL decisions: Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution | `Arsenal/karpathy-skills/` |
| **🏗️ ECC** | Agents (architect, planner, code-reviewer, security-reviewer, database-reviewer) + Commands (`/plan`, `/code-review`, `/quality-gate`, `/checkpoint`) | `Arsenal/ecc/` |
| **⚡ Superpowers** | Workflow skills: `brainstorming` → `writing-plans` → `subagent-driven-development` / `dispatching-parallel-agents` → `finishing-a-development-branch` | `Arsenal/superpowers/` |
| **🎨 Open Design** | Design system generation (Tier 1 wireframes now, Tier 2-3 when installed) | `Arsenal/open-design/` |

### The Execution Workflow (Per Phase)

```
┌──────────────────────────────────────────────────────────────────┐
│ SUPERPOWERS WORKFLOW — Repeated for every phase                  │
│                                                                   │
│  1. BRAINSTORM (superpowers:brainstorming)                       │
│     └─ Explore context, ask clarifying questions, propose        │
│        approaches, present design, get approval, write spec      │
│                                                                   │
│  2. PLAN (superpowers:writing-plans → ECC /plan)                 │
│     └─ Translate approved design into bite-sized tasks with      │
│        exact file paths, test requirements, commit steps         │
│                                                                   │
│  3. EXECUTE (superpowers:subagent-driven-development)            │
│     ┌─ Per task:                                                 │
│     │   a. Dispatch implementer subagent                         │
│     │   b. Implementer: implements → tests → commits → self-review│
│     │   c. Dispatch spec reviewer → confirm matches plan         │
│     │   d. Dispatch code quality reviewer → approve quality      │
│     │   e. Fix issues → re-review → mark complete                │
│     └─ After all tasks: final code-reviewer for entire phase    │
│                                                                   │
│  4. VERIFY (ECC /quality-gate + /code-review)                    │
│     └─ 10-point quality gate: types, lint, build, RTL, i18n,     │
│        RLS, mobile, dead code, build exit code                    │
│                                                                   │
│  5. CHECKPOINT (ECC /checkpoint + /save-session)                 │
│     └─ Commit + push + update MASTER_PLAN.md status              │
│                                                                   │
│  6. FINISH (superpowers:finishing-a-development-branch)          │
│     └─ Verify tests, present options, execute merge              │
└──────────────────────────────────────────────────────────────────┘
```

### When to Dispatch Parallel Agents vs. Subagent-Driven

| Scenario | Use | Reason |
|---|---|---|
| Tasks are **independent** (no shared files) | `dispatching-parallel-agents` | All run simultaneously — 3-5x speedup |
| Tasks have **shared dependencies** or sequential order | `subagent-driven-development` | One at a time with two-stage review per task |
| Single complex module with multiple files | `subagent-driven-development` | Fresh subagent per task, no context pollution |
| Multiple modules in a phase (like Phase C) | `dispatching-parallel-agents` | 5 agents dispatched simultaneously |

### Model Selection (from Superpowers)

| Task Type | Model | Examples |
|---|---|---|
| **Mechanical** (1-2 files, clear spec) | Fast/cheap model | Simple CRUD forms, i18n additions |
| **Integration** (multi-file coordination) | Standard model | Component with DB query + form + validation |
| **Architecture/Review/Design** | Most capable model | Plan review, security audit, schema design |

### Phase C Execution Playbook

```
┌──────────────────────────────────────────────────────────────────┐
│ PHASE C — SECONDARY MODULES (5 parallel agents)                  │
│                                                                   │
│ SKILL: superpowers:dispatching-parallel-agents                   │
│ REASON: 5 independent modules, zero shared files, no deps        │
│                                                                   │
│ Step 1: /plan "Phase C — Secondary Modules"                      │
│   └─ ECC planner generates per-module implementation specs       │
│                                                                   │
│ Step 2: Dispatch 5 implementer subagents IN PARALLEL             │
│                                                                   │
│   ┌─────────────────────────────────────────────────────────────┐│
│   │ AGENT C1: Belt Engine                                       ││
│   │ ─────────────────────────────────────                       ││
│   │ Scope: (dashboard)/belts/ only                               ││
│   │ Files: ~4 new files (pages, components, i18n)               ││
│   │ Migration: 0010_belt_engine.sql (if needed)                  ││
│   │ Success: Promote student → DB updates → belt changes        ││
│   │ Review: Spec compliance → Code quality → Approved           ││
│   ├─────────────────────────────────────────────────────────────┤│
│   │ AGENT C2: Lead Pipeline                                     ││
│   │ ─────────────────────────────────────                       ││
│   │ Scope: (dashboard)/leads/ only                               ││
│   │ Files: ~4 new files (rewrite from stub)                     ││
│   │ Success: Landing form → leads board → trial scheduled       ││
│   │ Review: Spec compliance → Code quality → Approved           ││
│   ├─────────────────────────────────────────────────────────────┤│
│   │ AGENT C3: Camps & Events                                    ││
│   │ ─────────────────────────────────────                       ││
│   │ Scope: (dashboard)/camps/ only                               ││
│   │ Files: ~5 new files (creation, registration, pickup)        ││
│   │ Success: Staff creates camp → parent registers → pickup OK  ││
│   │ Review: Spec compliance → Code quality → Approved           ││
│   ├─────────────────────────────────────────────────────────────┤│
│   │ AGENT C4: PT Packages                                       ││
│   │ ─────────────────────────────────────                       ││
│   │ Scope: (dashboard)/pt/ only                                  ││
│   │ Files: ~4 new files (packages, credit tracking, sessions)   ││
│   │ Success: Package created → sessions consumed → expiry OK    ││
│   │ Review: Spec compliance → Code quality → Approved           ││
│   ├─────────────────────────────────────────────────────────────┤│
│   │ AGENT C5: Coach Rentals                                     ││
│   │ ─────────────────────────────────────                       ││
│   │ Scope: (dashboard)/rentals/ only                             ││
│   │ Files: ~5 new files (calendar, booking, waivers)            ││
│   │ Success: Coach books → pays → waiver signed → confirmed     ││
│   │ Review: Spec compliance → Code quality → Approved           ││
│   └─────────────────────────────────────────────────────────────┘│
│                                                                   │
│ Step 3: PER AGENT — Two-stage review                             │
│   ┌─ Stage 1: Spec reviewer checks code matches plan             │
│   │  └─ Fix gaps → re-review → ✅ compliant                      │
│   └─ Stage 2: Code quality reviewer checks standards             │
│      └─ Fix issues → re-review → ✅ approved                     │
│                                                                   │
│ Step 4: Integration — after ALL 5 complete                       │
│   └─ Final code-reviewer for entire phase                        │
│   └─ /quality-gate (10-point checklist)                          │
│   └─ Fix any cross-module conflicts                              │
│                                                                   │
│ Step 5: /checkpoint + /save-session                              │
│   └─ Commit + push + update MASTER_PLAN.md: Phase C → ✅ DONE    │
│                                                                   │
│ Step 6: superpowers:finishing-a-development-branch               │
│   └─ Verify all tests, present merge options, execute            │
└──────────────────────────────────────────────────────────────────┘
```

### Phase D Execution Playbook

```
┌──────────────────────────────────────────────────────────────────┐
│ PHASE D — OFFLINE SYNC & PWA (6 sequential agents)              │
│                                                                   │
│ SKILL: superpowers:subagent-driven-development                   │
│ REASON: Tasks have sequential dependencies (DB → sync → SW)     │
│                                                                   │
│ Task D1: Dexie.js Schema                                         │
│   └─ Mirror critical PG tables in IndexedDB                      │
│   └─ Implementer → Spec review → Code review → ✅                │
│                                                                   │
│ Task D2: Sync Engine                                             │
│   └─ Push queue + pull sync + conflict resolution                │
│   └─ Depends on D1 (needs Dexie schema)                          │
│   └─ Implementer → Spec review → Code review → ✅                │
│                                                                   │
│ Task D3: Offline QR Attendance                                   │
│   └─ QR scanner + offline attendance marking                     │
│   └─ Depends on D2 (needs sync engine)                           │
│   └─ Implementer → Spec review → Code review → ✅                │
│                                                                   │
│ Task D4: Service Worker + PWA Manifest                           │
│   └─ next-pwa setup, Workbox caching, install UX                 │
│   └─ Implementer → Spec review → Code review → ✅                │
│                                                                   │
│ Task D5: WhatsApp Cloud API                                      │
│   └─ Template management (tri-lingual), webhook handler          │
│   └─ Implementer → Spec review → Code review → ✅                │
│                                                                   │
│ Task D6: PWA Polish                                              │
│   └─ Install prompt, offline fallback page, splash screens       │
│   └─ Depends on D4                                                │
│   └─ Implementer → Spec review → Code review → ✅                │
│                                                                   │
│ Final: /quality-gate → /checkpoint → finishing-a-dev-branch      │
└──────────────────────────────────────────────────────────────────┘
```

### Phase E Execution Playbook

```
┌──────────────────────────────────────────────────────────────────┐
│ PHASE E — POLISH, SECURITY & LAUNCH (8 sequential agents)       │
│                                                                   │
│ SKILL: superpowers:subagent-driven-development                   │
│                                                                   │
│ Task E1: Reports Module → E5: Notifications Center               │
│   └─ Each: Implementer → Spec review → Code review → ✅          │
│                                                                   │
│ Task E6: Security Audit                                          │
│   └─ ECC security-reviewer agent (OWASP Top 10, RLS audit)      │
│   └─ DEPLOYMENT GATE: Zero CRITICAL issues                       │
│                                                                   │
│ Task E7: Performance Audit                                       │
│   └─ Lighthouse PWA ≥ 95, Core Web Vitals, mobile device test   │
│                                                                   │
│ Task E8: Backup & DR + E9: Launch Checklist                      │
│   └─ Final production deployment                                 │
│                                                                   │
│ Final: /quality-gate → /checkpoint → 🚀 LAUNCH                   │
└──────────────────────────────────────────────────────────────────┘
```

### Handling Agent Status (from Superpowers)

When an implementer subagent returns, handle each status correctly:

| Status | Meaning | Action |
|---|---|---|
| **DONE** | Work complete, self-reviewed | Proceed to spec compliance review |
| **DONE_WITH_CONCERNS** | Complete but flagged doubts | Read concerns → if correctness/scope issues: fix first → then review |
| **NEEDS_CONTEXT** | Missing information | Provide context → re-dispatch |
| **BLOCKED** | Cannot complete | Assess: context problem? → add context. Too large? → split. Plan wrong? → escalate to human. |

**Never ignore an escalation. Never retry with the same approach that failed.**

### Karpathy Principles — Applied Per Task

Before any implementer subagent writes code:

1. **Think Before Coding** — State assumptions. If uncertain, ask. Surface tradeoffs.
2. **Simplicity First** — Minimum code. No speculative features. No unnecessary abstractions.
3. **Surgical Changes** — Touch only task files. Don't refactor adjacent code. Match existing style.
4. **Goal-Driven Execution** — Define success before starting: "Make these 3 tests pass → verify → commit."

### Verification Standard (Before Any Completion Claim)

From `superpowers:verification-before-completion`:

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

| Claim | Requires | Not Sufficient |
|---|---|---|
| "Build passes" | `npx next build` → exit 0 | Linter passing, "should work" |
| "Tests pass" | Test output: 0 failures | Previous run, "looks correct" |
| "Phase complete" | /quality-gate 10/10 + /checkpoint done | "All agents returned success" |

---

## Next Action

**Execute Phase C** using the Arsenal Execution Framework above:

1. `/plan "Phase C — Secondary Modules"` — ECC planner generates 5 implementation specs
2. **Dispatch 5 parallel agents** (`superpowers:dispatching-parallel-agents`) — Belt Engine, Lead Pipeline, Camps, PT Packages, Coach Rentals
3. **Two-stage review per agent** — spec compliance → code quality → approve
4. **Integration gate** — `/quality-gate` (10-point check) + final code-reviewer
5. `/checkpoint` + `/save-session` — commit, push, update MASTER_PLAN.md

**Ready for dispatch.**

---

*This master plan is the single source of truth for the PRO LINE Gym platform MVP. Updated at the end of every build cycle. Stored at `Agentics/Projects/proline-gym-platform/docs/plans/MASTER_PLAN.md`.*
