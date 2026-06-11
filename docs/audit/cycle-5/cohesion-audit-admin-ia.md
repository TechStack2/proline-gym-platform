# Cohesion Audit & Journey-Centric Admin IA — proposal (Cycle 5 / V1 / IA)

> **Auditor deliverable, 2026-06-11.** Decision locked with the operator: **IA-first** — this audit → operator approves the IA → IA slice(s) jump the queue ahead of B3 → all remaining V1 slices (B3/D2/D3/F3/G1/E1/G2) land *into* the new IA, not as new tabs. Companion mandate: **tenant-clean rule** (white-label readiness — gym-specific content/policy in DATA, never code).

## 1. The problem, stated precisely

The promise to Proline: *replace Excel + paper + WhatsApp with one system that manages the full cycle simply.* The gym's daily questions are person- and workflow-shaped:

- "Who's in tonight's class? Mark them." · "Has Ali paid this month?" · "How many PT sessions does Maya have left?" · "Who asked to join Ladies and is waiting on approval?" · "Who do I need to chase?"

The current admin IA is **schema-shaped**: one tab per database table. Answering any of the questions above means visiting 3–5 tabs and joining the answer in your head — which is *exactly* the Excel workflow we're replacing, with extra clicks.

## 2. Current state — evidence (read from code, not assumed)

### 2.1 Tab inventory (the over-spread)

`DashboardTabConfig.ts` gives the **owner 17 nav items**: dashboard, students, classes, schedule, attendance, payments, invoices, ptSessions, rentals, camps, leads, coaches, belts, disciplines, reports, settings, profile. On mobile: 4 primary + **13 buried in "More"**. Receptionist: 7. Head coach: 9.

| Defect | Evidence |
|---|---|
| **Coaches tab silently broken on desktop** | `Sidebar.tsx` `ROLE_NAV.owner` includes `'coaches'` but `ALL_NAV_ITEMS` has no such item → filtered out, never renders. Mobile config *does* have it → desktop/mobile nav disagree. |
| **Two divergent nav sources** | `Sidebar.tsx` (15 items, desktop) vs `DashboardTabConfig.ts` (17, mobile). belts/disciplines reachable only on mobile-More. |
| **Member file is a husk** | `students/[id]/page.tsx` passes `memberships={[]}` and `beltProgressions={[]}` **hardcoded** — no membership status, no PT credits, no registrations, no invoices/payments on the member's page. The system cannot answer "has X paid / sessions left" *from the member file*. |
| **Money split in two** | `/payments` and `/invoices` are sibling tabs for one workflow (issue → settle, D1's invoice=obligation / payment=settlement). Daily reconciliation spans both. |
| **No approvals surface** | B2 registration requests live under classes; PT requests under /pt; trial requests coach-side; waitlist promotions fire silently. Staff must *poll tabs* to discover work. |
| **Dead/deferred tabs still shipped** | `/rentals` (V1.1 by scope-lock), `/reports` + `/attendance/history` (DOA — `class_schedules.date` vs `day_of_week` mismatch, known finding), `/camps` (E1 not built yet). Clutter that demos badly. |

### 2.2 Cross-role loop map (admin ⇄ student ⇄ coach)

Per journey: does the admin action propagate to the other roles, and does state flow back?

| Journey | Admin → others | State back | Verdict |
|---|---|---|---|
| Lead → member (23R) | convert RPC creates member; notification | lead status | ✅ closed loop; surface is a standalone tab |
| Class registration (B2) | approve(+discount) → invoice → roster; student portal request → notify | waitlist auto-promote, cancel | ✅ closed loop; **discovery gap** — requests buried under classes |
| PT delivery (C1) | approve+invoice → coach roster → log/complete → credits decrement | credits, no-show/cancel per policy | ✅ closed loop; same discovery gap |
| Billing (D1) | issue_invoice/record_payment canonical | portal billing reflects | ✅ services solid; admin surface split payments/invoices |
| Attendance (24R) | coach/staff mark → streaks, member progress | portal progress | ⚠️ marking works; **history/reports DOA**; coach view has no date picker |
| Membership (product #1) | plans exist; **no member-visible membership state** (`memberships=[]`) | — | ❌ biggest gap; D2/D3 will build on this |
| Notifications (F2/FK) | producer pattern sound, login-less fixed | — | ⚠️ **bell only on mobile dashboard**; desktop stub; portal/coach have none → propagation exists but is *invisible* |

**Conclusion:** the *service layer* loops are real and verified green (the strangler worked). The cohesion failure is in the **presentation layer**: work arrives invisibly (no inbox, no bell), and person-state is shredded across tabs (no member file). These two surfaces are the gap between "features pass CI" and "the gym actually runs on this."

## 3. Proposed IA — 7 journey-centric workspaces (from 17 tabs)

Organized by the gym's operating rhythm, not the schema:

| # | Workspace | Absorbs | What it is |
|---|---|---|---|
| 1 | **Today** (default) | dashboard, attendance(today) | Front desk: today's classes with one-tap roster/check-in, today's PT sessions, walk-in quick actions (new lead / new member / record payment), today's cash tally (D1 daily per-method) |
| 2 | **Inbox** | — (new) | Unified actionable queue with badge: class-registration requests (B2), PT requests, trial requests, waitlist promotions, overdue invoices (D3 later), expiring PT packages. Approve/decline *in place* |
| 3 | **Members** | students, leads, belts(per-member) | Search → **Member-360 file**: identity, membership state, class registrations, PT credits remaining, attendance, belt progress, invoices+payments, notes. Tabs: **Active / Prospects** (lead pipeline as a person-status, not a separate world — `convert_lead_to_member` already moves them across) |
| 4 | **Schedule** | classes, schedule | Weekly grid (admin twin of the LP landing grid) + class CRUD + rosters + per-class fee |
| 5 | **Money** | payments, invoices | One ledger: issue → settle → daily reconcile (USD/LBP/OMT/Whish), per-member drill-in; dunning lands here (D3) |
| 6 | **Team** | coaches, pt(assignment) | Coach roster, PT assignment, (un-breaks the dead Coaches tab) |
| 7 | **Settings** | settings, disciplines, belts(config), plans | Gym config: policies, membership plans, disciplines, rank systems — also the future white-label per-gym config home |

Mobile primary: **Today · Inbox · Members · Schedule · More**(Money/Team/Settings). Profile → avatar menu.

**Removed from V1 nav:** rentals (V1.1), camps (returns with E1), reports (returns with the V1.1 attendance-reporting repair — currently DOA, hiding it is honest), standalone attendance/belts/disciplines/leads/invoices/payments (absorbed above). Routes can keep redirects; nothing is deleted, only re-homed (Commandment 8: archive, don't delete).

**Student portal & coach app:** structures are already lean (7 / 6 tabs) and journey-shaped — keep. Fixes ride along: notification bell everywhere (portal/coach/desktop), portal home shows membership state + PT credits (same Member-360 data, self-view).

## 4. Execution plan (two slices, then resume the punch-list)

- **IA-1 — Nav + Inbox + Today** (one coder prompt): single nav source of truth (kill the Sidebar/TabConfig divergence), 7-workspace shell with redirects from old paths, the Inbox (unified pending queues from existing tables — no new schema), Today front-desk view, bell on all three shells. *Mostly re-composition of verified surfaces; low schema risk.*
- **IA-2 — Member-360 + Money merge** (one coder prompt): the real member file (replace the hardcoded `[]`s with memberships, registrations, PT credits, billing, attendance, belt state — all queries exist in scattered pages today), Active/Prospects tabs, unified Money ledger.
- Then **B3 family/household** lands *inside* Member-360 (household ties on the member file), **D2 freeze/upgrade** = actions on the member file's membership card, **D3 dunning** = Inbox queue + Money view, **G1 WhatsApp** = delivery channel for the same notifications the Inbox/bell surface.

Each slice keeps the standing bar: design doc → one prompt → e2e behavior-green in CI → auditor verify → FF merge + milestone tag.

## 5. White-label rider (tenant-clean rule — active now)

Every IA surface reads gym-scoped data (already true via RLS). New rule enforced in review from this slice on: **no Proline-specific copy/policy/branding hardcoded in code or i18n defaults** — it goes in gym-scoped tables/settings. Known accepted debt: the LP landing's brand content (re-homed in the post-V1 WL phase: landing CMS, onboarding wizard productizing TI's `seed_e2e_gym`, slug/subdomain routing, per-gym WhatsApp config, platform billing).

## 6. Decision requested from operator

1. **Approve the 7-workspace IA** (§3) — or amend (e.g., keep Leads standalone, different workspace names).
2. **Approve the two-slice plan** (§4) — IA-1 then IA-2, then B3.
On approval, the auditor issues `prompt-IA1-nav-inbox-today.md` with the activation block.

---

## Addendum (2026-06-11, operator-approved IA): Schedule workspace — recurring classes + PT, multi-discipline, multi-coach

**Operator question:** does Schedule cover PT scheduling too, with multiple disciplines and multiple PT coaches — and what's the best-practice shape?

**The two calendar species (never conflate their *editing* models):**
1. **Recurring group classes** — a weekly *template* (`classes` + `class_schedules.day_of_week`): low churn, capacity + roster, discipline-typed. Edited as a timetable ("Ladies moves to 7pm Wednesdays" changes every future week).
2. **PT appointments** — one-off *bookings* (`pt_sessions` with a concrete date/time, per coach, per student, drawing down a package): high churn, rescheduled individually.

**Industry pattern (Mindbody / Glofox / TeamUp / Arbox):** separate editing models, **one unified viewing surface** — a single calendar with two views and shared filters:
- **Week · Timetable view** — the recurring grid (rows = time, cols = days), color-coded by discipline, discipline/coach filters. This is also the admin twin of the public landing grid (LP).
- **Day · Coach diary view** — resource columns = coaches; each column shows that coach's classes *and* PT appointments for the day. This is how multi-coach PT stays legible.
- PT sessions render on both views as appointment blocks; clicking opens the existing C1 session lifecycle (deliver / no-show / cancel per gym policy).
- **Conflict guard:** when booking/rescheduling a PT session, warn if the coach overlaps their own class slot or another PT session (cheap query, high trust value — replaces the "phone-call double-check").
- **Deliberately deferred (lean):** coach-availability/working-hours modeling and member self-booking of PT slots → V2. At Proline, PT times are agreed person-to-person (WhatsApp/front desk) and staff enter them — the diary + conflict guard serves that reality without inventing an availability engine.

**Sequencing:** this is **IA-3 (Schedule unification)** after IA-2 — IA-1's *Today* already surfaces the daily slice of both species (today's classes + today's PT sessions), so the front desk gets the daily answer immediately; IA-3 adds the week/diary planning surface. B3 then follows IA-3? No — **B3 follows IA-2; IA-3 can run after B3** if demo pressure favors the member file first (auditor's call at that checkpoint).
