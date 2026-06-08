# Workflow Trace: PT/Class Request Flow

> **Date:** 2026-06-08  
> **Auditor:** Roo (Debug Mode)  
> **Scope:** End-to-end PT/Class Request flow across all 3 portals (Member, Staff, Coach)

---

## Expected Flow vs. Actual Flow

```
EXPECTED                                  ACTUAL
─────────                                 ──────
STUDENT requests PT/class          ❌     No request UI exists
       ↓                                  
ADMIN receives request             ❌     No request queue; admin directly assigns
       ↓                                  
ADMIN selects coach                ✅     Coach dropdown in Assign modal
       ↓                                  
ADMIN approves                     N/A    No approval concept; direct assignment
       ↓                                  
System sends notifications         ❌     No notification trigger on assignment
       ↓                                  
Student sees on schedule           ⚠️     Schedules exist but only for group classes
       ↓                                  
Coach notified / sees student      ❌     Coach portal has zero PT visibility
       ↓                                  
Billing triggered if unpaid        ❌     No invoice created on PT assignment
```

---

## Step Status Summary

| Step | Description | Portal | Status | Evidence |
|------|-------------|--------|:------:|----------|
| 1 | Student requests PT session or group class | Member | ❌ | [`portal/page.tsx`](../../src/app/[locale]/portal/page.tsx) — No "Request PT" or "Book Class" button anywhere in the portal. The 4 tabs (Home, Schedule, Billing, Profile) are all read-only. Schedule empty state reads "Contact reception to enroll." |
| 2 | Admin receives request | Staff | ❌ | [`pt/page.tsx`](../../src/app/[locale]/(dashboard)/pt/page.tsx) — No request inbox/queue. The PT page bypasses requests entirely and goes straight to package assignment. |
| 3 | Admin selects coach | Staff | ✅ | [`pt/pt-client.tsx:555-561`](../../src/app/[locale]/(dashboard)/pt/pt-client.tsx:555) — "Assign to Student" modal includes a `<select>` dropdown populated from the `coaches` table, filtered by `gym_id`. |
| 4 | Admin approves / assigns | Staff | ⚠️ | [`pt/pt-client.tsx:306-349`](../../src/app/[locale]/(dashboard)/pt/pt-client.tsx:306) — `handleAssign()` creates a `pt_assignments` row directly. There is **no approval workflow** — it's a direct assignment, not a request→approve pattern. |
| 5 | System sends notifications | All | ❌ | No notification INSERT in `handleAssign()`. No DB trigger on `pt_assignments`. The `notifications` table exists but is not wired to PT assignment events. WhatsApp templates exist but are not invoked. |
| 6 | Student sees class on schedule | Member | ⚠️ | [`portal/schedule/page.tsx`](../../src/app/[locale]/portal/schedule/page.tsx) — Only shows `class_enrollments` (group classes), NOT `pt_assignments` or `pt_sessions`. PT sessions are invisible to the student in their schedule. |
| 7 | Coach notified / sees new student | Coach | ❌ | [`coach/page.tsx`](../../src/app/[locale]/coach/page.tsx) — Coach home shows today's group class schedule only. No PT assignment list. No "My PT Students" view. [`coach/students/page.tsx`](../../src/app/[locale]/coach/students/page.tsx) — Filters by group class enrollments, not `pt_assignments`. |
| 8 | Billing triggered if unpaid | System | ❌ | No invoice creation in `handleAssign()`. No DB trigger creating an invoice on `pt_assignments` INSERT. The `invoices` and `payments` tables exist and are used elsewhere, but PT assignment does not integrate with them. |

---

## Detailed Findings Per Step

### Step 1: Student Portal — Can Students Request PT?

**Files audited:**

| File | Purpose | Has "Request PT" / "Book"? |
|------|---------|:--------------------------:|
| [`portal/page.tsx`](../../src/app/[locale]/portal/page.tsx) | Home dashboard | ❌ |
| [`portal/schedule/page.tsx`](../../src/app/[locale]/portal/schedule/page.tsx) | View enrolled classes | ❌ |
| [`portal/billing/page.tsx`](../../src/app/[locale]/portal/billing/page.tsx) | View invoices & payments | ❌ |
| [`portal/profile/page.tsx`](../../src/app/[locale]/portal/profile/page.tsx) | View profile, belt, guardians | ❌ |
| [`portal/_components/PortalTabConfig.ts`](../../src/app/[locale]/portal/_components/PortalTabConfig.ts) | Tab bar config | 4 tabs only: Home, Schedule, Billing, Profile |

**Finding:** The student portal has **zero** ability to initiate any request. There is no "Request PT", "Book Class", or "Enroll" button anywhere. The schedule page explicitly tells students to "Contact reception to enroll." All four portal pages are strictly read-only data displays.

**Root cause:** The system follows an **admin-initiated** model rather than a **student-initiated** model. Students cannot self-serve for PT or class booking.

---

### Step 2: Staff Dashboard — Request Reception & Assignment

**Files audited:**

| File | What it does |
|------|-------------|
| [`pt/page.tsx`](../../src/app/[locale]/(dashboard)/pt/page.tsx) | Server component: loads packages, students, coaches, assignments |
| [`pt/pt-client.tsx`](../../src/app/[locale]/(dashboard)/pt/pt-client.tsx) | Client component: full CRUD for packages + assignment workflow |

**Assignment flow (in [`pt/pt-client.tsx`](../../src/app/[locale]/(dashboard)/pt/pt-client.tsx)):**

1. Admin views PT package cards (with price, session count, validity)
2. Admin clicks **"Assign to Student"** button on a package card
3. Inline form appears with:
   - Student `<select>` — populated from `students` table (active students in gym)
   - Coach `<select>` — populated from `coaches` table (active coaches in gym)
   - **"Assign"** button → calls `handleAssign(pkgId)`
4. `handleAssign()` ([line 306](../../src/app/[locale]/(dashboard)/pt/pt-client.tsx:306)):
   - Validates via `ptAssignmentInsertSchema` (Zod)
   - INSERTs into `pt_assignments` table with `student_id`, `package_id`, `coach_id`, `sessions_total`, `sessions_used: 0`
   - Updates local state
   - Shows toast success/error

**What's missing:**
- No request queue or inbox for incoming PT requests
- No "approve/deny" workflow — it's direct assignment
- No validation that the student has an active membership before assignment
- No duplicate assignment prevention (same student+package combo)

---

### Step 3: Notifications System

**What exists:**

| Component | File | Purpose |
|-----------|------|---------|
| `notifications` table | [`000003_create_operational_tables.sql:485`](../../supabase/migrations/000003_create_operational_tables.sql:485) | Stores per-user notifications (title, body, action_url, is_read) |
| `NotificationBell` | [`DashboardLayoutClient.tsx:11`](../../src/app/[locale]/(dashboard)/_components/DashboardLayoutClient.tsx:11) | Bell icon in dashboard header |
| `NotificationsClient` | [`notifications/notifications-client.tsx`](../../src/app/[locale]/(dashboard)/notifications/notifications-client.tsx) | Read/mark-read UI for staff |
| WhatsApp templates | [`whatsapp/types.ts`](../../src/lib/whatsapp/types.ts) | Template definitions (payment_reminder, etc.) |
| WhatsApp client | [`whatsapp/client.ts`](../../src/lib/whatsapp/client.ts) | WhatsApp Business API integration |

**What's NOT connected:**

- `handleAssign()` in [`pt/pt-client.tsx`](../../src/app/[locale]/(dashboard)/pt/pt-client.tsx:306) does **NOT** insert a `notifications` row
- No database trigger on `pt_assignments` INSERT that creates notifications
- No WhatsApp message is sent on PT assignment
- The student is not notified that they've been assigned a PT package
- The coach is not notified that a new student has been assigned to them
- The `notifications` table is only read by the staff dashboard — the student portal has no notification bell or notifications page

---

### Step 4: Coach Portal — Receiving Side

**Files audited:**

| File | What it shows | PT visibility? |
|------|--------------|:---:|
| [`coach/page.tsx`](../../src/app/[locale]/coach/page.tsx) | Today's group class schedule with enrollment counts | ❌ |
| [`coach/attendance/page.tsx`](../../src/app/[locale]/coach/attendance/page.tsx) | Attendance for today's group classes only | ❌ |
| [`coach/students/page.tsx`](../../src/app/[locale]/coach/students/page.tsx) | Students enrolled in coach's group classes | ❌ |
| [`coach/_components/CoachTabConfig.ts`](../../src/app/[locale]/coach/_components/CoachTabConfig.ts) | 4 tabs: Schedule, Attendance, Students, Profile | ❌ |

**Finding:** The coach portal has **zero awareness of PT assignments**. Every query in the coach portal joins through `class_enrollments` and `class_schedules`, completely ignoring the `pt_assignments` and `pt_sessions` tables.

**What should exist but doesn't:**
- A "My PT Students" list showing students assigned via `pt_assignments` where `coach_id = current_coach.id`
- A PT sessions calendar/schedule in the coach home page
- PT attendance tracking capability
- A "PT Sessions Remaining" counter per student

The database has the data (`pt_assignments` with coach RLS policies), but the UI never queries it.

---

### Step 5: Billing Integration

**What exists:**

- `invoices` table with `student_id`, `invoice_type`, `total_usd`, `total_lbp`, `status`, `due_date`
- `payments` table with `invoice_id`, `student_id`, `amount_usd`, `amount_lbp`, `payment_method`
- Staff dashboard has full invoice CRUD at [`(dashboard)/invoices/`](../../src/app/[locale]/(dashboard)/invoices/)
- Student portal shows invoices and payment history at [`portal/billing/page.tsx`](../../src/app/[locale]/portal/billing/page.tsx)

**What does NOT happen on PT assignment:**

- `handleAssign()` ([`pt/pt-client.tsx:306`](../../src/app/[locale]/(dashboard)/pt/pt-client.tsx:306)) creates only a `pt_assignments` row
- No invoice is generated for the package price (`pt_packages.price_usd`)
- No payment is recorded
- No `invoice_type = 'pt_package'` entry is created
- There is no DB trigger that auto-creates invoices on `pt_assignments` INSERT
- The package price exists in `pt_packages` but is never used in any billing context

---

### Step 6: Database Trace

**Tables that support (or should support) this flow:**

| Table | Migration | Purpose | Used in Flow? |
|-------|-----------|---------|:---:|
| `pt_packages` | [`000003:205`](../../supabase/migrations/000003_create_operational_tables.sql:205) | PT package definitions (name, price, session_count) | ✅ |
| `pt_assignments` | [`000012:11`](../../supabase/migrations/000012_create_pt_assignments.sql:11) | Credit tracking (student→package→coach, sessions_remaining) | ✅ |
| `pt_sessions` | [`000003:228`](../../supabase/migrations/000003_create_operational_tables.sql:228) | Individual PT session records | ⚠️ Exists but no UI queries |
| `notifications` | [`000003:485`](../../supabase/migrations/000003_create_operational_tables.sql:485) | User notifications | ❌ Not wired |
| `invoices` | [`000003:134`](../../supabase/migrations/000003_create_operational_tables.sql:134) | Billing invoices | ❌ Not triggered |
| `payments` | [`000003:167`](../../supabase/migrations/000003_create_operational_tables.sql:167) | Payment records | ❌ Not triggered |
| `class_enrollments` | [`000003:55`](../../supabase/migrations/000003_create_operational_tables.sql:55) | Group class enrollments | ✅ (but group only) |
| `audit_logs` | [`000003:466`](../../supabase/migrations/000003_create_operational_tables.sql:466) | Audit trail | ✅ (trigger on pt_assignments) |

**RLS Policies for `pt_assignments`:**

| Role | Policy | Migration | Access |
|------|--------|-----------|--------|
| Staff | `pt_assignments_staff_gym` | [`000014:32`](../../supabase/migrations/000014_fix_pt_rls_gym_scoping.sql:32) | ALL (gym-scoped) |
| Coach | `pt_assignments_coach` | [`000012:108`](../../supabase/migrations/000012_create_pt_assignments.sql:108) | SELECT only (own assignments) |
| Student | `pt_assignments_student` | [`000012:114`](../../supabase/migrations/000012_create_pt_assignments.sql:114) | SELECT only (own assignments) |

**Missing tables:**
- No `pt_requests` table — the "request" concept doesn't exist in the schema at all

---

## Gaps Found

| # | Step | Gap Description | Severity |
|---|------|----------------|----------|
| 1 | Student Request | No UI for students to request PT or book classes. Portal is entirely read-only. | **CRITICAL** |
| 2 | Admin Reception | No request queue or inbox. Model is "admin assigns" not "student requests → admin approves." | **HIGH** |
| 3 | Notifications | No notification triggered on PT assignment. Neither in-app, email, nor WhatsApp. | **HIGH** |
| 4 | Coach Visibility | Coach portal has zero awareness of PT assignments. No PT student list, no PT schedule, no PT attendance. | **CRITICAL** |
| 5 | Student Schedule | Schedule page only shows group class enrollments. `pt_assignments`/`pt_sessions` are invisible to the student. | **HIGH** |
| 6 | Billing | PT assignment does not create an invoice. Package price is never charged. | **CRITICAL** |
| 7 | Duplicate Prevention | No check for existing active assignment for same student+package combo before creating a new one. | **MEDIUM** |
| 8 | Membership Validation | No check that the student has an active membership before assigning a PT package. | **MEDIUM** |

---

## Verdict

### Does this flow work end-to-end? **NO**

The PT/Class Request flow is **fundamentally broken** at nearly every step. The expected flow (student initiates → admin receives → admin approves → notifications → coach sees → billing triggers) does not exist as designed. Instead, what exists is a **partial admin-only assignment system**:

1. **Step 1 (Student Request):** Completely absent. The student portal has no mechanism to request anything.
2. **Step 2 (Admin Reception):** Bypassed. No request queue. Admin directly assigns packages to students.
3. **Step 3 (Admin Selects Coach):** ✅ Works — coach dropdown in assignment modal.
4. **Step 4 (Admin Assigns):** ⚠️ Works but skips approval. Direct `pt_assignments` INSERT.
5. **Step 5 (Notifications):** Completely absent. No notification of any kind.
6. **Step 6 (Student Schedule):** Broken for PT. Schedule only shows group classes.
7. **Step 7 (Coach Visibility):** Completely absent. Coach cannot see PT assignments.
8. **Step 8 (Billing):** Completely absent. No invoice is created.

**The system implements a "Staff assigns PT packages" workflow rather than the designed "Student requests → Staff approves" workflow.** Of the 8 expected steps, only 1 works fully (coach selection), 2 work partially (assignment creation, schedule display for groups), and 5 are entirely absent.

### What DOES work (narrow scope):

- Staff can create/manage PT packages with names, prices, and session counts
- Staff can assign a package to a student+coach combo (creates `pt_assignments` row)
- The `pt_assignments` table has proper RLS, indexes, and audit triggers
- The assignment tracks sessions_used vs sessions_remaining correctly
- Group class enrollments appear on both student and coach schedules

### Root Cause Summary

The codebase was built with an **admin-centric model** where staff do everything manually. The "request → approve → notify → bill" pipeline was never implemented. The database schema has all the necessary tables (`pt_assignments`, `notifications`, `invoices`) but the application code never connects them together in a workflow.
