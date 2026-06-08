# Workflow Trace: Lead-to-Student Conversion (Cross-User)

> **Date:** 2026-06-08  
> **Auditor:** Roo (Debug Mode)  
> **Scope:** End-to-end Lead→Student conversion flow across Receptionist (Dashboard) and Coach (Coach App)

---

## Expected Flow vs. Actual Flow

```
EXPECTED                                  ACTUAL
─────────                                 ──────
1. Captures lead (name,phone)      ✅     Receptionist creates lead via form
       ↓                                  
2. Lead status: new→contacted       ✅     Status dropdown updates status field
       ↓                                  
3. Schedules trial class           ⚠️     UI exists but only sets status='trial_scheduled'
                                          No INSERT into trial_classes table
       ↓                                  
4. Lead attends trial               ❌     No show/fail tracking — trial_classes never populated
       ↓                                  
5. Converts lead → student         ❌     Sets status='converted' ONLY. No student row created.
       ↓                                  
6. Assigns membership plan         ❌     No automated assignment. Manual only via invoices page.
       ↓                           ❌     
7. Triggers billing / creates invoice  ❌     No DB trigger. No code linking lead→invoice.
       ↓                                  
8. Student appears in coach roster  ❌     Coach sees group-class enrollments only.
       ↓                                  
9. Attendance tracking begins       ⚠️     Works IF student manually enrolled in a class.
                                          No automatic enrollment flow.
```

---

## Step Status Summary

| Step | Description | Portal | Status | Evidence |
|------|-------------|--------|:------:|----------|
| 1 | Captures lead (name, phone) | Receptionist | ✅ | [`leads-client.tsx`](../../src/app/[locale]/(dashboard)/leads/leads-client.tsx) — "Convert" button on each lead card. Lead creation form populates `leads` table. Public lead submission via [`submit_public_lead()`](../../supabase/migrations/000009_public_lead_submissions.sql:8). |
| 2 | Lead status: new → contacted | Receptionist | ✅ | [`leads-client.tsx:108-162`](../../src/app/[locale]/(dashboard)/leads/leads-client.tsx:108) — `handleStatusChange()` updates status column. Status dropdown on every lead card. |
| 3 | Schedules trial class | Receptionist | ❌ | [`leads-client.tsx:315-344`](../../src/app/[locale]/(dashboard)/leads/leads-client.tsx:315) — Expanded UI has date/time inputs but the "Confirm Trial" button only calls `handleStatusChange(lead.id, 'trial_scheduled')`. No INSERT into `trial_classes` table. The `trial_classes` table exists (migration [`000003:410`](../../supabase/migrations/000003_create_operational_tables.sql:410)) but is **never written to** by any application code. |
| 4 | Lead attends trial | Receptionist | ❌ | No code tracks trial attendance. `trial_classes` has `status` and `show_up` columns but no UI reads or writes them. |
| 5 | Converts lead → student | Receptionist | ❌ | [`leads-client.tsx:304-311`](../../src/app/[locale]/(dashboard)/leads/leads-client.tsx:304) — "Convert" button calls `handleStatusChange(lead.id, 'converted')`. This sets `status='converted'` and `converted_at` timestamp. It does **NOT**: create a `students` row, set `converted_student_id`, create a `student_memberships` row, or create an invoice. The `leads` table has `converted_student_id UUID REFERENCES students(id)` but it is never populated. |
| 6 | Assigns membership plan | Receptionist | ❌ | No automated membership assignment. `membership_plans` table exists. `student_memberships` table exists. Manual assignment requires staff to: create a student first, then go to invoices, select a plan. No code links lead conversion → membership assignment. |
| 7 | Triggers billing / creates invoice | System | ❌ | No DB trigger on `leads.status = 'converted'`. No server action that creates an invoice. [`invoices/new/page.tsx`](../../src/app/[locale]/(dashboard)/invoices/new/page.tsx) is a manual form. The `calculate_invoice_totals()` and `generate_invoice_number()` triggers work, but only when a human manually creates an invoice. |
| 8 | Student appears in coach's roster | Coach App | ❌ | [`coach/students/page.tsx:78-113`](../../src/app/[locale]/coach/students/page.tsx:78) — Queries `class_enrollments` JOIN `classes` WHERE `coach_id = current_coach.id`. Coach only sees students enrolled in their group classes. A newly converted student has no enrollments and is invisible. No query for `pt_assignments` or gym-wide students. |
| 9 | Attendance tracking begins | Coach App | ⚠️ | `attendance_records` table and attendance UI exist. But a converted lead with no student record, no membership, and no class enrollment will never appear for attendance tracking. |

---

## Detailed Findings Per Step

### Step 1-2: Lead capture and status pipeline

**Files audited:**

| File | Purpose | Works? |
|------|---------|:------:|
| [`leads-client.tsx`](../../src/app/[locale]/(dashboard)/leads/leads-client.tsx) | Lead list, status dropdown, convert button | ✅ Partial |
| [`leads-types.ts`](../../src/app/[locale]/(dashboard)/leads/leads-types.ts) | Lead type definitions, status enum | ✅ |
| [`leads.schema.ts`](../../src/lib/validators/leads.schema.ts) | Zod validation (insert, update, status transition) | ✅ |
| [`submit_public_lead()`](../../supabase/migrations/000009_public_lead_submissions.sql:8) | Public lead submission RPC | ✅ |

**What works:**
- Public lead form creates rows in `leads` table via `submit_public_lead()` RPC
- Status dropdown changes `leads.status` in real-time with optimistic UI
- `handleStatusChange()` at [`leads-client.tsx:108`](../../src/app/[locale]/(dashboard)/leads/leads-client.tsx:108) validates via Zod, updates Supabase, shows toast

**What's missing:**
- No server action or API route for conversion — everything is direct Supabase calls from client
- The `converted_student_id` column on `leads` is never populated
- No validation that a lead CAN be converted (e.g., must have trial_completed first)

---

### Step 3-4: Trial class scheduling and attendance

**Files audited:**

| File | Purpose | Trial tracking? |
|------|---------|:---:|
| [`leads-client.tsx:315-344`](../../src/app/[locale]/(dashboard)/leads/leads-client.tsx:315) | Expanded trial scheduling UI | ⚠️ UI only |
| [`trial_classes` table](../../supabase/migrations/000003_create_operational_tables.sql:410) | Trial class records | ❌ Never written |

**Finding:** The trial scheduling UI at [`leads-client.tsx:315-344`](../../src/app/[locale]/(dashboard)/leads/leads-client.tsx:315) renders date and time inputs, but the "Confirm Trial" button (line 336) only calls `handleStatusChange(lead.id, 'trial_scheduled')` — a status label change. No `trial_classes` INSERT. No actual class linking. The `trial_classes` table has `lead_id`, `class_id`, `scheduled_date`, `status`, `show_up`, `feedback` — all unused.

---

### Step 5: The "Conversion" — What Actually Happens

**Code path:** [`leads-client.tsx:304-311`](../../src/app/[locale]/(dashboard)/leads/leads-client.tsx:304)

```typescript
// Line 303-311: The "Convert" button
{lead.status !== 'converted' && lead.status !== 'lost' && (
  <button
    onClick={() => handleStatusChange(lead.id, 'converted')}
    className="flex-1 h-8 text-xs bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 font-medium"
  >
    {t('convert')}
  </button>
)}
```

**`handleStatusChange()` at [`leads-client.tsx:108-162`](../../src/app/[locale]/(dashboard)/leads/leads-client.tsx:108):**

1. Validates via [`leadStatusUpdateSchema`](../../src/lib/validators/leads.schema.ts:49) — requires `converted_at` when status is `'converted'`
2. Sets `converted_at = new Date().toISOString()`
3. Calls `supabase.from('leads').update({ status: 'converted', converted_at: ... }).eq('id', leadId)`
4. **That's it.** No other side effects.

**What `handleStatusChange()` does NOT do:**

| Missing Action | Code Evidence |
|----------------|---------------|
| Create `students` row | No INSERT into `students` table |
| Set `leads.converted_student_id` | Not in the `updateData` object (line 143) |
| Create `student_memberships` row | No INSERT into `student_memberships` |
| Create `invoices` row | No INSERT into `invoices` |
| Create `class_enrollments` | No enrollment |
| Send notification | No `notifications` INSERT |
| Log to audit | Only the generic `update_timestamp` trigger fires on `leads` |

The `leads` table schema ([`000003:388`](../../supabase/migrations/000003_create_operational_tables.sql:388)) includes `converted_student_id UUID REFERENCES students(id)` — a column that was designed to link a lead to its resulting student. This column is **never written to** by any application code. A grep for `converted_student_id` in `src/` returns only the foreign key definition in the database types.

---

### Step 6: Membership Assignment

**Tables involved:**

| Table | Migration | Used by conversion? |
|-------|-----------|:---:|
| `membership_plans` | [`000003:91`](../../supabase/migrations/000003_create_operational_tables.sql:91) | ❌ |
| `student_memberships` | [`000003:114`](../../supabase/migrations/000003_create_operational_tables.sql:114) | ❌ |

**Where memberships ARE used (manual flows only):**

| File | Usage |
|------|-------|
| [`settings/_components/membership-plans.tsx`](../../src/app/[locale]/(dashboard)/settings/_components/membership-plans.tsx) | CRUD for plan definitions |
| [`invoices/new/page.tsx:22`](../../src/app/[locale]/(dashboard)/invoices/new/page.tsx:22) | Manual invoice creation — dropdown of plans |
| [`invoices/components/invoice-form.tsx:117`](../../src/app/[locale]/(dashboard)/invoices/components/invoice-form.tsx:117) | Auto-fills amount when plan selected |
| [`portal/page.tsx:30`](../../src/app/[locale]/portal/page.tsx:30) | Student reads their own membership |
| [`students/[id]/page.tsx:48`](../../src/app/[locale]/(dashboard)/students/[id]/page.tsx:48) | Student detail — shows membership history (empty array `[]`) |
| [`students/components/student-detail.tsx:176-209`](../../src/app/[locale]/(dashboard)/students/components/student-detail.tsx:176) | Renders membership history table |

**Finding:** Membership assignment is entirely manual. Staff must create a student, then create an invoice with a membership plan, which presumably creates the `student_memberships` row. There is no automated flow from lead conversion to membership assignment.

---

### Step 7: Billing/Invoices

**Tables involved:**

| Table | Migration | Triggered by conversion? |
|-------|-----------|:---:|
| `invoices` | [`000003:134`](../../supabase/migrations/000003_create_operational_tables.sql:134) | ❌ |
| `payments` | [`000003:167`](../../supabase/migrations/000003_create_operational_tables.sql:167) | ❌ |

**Existing triggers:**

| Trigger | File | Purpose |
|---------|------|---------|
| `trg_generate_invoice_number` | [`000005:216`](../../supabase/migrations/000005_create_triggers.sql:216) | Auto-generates `INV-YYYYMM-XXXX` on INSERT |
| `trg_calculate_invoice_totals` | [`000005:187`](../../supabase/migrations/000005_create_triggers.sql:187) | Calculates `total_usd`, `total_lbp`, tax on INSERT/UPDATE |
| `trg_audit_invoices` | [`000005:111`](../../supabase/migrations/000005_create_triggers.sql:111) | Audit trail on INSERT/UPDATE/DELETE |

**Finding:** The invoice infrastructure is solid — auto-numbering, tax calculation, audit trail — but there is **no trigger on `leads`** that fires when `status = 'converted'`. No code in `handleStatusChange()` creates an invoice. The [`invoices/new/page.tsx`](../../src/app/[locale]/(dashboard)/invoices/new/page.tsx) page is the only way to create an invoice, and it requires manually selecting a student and plan.

The `invoices` table has `membership_id UUID REFERENCES student_memberships(id)` — confirming that invoices are linked to memberships, not leads. Since lead conversion creates neither a student nor a membership, no invoice can be generated.

---

### Step 8: Coach Visibility

**File:** [`coach/students/page.tsx`](../../src/app/[locale]/coach/students/page.tsx)

**Query flow (lines 63-192):**

1. Get `coach.id` from `coaches` WHERE `profile_id = current_user.id`
2. Get `classes.id` WHERE `coach_id = coach.id AND is_active = true`
3. Get `class_enrollments` WHERE `class_id IN (classIds) AND is_active = true`
4. Join → `students` → `profiles` for name display
5. Join → `belt_promotions` for belt rank
6. Join → `attendance_records` for last attendance date

**What the coach sees:** Students enrolled in their **group classes** only.

**What the coach does NOT see:**
- Students assigned via `pt_assignments` (PT sessions)
- Newly converted students without any class enrollment
- All students in the gym (gym-scoped roster)

**Result:** A lead converted to a student would be invisible to the coach until the student is manually enrolled in a group class by the receptionist.

---

### Step 9: Attendance Tracking

The `attendance_records` table and attendance UI exist (see [`coach/attendance/page.tsx`](../../src/app/[locale]/coach/attendance/page.tsx)). Attendance marking works for students enrolled in classes. But since conversion doesn't create enrollments, attendance tracking has no entry point for newly converted students.

---

## Database Trace

**Tables supporting (or that should support) this flow:**

| Table | Migration | Purpose | Used in Flow? |
|-------|-----------|---------|:---:|
| `leads` | [`000003:388`](../../supabase/migrations/000003_create_operational_tables.sql:388) | Lead records with status pipeline | ✅ Status only |
| `trial_classes` | [`000003:410`](../../supabase/migrations/000003_create_operational_tables.sql:410) | Trial class scheduling & attendance | ❌ Never written |
| `students` | [`000002:91`](../../supabase/migrations/000002_create_core_tables.sql:91) | Student records (linked to profiles) | ❌ Not created by conversion |
| `student_memberships` | [`000003:114`](../../supabase/migrations/000003_create_operational_tables.sql:114) | Membership plan assignments | ❌ Not created by conversion |
| `membership_plans` | [`000003:91`](../../supabase/migrations/000003_create_operational_tables.sql:91) | Plan definitions (name, price, duration) | ⚠️ Manual only |
| `invoices` | [`000003:134`](../../supabase/migrations/000003_create_operational_tables.sql:134) | Billing with invoice_number, totals | ❌ Not created by conversion |
| `payments` | [`000003:167`](../../supabase/migrations/000003_create_operational_tables.sql:167) | Payment records against invoices | ❌ Not triggered |
| `class_enrollments` | [`000003:55`](../../supabase/migrations/000003_create_operational_tables.sql:55) | Group class enrollment | ❌ Not created by conversion |
| `attendance_records` | [`000003:68`](../../supabase/migrations/000003_create_operational_tables.sql:68) | Attendance tracking | ⚠️ Works but unreachable for converted leads |
| `notifications` | [`000003:485`](../../supabase/migrations/000003_create_operational_tables.sql:485) | User notification system | ❌ Not wired |
| `audit_logs` | [`000003:466`](../../supabase/migrations/000003_create_operational_tables.sql:466) | Audit trail | ⚠️ Only `leads` UPDATE is audited (via update_timestamp trigger); no student/membership/invoice creation to audit |
| `coaches` | [`000002:108`](../../supabase/migrations/000002_create_core_tables.sql:108) | Coach records linked to profiles | ⚠️ Used only for group class queries |
| `pt_assignments` | [`000012:11`](../../supabase/migrations/000012_create_pt_assignments.sql:11) | PT session assignments | ❌ Never linked to leads or conversion |

**Key schema observation:** The `leads` table has `converted_student_id UUID REFERENCES students(id)` — proving the database designer expected leads to create student records. But no code ever populates this column.

**DB Triggers that exist but don't fire during conversion:**

| Trigger | On Table | Event | Would Help? |
|---------|----------|-------|:---:|
| `trg_audit_students` | `students` | INSERT/UPDATE/DELETE | ❌ No student created |
| `trg_audit_invoices` | `invoices` | INSERT/UPDATE/DELETE | ❌ No invoice created |
| `trg_audit_student_memberships` | `student_memberships` | INSERT/UPDATE/DELETE | ❌ No membership created |
| `trg_generate_invoice_number` | `invoices` | BEFORE INSERT | ❌ No invoice INSERT |
| `trg_calculate_invoice_totals` | `invoices` | BEFORE INSERT/UPDATE | ❌ No invoice INSERT |

**Missing triggers:**
- No `AFTER UPDATE OF status ON leads` trigger that creates a student when status becomes 'converted'
- No trigger that creates a `trial_classes` row when status becomes 'trial_scheduled'
- No trigger that creates an invoice when a student_membership is created

---

## Gaps Found

| # | Step | Gap Description | Severity |
|---|------|----------------|----------|
| 1 | Trial Scheduling | "Schedule Trial" button only changes status label. No `trial_classes` INSERT. The table and schema exist but are completely unused. | **CRITICAL** |
| 2 | Trial Attendance | No mechanism to track whether a lead showed up for trial. `trial_classes.show_up` is never written. No "no-show" handling. | **HIGH** |
| 3 | Lead→Student Creation | "Convert" sets `status='converted'` but does NOT create a `students` row. `converted_student_id` FK is never populated. The conversion is purely cosmetic. | **CRITICAL** |
| 4 | Membership Assignment | No automated or guided membership assignment. Staff must navigate to a separate invoice page, manually select a plan, and manually link it. No workflow guidance. | **CRITICAL** |
| 5 | Invoice Generation | No invoice is created on conversion. No DB trigger. No server action. The invoice infrastructure (auto-numbering, tax calc) works but is entirely manual. | **CRITICAL** |
| 6 | Coach Visibility | Coach only sees students enrolled in group classes. A converted student with no class enrollment is invisible. Coach has no gym-wide student roster. | **HIGH** |
| 7 | Attendance Entry Point | Attendance works but only for enrolled students. Converted leads have no enrollment and thus no attendance entry point. | **MEDIUM** |
| 8 | No Conversion Guard | No validation that a lead must be `trial_completed` before conversion. Leads can jump directly from `new` to `converted`. | **MEDIUM** |
| 9 | No Duplicate Prevention | No check for existing `students` row with same phone/email before conversion. Could create duplicate records. | **MEDIUM** |
| 10 | Audit Trail | Audit triggers exist on target tables (`students`, `invoices`, `student_memberships`) but never fire because conversion creates no rows in those tables. | **LOW** |

---

## Verdict

### Does this flow work end-to-end? **NO**

The Lead-to-Student conversion flow is **fundamentally incomplete**. The "conversion" is a status label change with zero downstream effects. Of the 9 expected steps:

| Status | Count | Steps |
|:------:|:-----:|-------|
| ✅ Works | 2 | Step 1 (lead capture), Step 2 (status pipeline) |
| ⚠️ Partial | 1 | Step 9 (attendance — works but unreachable for converted leads) |
| ❌ Broken | 6 | Steps 3-8 (trial scheduling, trial attendance, student creation, membership, billing, coach visibility) |

### What DOES work:

- Lead capture via public form (`submit_public_lead()` RPC) and dashboard UI
- Status pipeline (new → contacted → trial_scheduled → trial_completed → converted → lost) with optimistic UI updates
- Zod validation ensures `converted_at` is set when status becomes 'converted'
- The DB schema has all necessary tables (`students`, `student_memberships`, `trial_classes`, `invoices`, `attendance_records`)
- Invoice infrastructure (number generation, tax calculation, audit trail) is solid — but entirely manual
- Audit triggers exist on critical tables — but never fire during conversion

### Root Cause Summary

The codebase has **two disconnected halves**:

1. **Lead management pipeline** — Capture, status progression, optimistic UI — works well as a CRM feature.
2. **Student/membership/billing system** — Tables, triggers, manual CRUD pages — exists but is never connected to leads.

The `leads.converted_student_id` column is the smoking gun: it proves the connection was designed into the schema but never implemented in application code. The `handleStatusChange()` function at [`leads-client.tsx:108`](../../src/app/[locale]/(dashboard)/leads/leads-client.tsx:108) performs exactly one database operation (`UPDATE leads SET status, converted_at`) when it should perform at minimum:

1. `INSERT INTO students` (creating the student profile)
2. `UPDATE leads SET converted_student_id` (linking back)
3. `INSERT INTO student_memberships` (assigning the plan)
4. `INSERT INTO invoices` (creating the bill)
5. `INSERT INTO notifications` (notifying the coach)

Alternatively, these could be implemented as a PostgreSQL function/trigger (`AFTER UPDATE OF status ON leads WHEN status = 'converted'`) or a server action — but neither exists today.

### What a working conversion flow needs:

1. **Trial class creation**: When status → `trial_scheduled`, INSERT into `trial_classes` with the selected date/time and a real `class_id`
2. **Student creation**: When status → `converted`, INSERT into `students` with profile data from the lead record
3. **Membership assignment**: A mandatory plan selection before or during conversion (modal or step in the flow)
4. **Invoice generation**: Auto-create invoice from the selected membership plan price
5. **Coach visibility**: Expand [`coach/students/page.tsx`](../../src/app/[locale]/coach/students/page.tsx) to include gym-wide students OR add a notification
6. **Conversion guard**: Validate that a lead has `trial_completed` before allowing conversion
