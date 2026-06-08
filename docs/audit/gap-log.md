# Gap Log — Workflow Maturity (Cycle 5)

> **Created:** 2026-06-08 · **Auditor:** Project Auditor (read-only)
> **Scope:** Cross-user workflow maturity gaps only (parity gaps G1–G12 / R1–R10 from prior cycles are closed — see [session-audit-plan.md](./session-audit-plan.md)).
> **Target bar:** MANAGED (L3). **Maturity lens:** CMMI ladder (Ad-hoc→Defined→Managed→Optimized), substituting for un-installed `/open-design/`.
> **Roles** are from `/Arsenal/ecc/agents/`. **Superpowers** from `/Arsenal/superpowers/skills/`.

---

## Legend

- **Sev:** CRITICAL (false "done" claim / blocks flow) · HIGH · MEDIUM · LOW
- **Track:** F = Foundation, A = PT, B = Lead→Onboard, C = Enroll→Attend→Progress→Bill
- Each gap carries an assigned **ECC role**, a **superpower skill**, and the **maturity lens** target.

---

## Foundation (must ship before flow tracks)

| ID | Sev | Gap | Evidence | ECC Role | Superpower | Lens (→target) |
|----|-----|-----|----------|----------|-----------|----------------|
| **M0** | CRITICAL | Notification system is **write-never** — 6 consumers, 0 producers. No reusable producer layer, no realtime, no RLS for inserts. | grep: 0 `notifications…insert` in `src/` | `architect` (design producer layer + trigger pattern) → handoff to `database-reviewer` for RLS/trigger audit | `test-driven-development` (write the "a handoff creates a notification" test first) | Ad-hoc → **Managed** (build the feedback-loop substrate) |

---

## Track A — PT Request → Approve → Bill → Roster

| ID | Sev | Gap | Evidence | ECC Role | Superpower | Lens (→target) |
|----|-----|-----|----------|----------|-----------|----------------|
| **M-A1** | HIGH | No student/parent **PT request** entry point (portal read-only). Hybrid scope = PT request is a chosen self-service action. | `portal/` 0 mutations | `architect` | `brainstorming` (model the request→approve state machine) | L1 → **L3** (open the flow) |
| **M-A2** | MEDIUM | No **approval** state — staff assigns directly; no `requested/approved/rejected` status on the assignment. | [pt-client.tsx:306-349](src/app/[locale]/(dashboard)/pt/pt-client.tsx#L306-L349) | `architect` | `brainstorming` | L1 → **L3** |
| **M-A3** | HIGH | PT assignment fires **no invoice** — billing side-effect missing (MANAGED bar: "billing if unpaid"). | [pt-client.tsx:331-339](src/app/[locale]/(dashboard)/pt/pt-client.tsx#L331-L339); invoices manual-only | `architect` → `database-reviewer` | `test-driven-development` | L1 → **L3** (auto-bill) |
| **M-A4** | HIGH | PT assignment fires **no notification** to student or coach. | grep: 0 producers | `tdd-guide` | `test-driven-development` | L1 → **L3** (depends M0) |
| **M-A5** | HIGH | **Coach portal never reads `pt_assignments`** — assigned PT students invisible to the coach ("coach gets student on list" broken). | grep `coach/`: 0 `pt_assignment` | `architect` | `systematic-debugging` (trace why roster is empty) | L1 → **L3** |
| **M-A6** | HIGH | PT **credit never decrements** — `increment_sessions_used()` defined but never called; no "log session" UI. | [000012:47-60](supabase/migrations/000012_create_pt_assignments.sql#L47-L60); 0 `.rpc()` calls | `tdd-guide` | `systematic-debugging` | L1 → **L3** (close consumption loop) |

---

## Track B — Lead → Trial → Convert → Onboard

| ID | Sev | Gap | Evidence | ECC Role | Superpower | Lens (→target) |
|----|-----|-----|----------|----------|-----------|----------------|
| **M-B1** | HIGH | **Trial scheduling discards date/time** — inputs are cosmetic; only `status='trial_scheduled'` is written; `trial_classes` never populated. | [leads-client.tsx:320-342](src/app/[locale]/(dashboard)/leads/leads-client.tsx#L320-L342) | `tdd-guide` | `systematic-debugging` | L1 → **L3** |
| **M-B2** | CRITICAL | **Convert-to-student is cosmetic** — flips status + `converted_at`; creates **no student, membership, or invoice**; `converted_student_id` stays NULL. Most misleading "✅ Complete" claim. | [leads-client.tsx:108-160](src/app/[locale]/(dashboard)/leads/leads-client.tsx#L108-L160) | `architect` (design atomic onboarding txn) → `database-reviewer` | `test-driven-development` (test: convert ⇒ student row exists) | L1 → **L3** |
| **M-B3** | MEDIUM | No notification: staff not told of new public lead; lead not told when trial scheduled / converted. | grep: 0 producers | `tdd-guide` | `test-driven-development` | L1 → **L3** (depends M0) |
| **M-B4** | MEDIUM | No trial **lifecycle**: no coach assigned to trial, no `trial_completed → follow-up` reminder, no outcome capture feeding convert. | leads-client; `trial_classes` unused | `architect` | `brainstorming` | L1 → **L3/L4** |

---

## Track C — Enroll → Attend → Progress → Bill

| ID | Sev | Gap | Evidence | ECC Role | Superpower | Lens (→target) |
|----|-----|-----|----------|----------|-----------|----------------|
| **M-C1** | MEDIUM | Attendance never **notifies parent/student** on absence/late. | [coach/attendance/page.tsx:223-281](src/app/[locale]/coach/attendance/page.tsx#L223-L281); 0 producers | `tdd-guide` | `test-driven-development` | L2 → **L3** (depends M0) |
| **M-C2** | MEDIUM | Attendance not linked to **PT credit decrement** (attending a PT session doesn't call `increment_sessions_used()`). Overlaps M-A6. | grep: 0 `.rpc()` | `tdd-guide` | `systematic-debugging` | L1 → **L3** |
| **M-C3** | MEDIUM | No **promotion-eligibility signal** — coach/admin gets no "eligible for promotion" indicator from attendance counts. | belt-engine has no eligibility input | `architect` | `brainstorming` | L1 → **L4** (feedback loop) |
| **M-C4** | MEDIUM | Belt promotion fires **no notification** to student/parent. | [belt-engine-client.tsx:225-228](src/app/[locale]/(dashboard)/belts/belt-engine-client.tsx#L225-L228); 0 producers | `tdd-guide` | `test-driven-development` | L2 → **L3** (depends M0) |
| **M-C5** | HIGH | No **membership expiry / renewal / overdue** reminders; `auto_renew` column unused; overdue invoices never remind. | grep: no renew/reminder logic; `auto_renew` in [database.ts:2004](src/types/database.ts#L2004) | `architect` → `database-reviewer` | `test-driven-development` | L1 → **L3** |
| **M-C6** | LOW | No **enrollment confirmation** to student; enrollment state only implicitly visible via schedule. | (dashboard)/classes | `tdd-guide` | `test-driven-development` | L1 → **L3** (depends M0) |

---

## Roll-up by Severity

| Sev | Count | IDs |
|-----|:--:|-----|
| CRITICAL | 2 | M0, M-B2 |
| HIGH | 6 | M-A1, M-A3, M-A5, M-A6, M-B1, M-C5 |
| MEDIUM | 7 | M-A2, M-A4, M-B3, M-B4, M-C1, M-C2, M-C4 |
| LOW | 1 | M-C6 |

**Dependency:** M0 (notification substrate) blocks M-A4, M-B3, M-C1, M-C4, M-C6 and the notification half of every other gap. Build it first → then the three tracks run in parallel.

→ Prompts: [`cycle-5-prompts.md`](./cycle-5-prompts.md)
