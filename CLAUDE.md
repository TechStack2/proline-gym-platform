# CLAUDE.md — Proline Gym Platform (Project)

## Project Overview

**Proline Gym Platform** — A complete martial arts gym management platform built for Proline Gym (Hadath, Lebanon). Replaces Excel + WhatsApp with a purpose-built PWA handling: class scheduling, attendance tracking, belt/rank progression, dual-currency billing, PT packages, coach rentals, summer camps, lead pipeline, and member portal.

**Tech Stack:** Next.js 16 + Supabase + PostgreSQL + TypeScript + Tailwind CSS + Dexie.js (offline)
**Hosting:** Vercel + Supabase Cloud
**Infrastructure Cost:** ~$71–96/month (V1 scale)

## Architecture (Overview)

- **Frontend:** Next.js 16 App Router with `next-intl` for Arabic RTL / English i18n
- **Backend:** Supabase (PostgREST auto-API, Auth with Phone OTP, Edge Functions, Realtime)
- **Database:** PostgreSQL with Row-Level Security (RLS) for 7 user roles
- **Offline:** Dexie.js IndexedDB + custom sync engine (last-write-wins with field-level merge V2)
- **Messaging:** WhatsApp Cloud API (primary) + Twilio SMS (fallback)
- **PWA:** Service Worker + next-pwa for installable offline-first app

## Key Design Decisions

1. **Offline-first** — Attendance, payments, registrations must work with zero internet
2. **Arabic-first** — Primary UI is Arabic RTL; English is derived. CSS uses `tailwindcss-rtl`
3. **Dual-currency** — Every monetary value stored with `amount_usd`, `amount_lbp`, `exchange_rate`, `rate_date`
4. **Passwordless auth** — Supabase Phone OTP (WhatsApp) + Magic Link email fallback
5. **No payment processing** — Lebanese payments are cash/OMT/Whish. Platform records references, doesn't process
6. **PWA over native** — Single codebase, installable on all devices, no app store dependency

## File Structure

```
src/
├── app/[locale]/                   # i18n route group (ar/en)
│   ├── (auth)/                     # Login, OTP verification
│   ├── (portal)/                   # Member/parent self-service
│   │   ├── dashboard/
│   │   ├── progress/              # Belt tracking
│   │   ├── billing/
│   │   └── schedule/
│   ├── (dashboard)/               # Staff/admin dashboard
│   │   ├── attendance/
│   │   ├── students/
│   │   ├── billing/
│   │   ├── schedule/
│   │   ├── coaches/
│   │   ├── rentals/
│   │   ├── camps/
│   │   └── leads/
│   └── api/                       # Edge API routes
├── components/
│   ├── ui/                        # shadcn/ui base
│   ├── portal/                    # Member-facing components
│   ├── dashboard/                 # Staff-facing components
│   └── shared/                    # Cross-cutting components
├── lib/
│   ├── supabase/                  # Server + Client clients
│   ├── db/                        # Dexie.js schema + sync engine
│   ├── utils/                     # currency.ts, date.ts, phone.ts
│   └── validators/                # Zod schemas
├── hooks/                         # Custom hooks
├── types/                         # TypeScript types
└── i18n/                          # ar.json, en.json
```

## Key Reference Docs

| Document | Path |
|---|---|
| Platform Blueprint (full features) | [`docs/plans/proline-gym-platform-blueprint.md`](docs/plans/proline-gym-platform-blueprint.md) |
| Technical Architecture (DB, sync, infra) | [`docs/plans/proline-gym-technical-architecture.md`](docs/plans/proline-gym-technical-architecture.md) |
| Client Proposal | [`../../Clients/_active/proline-gym/docs/proline-gym-proposal.md`](../../Clients/_active/proline-gym/docs/proline-gym-proposal.md) |
| Risk Analysis | Agent #7 deliverable |
| Pricing Strategy | Agent #4 deliverable |

## Scope Boundaries

This is the **development** project. The **client relationship** lives in [`Clients/_active/proline-gym/`](../../Clients/_active/proline-gym/). Do not place client communication, contracts, or proposals in this directory. Do place all code, tests, and technical documentation here.

## Arsenal Frameworks

### 🧠 Karpathy Principles (Always Active)
1. **Think Before Coding** — Explain before writing
2. **Simplicity First** — Minimum code that satisfies requirements
3. **Surgical Changes** — Change only what's necessary for the task
4. **Goal-Driven Execution** — Define success criteria before starting

### ⚡ Superpowers (Methodology)
Brainstorming → Design → Plan → Subagent Execution → Review → Deliver

### 🏗️ ECC (Foundation)
Commands: `/plan`, `/checkpoint`, `/code-review`, `/quality-gate`, `/learn`, `/save-session`
Agents: planner, code-reviewer, tdd-guide, security-reviewer

### 🎨 Open Design (On Demand)
UI/UX design, prototypes, presentations via MCP

## Development Commands

```bash
npm run dev         # Start dev server (ar: localhost:3000/ar, en: localhost:3000/en)
npm run build       # Production build
npm run lint        # Lint
npm run test        # Run tests
npm run type-check  # TypeScript check
```

## MVP Status

- [ ] Project scaffold created
- [ ] Supabase project provisioned
- [ ] Database schema & migrations
- [ ] Auth (Phone OTP)
- [ ] Core layouts (Arabic RTL + English)
- [ ] Attendance module (offline QR)
- [ ] Student/Coach profiles
- [ ] Belt engine
- [ ] Class scheduling
- [ ] Billing module (dual-currency)
- [ ] Member portal
- [ ] PT packages
- [ ] Coach rentals
- [ ] Camp management
- [ ] Lead pipeline
- [ ] PWA + offline sync engine
- [ ] WhatsApp integration
- [ ] V1 deployed to production
