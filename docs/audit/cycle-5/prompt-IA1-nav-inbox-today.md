# CODER PROMPT IA-1 — Journey-centric nav + Inbox + Today + bell everywhere

> **For:** the MAIN coding agent (single track) · **Issued by:** Project Auditor · **Sequence:** V1 / IA phase, slice 1 of 2–3 (operator-approved 2026-06-11; jumped the queue ahead of B3). Branch `prompt-ia1-nav-inbox-today` off current `main`. Self-contained, but READ FIRST: [`cohesion-audit-admin-ia.md`](./cohesion-audit-admin-ia.md) (the why + the target IA + the Schedule addendum).

## Strategic context
Benchmark Portal C (admin) sits ~2.4/5; the gap driving adoption risk is **workflow discovery + front-desk efficiency**: the owner faces **17 schema-shaped tabs**, work arrives invisibly (no approvals inbox, bell missing on desktop/portal/coach), and desktop/mobile navs are two divergent configs (the desktop Coaches entry is silently dead — `Sidebar.tsx` lists `'coaches'` in `ROLE_NAV` but has no matching `ALL_NAV_ITEMS` entry). Roadmap: IA-first (this + IA-2 Member-360/Money), then B3/D2/D3 land INTO the new IA. **Tenant-clean rule active:** no gym-specific copy/policy hardcoded — i18n keys + gym-scoped data only.

## Role/Skill/Lens
`architect` (IA/shell) + `e2e-runner`. Superpower: `verification-before-completion`. **Recomposition slice: NO new schema, NO new business logic** — reuse existing server actions/RPCs/queries.

## Build

### 1. Single nav source of truth — 7 workspaces
One shared nav config consumed by BOTH the desktop `Sidebar.tsx` and the mobile `DashboardTabConfig.ts` paths (kill the divergence; this inherently fixes the dead desktop Coaches entry). Workspaces + role filtering (owner sees all; receptionist: Today/Inbox/Members/Money/Profile-menu; head_coach: Today/Inbox/Members/Schedule/Team):

| Nav item | Route | Interim target (full surface comes later) |
|---|---|---|
| **Today** (default) | `/today` | NEW (this slice). `/dashboard` → redirect `/today` |
| **Inbox** (badge = pending count) | `/inbox` | NEW (this slice) |
| **Members** | `/students` | existing list (label change). Add a small "Prospects →" header link to `/leads` (absorbed properly in IA-2) |
| **Schedule** | `/schedule` | existing page + segmented links **Schedule | Classes** (`/classes`) until IA-3 unifies |
| **Money** | `/payments` | existing AR history view + segmented links **Payments | Invoices** (`/invoices`) until IA-2 merges |
| **Team** | `/coaches` | existing page (now actually reachable on desktop) |
| **Settings** | `/settings` | existing page + a "Configuration" links row → Disciplines / Belts / Membership plans |

Mobile primary tabs: **Today · Inbox · Members · Schedule · More** (More sheet = Money, Team, Settings, Profile). Desktop sidebar: the 7 + profile at the bottom. **Remove from nav** (routes stay reachable by URL — nothing deleted): rentals, camps, reports, attendance, belts, disciplines, leads, invoices, payments, dashboard.

### 2. `/today` — the front-desk view (staff)
- **Today's classes:** `classes` + `class_schedules` where `day_of_week` = today (gym-scoped, active), ordered by time — each row: time, class name, discipline, enrolled/capacity, one-tap link into the EXISTING attendance-marking flow for that class.
- **Today's PT sessions:** `pt_sessions` scheduled today (gym-scoped) — time, coach, student, status, link into the existing C1 session lifecycle.
- **Quick actions:** + New lead, + New member, Record payment — links to the existing flows.
- **Today's collections tally** per method (cash USD/LBP, OMT, Whish) — reuse the D1/AR daily per-method tally logic from the payments history surface (extract to a shared component if needed).
- Proper empty states (i18n), Arabic-RTL.

### 3. `/inbox` — unified actionable queue (staff)
Sections (each: count + rows + INLINE actions reusing EXISTING actions/RPCs — do not re-implement guards):
1. **Class-registration requests** — pending `class_registrations` (B2): approve (+ optional % / fixed discount, as the B2 action already supports) / decline, inline.
2. **PT requests** — pending `pt_packages` requests (22R): approve(→invoice)/decline via the existing flow.
3. **Trial bookings** — pending `trial_classes` (lead journey), if a pending state exists in that flow; otherwise omit the section (do NOT invent a new workflow).
4. **Recent waitlist auto-promotions** (informational, B2) — so staff see what the system did.
Nav badge shows total actionable count. Empty state = "Inbox zero" (i18n).

### 4. Bell everywhere
Mount the notification bell (unread badge + recent list + mark-read + link to the full list) on all three shells: **desktop dashboard header** (currently a stub), **portal shell**, **coach shell**. Recipient-scoped reads via existing RLS (recipient-only SELECT). **Do NOT touch producer logic, the sanctioned F2 pattern, or any RLS policy.**

### 5. i18n
ar/en/fr keys for every new label; no `MISSING_MESSAGE`; no hardcoded Proline copy (tenant-clean).

## Verify (e2e, ephemeral TI gym — the proof)
1. Owner: nav shows exactly the 7 workspaces (desktop sidebar AND mobile tabs agree); `/dashboard` redirects to `/today`.
2. `/today` lists the seeded class (TI seed schedules all weekdays per 000026 — deterministic) with a working link into attendance marking.
3. Cross-role loop: portal student submits a class-registration request → staff `/inbox` shows it with a badge → inline approve → registration active + invoice exists (assert via the existing B2 checks) → student notified.
4. Bell: a notified user sees the unread badge on their shell (portal at minimum).
5. Full suite green — no regression (33+ tests).

## Acceptance
1. 7-workspace nav, single config, desktop=mobile, dead Coaches entry fixed, old tabs out of nav, `/dashboard`→`/today` redirect — green in E2E CI (run ID/URL).
2. Inbox actionable (registration approve round-trip proven), badge count live.
3. Today functional (classes + PT + quick actions + tally).
4. Bell on 3 shells; producer/RLS untouched.
5. `tsc` + `build` clean; i18n complete; no new schema/business logic.

## Hygiene
Branch `prompt-ia1-nav-inbox-today` off `main`; **dev port 3000**; scope every `git add` (never `-A`); **no Claude/Co-Authored-By trailer**; TI ephemeral gym for e2e; never weaken RLS/auth to pass tests.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / IA-1 — Journey-centric nav + Inbox + Today`: nav before/after (17→7), the queues wired and which existing actions they reuse, bell mounts, CI run ID/URL, an explicit **"Cross-role inbox approve round-trip: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Next: **IA-2 (Member-360 + Money merge)**.

---

### Copy-paste activation block for the coder
```text
You are the MAIN coding agent for the PRO LINE Gym Platform (single track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-ia1-nav-inbox-today off main (git checkout main && git pull && git checkout -b prompt-ia1-nav-inbox-today).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-IA1-nav-inbox-today.md
and read first for context: docs/audit/cycle-5/cohesion-audit-admin-ia.md

This is a RECOMPOSITION slice — NO new schema, NO new business logic; reuse existing server
actions/RPCs. Do: (1) ONE shared nav config for desktop Sidebar + mobile tabs (kills the divergence;
fixes the silently-dead desktop Coaches entry) with 7 role-filtered workspaces: Today(/today, default;
/dashboard redirects there) · Inbox(/inbox, pending-count badge) · Members(→/students, + "Prospects →"
link to /leads) · Schedule(→/schedule, segmented links Schedule|Classes) · Money(→/payments, segmented
links Payments|Invoices) · Team(→/coaches) · Settings(→/settings + Configuration links row:
disciplines/belts/plans). Mobile primary: Today·Inbox·Members·Schedule·More(Money/Team/Settings/
Profile). Remove from nav (routes stay): rentals, camps, reports, attendance, belts, disciplines,
leads, invoices, payments, dashboard. (2) /today: today's classes (day_of_week=today, gym-scoped,
active; link into existing attendance marking) + today's pt_sessions (link into C1 lifecycle) + quick
actions (new lead/new member/record payment) + today's per-method collections tally (reuse D1/AR tally
logic). (3) /inbox: pending class_registrations (inline approve+discount/decline via existing B2
actions), pending pt_packages requests (existing 22R flow), pending trial_classes IF that pending state
already exists (do not invent), recent waitlist auto-promotions (informational); badge = actionable
count. (4) Notification bell (unread badge + recent + mark-read) on desktop dashboard header, portal
shell, coach shell — recipient-scoped reads only; do NOT touch producer logic or any RLS. (5) i18n
ar/en/fr for all new labels; no MISSING_MESSAGE; tenant-clean (no hardcoded gym copy).
Verify in the E2E CI run, not tsc: 7-item nav desktop=mobile; /dashboard→/today; /today lists the
seeded class; portal student submits class-registration request → staff /inbox badge+row → inline
approve → active + invoice + student notified; bell badge visible to a notified portal user; FULL suite
green (no regression). If the sandbox can't run the browser, push so e2e.yml runs and report the run
ID; do NOT fabricate. Dev port 3000; scope every git add (never -A); no Claude/Co-Authored-By trailer;
never weaken RLS.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / IA-1 — Journey-centric nav + Inbox +
Today": nav 17→7 before/after, queues wired + which existing actions they reuse, bell mounts, CI run
ID/URL, an explicit "Cross-role inbox approve round-trip: PASS/FAIL" line, and a DRAG READ. Then STOP
and tell me IA-1 is ready for review.
```
