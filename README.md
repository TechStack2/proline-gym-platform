# Proline Gym Platform — MVP

> **Project:** Martial Arts Gym Management Platform  
> **Client:** [Proline Gym](../../Clients/_active/proline-gym/) — Hadath, Lebanon  
> **Stack:** Next.js 16 + Supabase + TypeScript + Tailwind CSS + Dexie.js  
> **Status:** 🔴 Pre-Development (Proposal Stage)

---

## Overview

A complete management platform built for Proline Gym that replaces their Excel + WhatsApp workflow. The platform handles: martial arts class scheduling & attendance, belt/rank progression tracking, dual-currency billing (USD/LBP), personal training packages, external coach rentals, summer camp & event management, social media inquiry pipeline, and member/parent self-service.

**Key differentiators:**
- Arabic RTL primary UI + English
- Offline-first PWA (works during Lebanon's daily power cuts)
- Dual-currency ledger with real-time exchange rate handling
- Martial-arts-native belt/rank engine (not a generic gym app)
- WhatsApp Business API integration (the Lebanese internet)

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Frontend** | Next.js 16 (App Router) | SSR, i18n, PWA support via next-pwa |
| **Styling** | Tailwind CSS + tailwindcss-rtl | Utility-first, RTL-aware |
| **Language** | TypeScript (strict) | Type safety across the stack |
| **Backend/DB** | Supabase (PostgreSQL + PostgREST) | Instant API, RLS, Auth, Edge Functions |
| **Offline DB** | Dexie.js (IndexedDB) | Offline-first sync engine |
| **Auth** | Supabase Auth (Phone OTP) | Passwordless, WhatsApp OTP |
| **i18n** | next-intl | Arabic (ar-LB) primary, English (en) fallback |
| **Messaging** | WhatsApp Cloud API + Twilio SMS fallback | Primary communication channel |
| **Payments** | Manual (OMT/Whish/Cash) + reference tracking | Lebanese payment reality |
| **Hosting** | Vercel + Supabase Cloud | Global CDN, edge functions |

---

## Architecture Principles

1. **Offline-first** — All critical operations work without internet. Sync when connected.
2. **Mobile-first** — Coaches use phones during class. One-thumb operability.
3. **Arabic-first** — Designed in Arabic RTL. English is derived, not vice versa.
4. **WhatsApp-parity** — No task should take more taps than its WhatsApp equivalent.
5. **Currency integrity** — Every monetary value stored as `amount_usd` + `amount_lbp` + `exchange_rate` + `rate_date`.

---

## Project Structure

```
proline-gym-platform/
├── CLAUDE.md                           # Agent context
├── README.md                           # This file
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── components.json
├── .env.local.example
├── docs/
│   └── plans/                          # Technical reference docs
│       ├── proline-gym-platform-blueprint.md
│       └── proline-gym-technical-architecture.md
├── supabase/
│   ├── config.toml
│   └── migrations/                     # SQL migration files
├── public/
│   ├── icons/                          # PWA icons
│   └── manifest.json
├── src/
│   ├── app/                            # Next.js App Router
│   │   ├── [locale]/                   # i18n route group (ar/en)
│   │   │   ├── layout.tsx              # Root layout (RTL-aware)
│   │   │   ├── page.tsx                # Landing / redirect
│   │   │   ├── (auth)/                 # Auth routes (login, verify)
│   │   │   ├── (portal)/               # Member/parent portal
│   │   │   │   ├── dashboard/
│   │   │   │   ├── progress/
│   │   │   │   ├── billing/
│   │   │   │   └── schedule/
│   │   │   ├── (dashboard)/            # Staff dashboard
│   │   │   │   ├── attendance/
│   │   │   │   ├── students/
│   │   │   │   ├── billing/
│   │   │   │   ├── schedule/
│   │   │   │   ├── coaches/
│   │   │   │   ├── rentals/
│   │   │   │   ├── camps/
│   │   │   │   └── leads/
│   │   │   └── api/                    # API routes (edge)
│   │   └── middleware.ts               # i18n + auth middleware
│   ├── components/
│   │   ├── ui/                         # shadcn/ui components
│   │   ├── portal/                     # Portal-specific components
│   │   ├── dashboard/                  # Staff dashboard components
│   │   └── shared/                     # Shared components
│   ├── lib/
│   │   ├── supabase/                   # Supabase client
│   │   │   ├── server.ts
│   │   │   └── client.ts
│   │   ├── db/                         # Dexie.js offline DB
│   │   │   ├── schema.ts
│   │   │   └── sync-engine.ts
│   │   ├── utils/                      # Utility functions
│   │   │   ├── currency.ts             # Dual-currency helpers
│   │   │   ├── date.ts                 # Hijri/Gregorian
│   │   │   └── phone.ts                # Lebanese phone formatting
│   │   └── validators/                 # Zod schemas
│   ├── hooks/                          # Custom React hooks
│   ├── types/                          # TypeScript types
│   ├── i18n/                           # Translation files
│   │   ├── ar.json                     # Arabic (primary)
│   │   └── en.json                     # English
│   └── __tests__/                      # Test files
└── scripts/                            # Dev/CI scripts
```

---

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment
cp .env.local.example .env.local
# Edit .env.local with your Supabase credentials

# Start development server
npm run dev

# Open in browser
# Arabic: http://localhost:3000/ar
# English: http://localhost:3000/en
```

---

## Development

```bash
npm run dev         # Start dev server
npm run build       # Production build
npm run lint        # Lint code
npm run test        # Run tests
npm run type-check  # TypeScript check
```

---

## V1 MVP Scope

See [`docs/plans/proline-gym-platform-blueprint.md`](docs/plans/proline-gym-platform-blueprint.md) for the full MoSCoW-prioritized feature set. V1 delivers:

| Module | V1 Scope |
|---|---|
| **Belt Engine** | Multi-discipline rank hierarchies, stripe tracking, promotion history |
| **Class Schedule** | Recurring classes, coach assignment, QR attendance (offline) |
| **Billing** | Dual-currency invoicing, TVA 11%, cash/OMT/Whish tracking |
| **Member Portal** | Schedule view, attendance history, belt progress, payment history |
| **PT Packages** | Package creation, credit tracking, session scheduling |
| **Coach Rentals** | Space booking, digital waivers, payment tracking |
| **Camps/Events** | Event creation, registration, payment tracking |
| **Lead Pipeline** | Lead capture, trial scheduling, WhatsApp messaging |
| **Arabic RTL** | Full RTL UI, Arabic number formatting, mixed text handling |
| **Offline** | PWA with IndexedDB sync engine, offline attendance & payments |

---

## Arsenal Frameworks

### 🧠 Karpathy Principles (Always Active)
1. **Think Before Coding** — Explain understanding before writing code
2. **Simplicity First** — Prefer simplest solution that works
3. **Surgical Changes** — Change only what's necessary
4. **Goal-Driven Execution** — Define success criteria before starting

### ⚡ Superpowers (Methodology)
- Brainstorming → Design → Plan → Subagent Execution → Review → Deliver

### 🏗️ ECC (Foundation)
- Commands: `/plan`, `/checkpoint`, `/code-review`, `/quality-gate`
- Agents: planner, code-reviewer, tdd-guide, security-reviewer

### 🎨 Open Design (On Demand)
- UI/UX design, prototypes, presentations via MCP

---

## Deployment

- **Production:** Vercel + Supabase Cloud
- **CI/CD:** GitHub Actions → Vercel deploy preview → Production
- **Infrastructure cost:** ~$71–96/month at V1 scale (see technical architecture doc)
