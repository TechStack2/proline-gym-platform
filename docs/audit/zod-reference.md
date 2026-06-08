# Zod / Validation Reference — Phase A Patterns

> **Purpose:** Quick reference for Phase C prompts so they follow the correct validation patterns established in Phase A.
> **Date:** June 7, 2026
> **Auditor:** Architect mode

---

## 1. Current State: No Zod, No Form Library

**Zod is NOT installed.** It is absent from [`package.json`](../../package.json). The MASTER_PLAN.md declares Zod as a planned SSOT layer (Layer 3 in the Truth Chain), but it has **not yet been implemented** in any Phase A module.

| Artifact | Status |
|---|---|
| `zod` in `package.json` | ❌ Not present |
| `react-hook-form` in `package.json` | ❌ Not present |
| `@hookform/resolvers` in `package.json` | ❌ Not present |
| `src/lib/validators/` directory | ❌ Does not exist |
| `src/types/database.ts` (generated types) | ❌ Does not exist |
| Any `z.` or `zod` import in `src/` | ❌ Not found |

---

## 2. What Phase A Actually Does (Manual Validation)

All Phase A forms use **manual `useState` + `handleChange` + inline validation**. No form library, no schema-based validation.

### Pattern: Manual State Management

Every Phase A form follows this exact pattern:

```tsx
// 1. useState for all fields
const [formData, setFormData] = useState({
  name_ar: '',
  name_en: '',
  phone: '',
  // ... more fields
})

// 2. Generic change handler
const handleChange = (field: string, value: string) => {
  setFormData(prev => ({ ...prev, [field]: value }))
}

// 3. Inline validation in submit handler
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  setLoading(true)
  setError(null)
  try {
    // Direct Supabase insert/upsert — no validation layer
    const { error } = await supabase
      .from('students')
      .upsert({ ...formData, id: initialData?.id })
    if (error) throw error
    router.push(`/${locale}/students`)
  } catch (err: any) {
    setError(err.message)
  }
}
```

### Files Using This Pattern

| Module | Form File | Lines |
|---|---|---|
| **Students** | [`src/app/[locale]/(dashboard)/students/components/student-form.tsx`](../../src/app/%5Blocale%5D/(dashboard)/students/components/student-form.tsx) | 274 lines — manual state, no Zod |
| **Belts** | [`src/app/[locale]/(dashboard)/belts/belt-engine-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/belts/belt-engine-client.tsx) | 277 lines — manual state, inline guard clause |
| **Leads** | [`src/app/[locale]/(dashboard)/leads/leads-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/leads/leads-client.tsx) | 184 lines — manual state, inline status change |
| **Camps** | [`src/app/[locale]/(dashboard)/camps/camps-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/camps/camps-client.tsx) | 145 lines — manual state, basic required check |
| **PT** | [`src/app/[locale]/(dashboard)/pt/pt-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/pt/pt-client.tsx) | 132 lines — manual state, basic required check |
| **Rentals** | [`src/app/[locale]/(dashboard)/rentals/rentals-client.tsx`](../../src/app/%5Blocale%5D/(dashboard)/rentals/rentals-client.tsx) | 178 lines — manual state, basic required check |

---

## 3. What the MASTER_PLAN.md Says (Target Architecture)

The [`MASTER_PLAN.md`](../plans/MASTER_PLAN.md) declares the intended SSOT architecture:

```
┌─────────────────────────────────────────────────────────────┐
│ SSOT TRUTH CHAIN                                             │
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
└─────────────────────────────────────────────────────────────┘
```

Key rule from MASTER_PLAN.md:
> **Zod = form truth** — All form validation uses Zod schemas from `src/lib/validators/`. Server and client share schemas.

**This is the target, not the current state.** Phase C should implement this pattern for the first time.

---

## 4. Recommended Pattern for Phase C

Since Phase A has **no Zod precedent**, Phase C has a clean slate to establish the pattern. Based on the MASTER_PLAN.md SSOT architecture, Phase C should:

### 4.1 Install Dependencies

```json
{
  "dependencies": {
    "zod": "^3.23.0",
    "react-hook-form": "^7.52.0",
    "@hookform/resolvers": "^3.9.0"
  }
}
```

### 4.2 Create Validator Files

```
src/lib/validators/
├── index.ts              # Re-export all schemas
├── student.ts            # Student schema (Phase A retro-fit candidate)
├── belt.ts               # Belt promotion schema
├── lead.ts               # Lead schema
├── camp.ts               # Camp schema
├── pt.ts                 # PT package schema
└── rental.ts             # Rental booking schema
```

### 4.3 Example Schema Pattern (to follow)

```ts
// src/lib/validators/lead.ts
import { z } from 'zod'

export const leadSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  phone: z.string().min(8, 'Phone must be at least 8 digits'),
  email: z.string().email().optional().or(z.literal('')),
  interested_discipline_id: z.string().uuid('Invalid discipline'),
  source: z.enum(['instagram', 'facebook', 'whatsapp', 'website', 'phone', 'walk_in']),
  notes: z.string().max(500).optional(),
})

export type LeadInput = z.infer<typeof leadSchema>
```

### 4.4 Form Integration Pattern (to follow)

```tsx
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { leadSchema, type LeadInput } from '@/lib/validators/lead'

export function LeadForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<LeadInput>({
    resolver: zodResolver(leadSchema),
  })

  const onSubmit = async (data: LeadInput) => {
    // data is fully validated here
    const { error } = await supabase.from('leads').insert(data)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('first_name')} />
      {errors.first_name && <span>{errors.first_name.message}</span>}
      <button type="submit">Submit</button>
    </form>
  )
}
```

---

## 5. DB Types

**No generated DB types file exists** (`src/types/database.ts` is absent). The MASTER_PLAN.md specifies this should be generated via:

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

This is a planned CI gate but hasn't been executed yet. Phase C modules currently use inline `type`/`interface` definitions (e.g., `type Student = { id: string; current_belt_rank: string; ... }` in belt-engine-client.tsx).

---

## 6. Key Takeaways for Phase C Prompts

| # | Finding | Implication for Phase C |
|---|---|---|
| 1 | **No Zod exists yet** | Phase C must install `zod` + `react-hook-form` + `@hookform/resolvers` |
| 2 | **No validators directory** | Create `src/lib/validators/` with per-module schema files |
| 3 | **No DB types file** | Create `src/types/database.ts` via `supabase gen types` OR define inline types |
| 4 | **All Phase A forms use manual state** | Phase C should NOT copy the manual pattern — it should establish the Zod + RHF pattern |
| 5 | **MASTER_PLAN mandates Zod** | The SSOT architecture explicitly requires Zod schemas at Layer 3 |
| 6 | **i18n is already wired** | All Phase C forms should use `useTranslations()` like Phase A does |
| 7 | **Supabase client pattern** | Use `createClient()` from `@/lib/supabase/client` (browser) or `@/lib/supabase/server` (server) |
| 8 | **Tri-lingual fields** | All name/description fields have `_ar`, `_en`, `_fr` variants — Zod schemas must reflect this |

---

## 7. Summary

```
Phase A (current):  useState + manual handleChange + inline validation
                    ↓
Phase C (target):   useForm + zodResolver + Zod schemas in src/lib/validators/
                    ↓
Phase D/E (future): Server Actions + shared Zod schemas (client + server)
```

Phase C is the **first phase** that will implement the Zod validation layer. It should establish the pattern that all subsequent phases will follow.
