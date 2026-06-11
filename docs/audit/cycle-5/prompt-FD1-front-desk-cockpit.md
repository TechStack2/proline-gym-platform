# CODER PROMPT FD-1 — Front-Desk Cockpit: Today 2.0 card framework + Member-360 contextual actions + working lists

> **For:** the MAIN coding agent (single track) · **Issued by:** Project Auditor · **Sequence:** after ADM-2 (`milestone/ADM2-green`). Branch `prompt-fd1-cockpit` off current `main`. READ FIRST: [`../design-front-desk-cockpit.md`](../design-front-desk-cockpit.md) (operator-ratified study — §1–3 are this slice).

## Strategic context
The operator's verdict on the current surfaces: Today is under-utilized, Member-360's action pills navigate to WRONG/global pages (verified: "New Registration" → the create-a-class page; PT → the global aggregate), and the Members/Prospects lists are read-only walls. This slice turns the admin from "data is visible" into "the system runs the morning shift" — and establishes **Today + Member-360 as the two permanent docking stations** every later slice (PT-1 refill, ML-1 renewals/dunning, G1 messaging) ships into. **Tenant-clean rule active.**

## Role/Skill/Lens
`architect` + `e2e-runner`. **Recomposition: zero schema changes** (a seed-only tweak to `seed_e2e_gym` is allowed for deterministic card data — no table/policy changes). Every action delegates to existing verified flows (B2 registration actions, D1 `record_payment`/`issue_invoice`, 23R lead actions).

## Build

### 1. Today 2.0 — the card framework
A shared `ActionCard` pattern: **count/amount headline · item rows (drill-down links) · one-tap action per row · collapses to a single "✓ none today" line when empty.** Stack on `/today` in this order:
1. **Now / Next** — current+next class with enrolled/capacity → roster/attendance (exists; restyle into the framework).
2. **Inbox** — actionable count by type → `/inbox`.
3. **Expiring memberships** — `student_memberships` ending today + next 7 days (gym-scoped, active): member name, plan, end date → drill to Member-360 membership card; row action: call (tel:) until ML-1 docks "renew".
4. **Money today** — invoices due today + overdue (count + USD total) → `/money` filtered; collected today per method (reuse the daily tally); row action on due invoices: record payment (the §2 modal).
5. **PT today** — today's sessions (exists, restyle). Leave a documented docking slot for PT-1's refill nudge.
Keep the quick-actions row. The framework must make adding a future card a ~20-line affair — that's its acceptance.

### 2. Member-360 — member-contextual actions (fix the wrong-target pills)
Rule: **no action on a member's file navigates to a global page.** All pills open modals/sheets pre-filled with THIS member:
- **Register to class** (fixes the `/classes` bug): active-class picker (capacity + fee shown) → staff-direct registration = existing B2 `request_class_registration` + `approve_class_registration` (with optional discount) composed — NO new business logic; result lands on the file's registrations panel immediately.
- **Record payment**: D1 flow in a modal, member + their open invoices pre-selected.
- **PT pill**: anchors to the file's own PT panel (no more global `/pt`); panel actions (sell/book) dock in PT-1/PT-2 — leave the documented slot.
- Audit every remaining link/pill on the file for dropped member context; fix and name them.

### 3. Members & Prospects lists — work the list
- **Members:** search by **phone** + name (server-side, profiles join); row status badges: `active` / `expiring ≤7d` (end_date) / `owing` (has pending/partial invoices) — frozen docks in ML-1; filter chips: *owing · expiring soon · no guardian (minors) · joined ≤30d*; row quick-actions: call, open file, record payment (the §2 modal).
- **Prospects:** stage chips with counts (23R statuses), `next_action_date` on rows with **overdue-follow-up highlight**, row actions = existing 23R flows (log contact, schedule trial, convert).

### 4. Seed tweak (deterministic cards) + i18n
Extend `seed_e2e_gym` (seed-only migration, no schema): one seeded membership ending TODAY and one invoice due TODAY in the run gym. i18n ar/en/fr for all new labels; RTL; no `MISSING_MESSAGE`.

## Out of scope
PT sell/book actions (PT-1/PT-2), renew/freeze actions and dunning (ML-1), portal-invite (ON-1), any schema/policy change, kanban boards.

## Verify (e2e, ephemeral TI gym)
1. **Today:** Expiring card lists the seeded ending-today member → drill lands on their file; Money card shows the due-today invoice + today's collected tally updates after a recorded payment; empty cards collapse (assert at least one "none today" line).
2. **Member-360:** Register-to-class modal round-trip — pick class → approve with discount → registration on the file + invoice exists (B2 assertions); Record-payment modal pre-selects the open invoice → payment reflects on file + Money card.
3. **Lists:** phone-search finds the seeded member; *owing* chip filters to the member with the pending invoice; Prospects stage chips render counts and convert stays green (23R no-regression).
4. Full suite green — no regression (45+ tests).

## Acceptance
1. Card framework live with the 5 cards + collapse behavior — green in E2E CI (run ID/URL); adding-a-card path documented (the PT-1 docking slot).
2. Zero global-navigation actions left on Member-360 (list the fixed pills); both modals proven in CI.
3. Lists: phone search + badges + filters + prospect stages proven.
4. Zero schema/policy diffs (seed-only migration allowed); i18n complete; `tsc`+`build` clean.

## Hygiene
Branch `prompt-fd1-cockpit` off `main`; **dev port 3000** (restart for the operator when done); scope every `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; TI ephemeral gym; apply the seed migration via Verify-Foundation before e2e; stay on your branch — auditor docs may land on main while you work (do not rebase mid-run; report divergence instead).

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / FD-1 — Front-Desk Cockpit`: the card framework design, fixed Member-360 pills (named), list upgrades, CI run ID/URL, an explicit **"Today cards actionable + Member-360 fully member-contextual + lists filterable: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Next: **PT-1** (prompt will be pre-staged — zero latency).

---

### Copy-paste activation block for the coder
```text
You are the MAIN coding agent for the PRO LINE Gym Platform (single track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-fd1-cockpit off main (git checkout main && git pull && git checkout -b prompt-fd1-cockpit).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-FD1-front-desk-cockpit.md
context: docs/audit/design-front-desk-cockpit.md (operator-ratified; §1–3 = this slice)

RECOMPOSITION — zero schema/policy changes (one seed-only tweak to seed_e2e_gym allowed); every action
delegates to existing verified flows (B2, D1, 23R).
Do: (1) TODAY 2.0: a shared ActionCard framework (count headline · drill rows · one-tap action ·
collapses to "✓ none today" when empty) with cards in order: Now/Next class (restyle existing) · Inbox
count · EXPIRING MEMBERSHIPS (student_memberships ending today+7d → drill to Member-360; tel: action) ·
MONEY TODAY (invoices due today + overdue count/USD + collected-per-method tally; record-payment row
action) · PT TODAY (restyle; leave a documented docking slot for PT-1's refill card). Adding a future
card must be a ~20-line affair. (2) MEMBER-360: no action may navigate to a global page — "Register to
class" pill (currently links to the CREATE-A-CLASS page — the bug) becomes a member-prefilled modal:
active-class picker (capacity+fee) → compose existing request_class_registration +
approve_class_registration (optional discount), result lands on the file; "Record payment" becomes a D1
modal with the member's open invoices pre-selected; PT pill anchors to the file's own PT panel (slot
documented for PT-1 sell / PT-2 book); audit + fix every other context-dropping link and NAME them.
(3) LISTS: members — server-side phone+name search, row badges (active / expiring≤7d / owing=pending-or-
partial invoices), filter chips (owing · expiring soon · no guardian minors · joined≤30d), row actions
(call / file / record payment); prospects — 23R stage chips with counts, next_action_date with OVERDUE
highlight, existing row actions. (4) Seed tweak: one membership ending TODAY + one invoice due TODAY in
the run gym (seed-only migration, no schema). i18n ar/en/fr, RTL, tenant-clean.
Verify in the E2E CI run, not tsc: Expiring card lists the seeded member → drill to file; Money card
shows the due-today invoice and the tally moves after a recorded payment; at least one card collapses to
"none today"; register-to-class modal round-trip (class pick → discount approve → registration + invoice
on file); record-payment modal pre-selects the open invoice → reflects on file + Money card; phone
search finds the member; owing chip filters correctly; prospects chips + convert green (23R
no-regression); FULL suite green (45+, no regression). Apply the seed migration via Verify-Foundation
first. If the sandbox can't run the browser, push so e2e.yml runs and report the run ID; do NOT
fabricate. Dev port 3000; scope every git add + git show --stat; no Claude/Co-Authored-By trailer; never
weaken RLS; stay on your branch (auditor docs may land on main — do not rebase mid-run; report
divergence).
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / FD-1 — Front-Desk Cockpit": the card
framework, fixed pills (named), list upgrades, CI run ID/URL, an explicit "Today cards actionable +
Member-360 fully member-contextual + lists filterable: PASS/FAIL" line, and a DRAG READ. Then STOP and
tell me FD-1 is ready for review.
```
