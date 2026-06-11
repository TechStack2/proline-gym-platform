# CODER PROMPT IA-2 — Member-360 file + unified Money ledger (+ Prospects tab, portal self-view)

> **For:** the MAIN coding agent (single track) · **Issued by:** Project Auditor · **Sequence:** V1 / IA phase, slice 2 (after IA-1 `milestone/IA1-green`). Branch `prompt-ia2-member360-money` off current `main`. READ FIRST: [`cohesion-audit-admin-ia.md`](./cohesion-audit-admin-ia.md) §3 (workspaces 3 & 5).

## Strategic context
The audit's biggest cross-role gap: **the member file is a husk** — `students/[id]/page.tsx` passes `memberships={[]}` and `beltProgressions={[]}` hardcoded, so the system cannot answer the gym's three daily questions from one place: *"has X paid?" · "how many PT sessions left?" · "what is X registered in?"* — exactly what Proline still tracks on paper. This slice is the IA centerpiece: **B3 (family), D2 (freeze/upgrade), and D3 (dunning) all land on this surface next**, so its panel layout is load-bearing. Money is the same story for the cash drawer: one workflow (issue → settle → reconcile, D1) split across two tabs. **Tenant-clean rule active.**

## Role/Skill/Lens
`architect` + `e2e-runner`. **Recomposition slice: NO new schema, NO new business logic.** Every panel reads existing tables through existing patterns; every action delegates to existing verified actions/RPCs (`issue_invoice`, `record_payment`, B2 registration actions, 22R/C1 PT actions). If a read needs a column that doesn't exist, STOP and report — do not invent migrations (that's how the attendance DOA happened).

## Build

### 1. Member-360 — rebuild `/students/[id]`
Header: identity (localized name, phone, age/DOB, gender, avatar, current belt, active/inactive status) + guardian links if any (`guardian_students` → guardians; display-only — B3 extends this).
Panels (each with real queries, loading-safe, i18n empty states):
1. **Membership** — `student_memberships` + plan name/price, status, current period, history. (D2 adds freeze/upgrade actions here later — leave a clean actions area.)
2. **Class registrations** — `class_registrations` for this student: class, status (pending/active/waitlisted/cancelled), monthly fee, discount. Pending ones deep-link to `/inbox`.
3. **PT** — assignment(s) + packages: **sessions remaining / total**, validity window, status; recent `pt_sessions` with outcomes (C1 statuses).
4. **Billing** — this student's `invoices` (status chips) + `payments` (method, currency) — newest first; **Record payment** inline via the existing D1 flow; link into Money.
5. **Attendance** — recent records (existing query, kept) + simple totals (last 30d count; reuse 24R logic if exported).
6. **Belt progress** — `belt_promotions` history (replaces the hardcoded `[]`); current rank.
Quick actions row: Record payment · New class registration (existing B2 entry) · link to PT flows. Reuse/replace the existing `StudentDetail` component as needed — don't keep dead props.

### 2. Members list — Active | Prospects tabs
`/students` gets segmented tabs: **Active** (current list) | **Prospects** — the existing leads pipeline surface re-homed (reuse the `/leads` page's components/queries; `/leads` becomes a redirect to `/students?tab=prospects`). Lead → member conversion (`convert_lead_to_member`) keeps working from the Prospects tab; a converted person now appears under Active (it already does — same flow).

### 3. Money — one ledger at `/money`
New `/money` workspace replacing the IA-1 interim segments: tabs **Overview** (today's per-method tally — reuse `lib/billing/daily-tally.ts` — + outstanding invoices summary: count + USD total of pending/partial) · **Invoices** (the existing invoices surface, repaired if any residual schema mismatch surfaces — report what you fix) · **Payments** (the AR history view). Per-row student names deep-link to that member's Member-360 billing panel. Nav `Money` → `/money`; `/payments` and `/invoices` redirect into the tabs. (D3 dunning lands in Overview later.)

### 4. Portal self-view rider
Portal home (`/portal`): a compact "my status" card — membership state, **PT sessions remaining**, next scheduled class/PT — same queries, member-scoped via existing RLS. (The member answers their own top questions without calling the gym.)

### 5. Cleanup rider (from IA-1 review)
The attendance toasts use inline `locale === 'ar' ? … : …` ternaries — replace with proper i18n keys (ar/en/fr). All new IA-2 labels: ar/en/fr, no `MISSING_MESSAGE`.

## Verify (e2e, ephemeral TI gym — drive state through REAL flows, then read the file)
1. Run the existing journeys in the test gym: registration request → inbox approve (→ invoice) ; PT request → approve (→ package) ; record a payment (D1).
2. **Member-360 proof:** that student's file now answers all three questions with live data — active class registration visible; PT **remaining/total** correct after approval (and decrements after `complete_pt_session` if cheap to drive); invoice + payment rows present; belt panel renders (empty state OK if no promotions in-run).
3. **Money proof:** `/money` Overview tally reflects the recorded payment; Invoices tab shows the issued invoice; student name deep-links to the member file. `/payments` + `/invoices` redirects land on the right tabs.
4. **Prospects proof:** `/students?tab=prospects` renders the pipeline; `/leads` redirects there; conversion still green (existing 23R coverage must not regress).
5. **Portal proof:** the student's portal home shows membership state + PT remaining.
6. Full suite green — no regression (35+ tests).

## Acceptance
1. Member-360 renders all six panels from live data (no hardcoded `[]` props anywhere) — green in E2E CI (run ID/URL).
2. `/money` unified (Overview/Invoices/Payments), redirects in place, deep-links to member files.
3. Active|Prospects tabs live; `/leads` redirected; conversion unaffected.
4. Portal self-view card live.
5. `tsc`+`build` clean; i18n complete (incl. the toast cleanup); **zero migrations**; no new business logic; no RLS touched.

## Hygiene
Branch `prompt-ia2-member360-money` off `main`; **dev port 3000**; scope every `git add` (never `-A`); **no Claude/Co-Authored-By trailer**; TI ephemeral gym; never weaken RLS/auth.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / IA-2 — Member-360 + Money`: panels wired + their sources, anything repaired en route (named, like the IA-1 attendance rider), CI run ID/URL, an explicit **"Member file answers paid?/PT-left?/registered-where? from live data: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Next: the auditor decides **B3 (family) vs IA-3 (Schedule unification)** at that checkpoint.

---

### Copy-paste activation block for the coder
```text
You are the MAIN coding agent for the PRO LINE Gym Platform (single track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-ia2-member360-money off main (git checkout main && git pull && git checkout -b prompt-ia2-member360-money).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-IA2-member360-money.md
context: docs/audit/cycle-5/cohesion-audit-admin-ia.md (§3 workspaces 3 & 5)

RECOMPOSITION slice — ZERO new schema, ZERO new business logic; all reads via existing tables/patterns,
all actions delegate to existing verified flows (issue_invoice, record_payment, B2 registration actions,
22R/C1 PT actions). If a read needs a non-existent column, STOP and report — never invent migrations.
Do: (1) Rebuild /students/[id] as the Member-360 file: identity+belt+guardians header, then live panels —
Membership (student_memberships+plan; clean actions area for future D2), Class registrations (status/fee/
discount; pending → /inbox link), PT (packages: sessions REMAINING/total + validity; recent sessions),
Billing (invoices+payments newest-first + inline Record payment via D1), Attendance (recent + 30d count),
Belt history (belt_promotions — kills the hardcoded [] props). Quick actions row. (2) /students gets
Active | Prospects tabs — Prospects re-homes the existing /leads pipeline (reuse its components);
/leads redirects to /students?tab=prospects; convert_lead_to_member keeps working. (3) New /money
workspace: tabs Overview (daily per-method tally via lib/billing/daily-tally.ts + outstanding invoices
summary) · Invoices · Payments (existing surfaces re-homed; repair residual schema mismatches if any and
NAME them in the report); rows deep-link to the member file; nav Money → /money; /payments + /invoices
redirect into tabs. (4) Portal home self-view card: membership state + PT sessions remaining + next
class/PT (member-scoped via existing RLS). (5) i18n ar/en/fr for everything new + replace IA-1's inline
ar/en toast ternaries in attendance with real keys; no MISSING_MESSAGE; tenant-clean.
Verify in the E2E CI run, not tsc: drive real flows in the ephemeral gym (registration approve → invoice;
PT approve → package; record payment) then assert the member file answers paid?/PT-left?/registered-
where? from live data; /money Overview tally reflects the payment + Invoices tab shows the invoice +
deep-link works; /students?tab=prospects renders the pipeline and /leads redirects; portal home shows the
self-view card; FULL suite green (no regression, 35+). If the sandbox can't run the browser, push so
e2e.yml runs and report the run ID; do NOT fabricate. Dev port 3000; scope every git add (never -A); no
Claude/Co-Authored-By trailer; never weaken RLS. Leave the workspace checked out on your branch only
while working; do not touch main.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / IA-2 — Member-360 + Money": panels +
sources, anything repaired en route (named), CI run ID/URL, an explicit "Member file answers paid?/
PT-left?/registered-where? from live data: PASS/FAIL" line, and a DRAG READ. Then STOP and tell me IA-2
is ready for review.
```
