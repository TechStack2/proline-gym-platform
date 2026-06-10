# CODER PROMPT B2 — Recurring-Class Registration (request → approve → bill → enroll + waitlist)

> **For:** Coding agent (ONE agent, sequential) · **Issued by:** Project Auditor · **Sequence:** V1 slice #4 (after FK + AR). Branch `prompt-b2-class-registration` off `main`.
> **The spec is the design doc — read it first; authoritative:** 📎 [`docs/audit/cycle-5/journey-class-registration.md`](./journey-class-registration.md) (+ monetization model [[proline-monetization-model]]).
> Hand verbatim. Self-contained.

---

## Role, Skill, Lens
- **Act as `architect` + `database-reviewer`** (+ `tdd-guide` for notifications): `architect` models the registration state machine + capacity/waitlist; `database-reviewer` verifies the capacity & auto-promote mutations are **atomic + row-locked** (never over-capacity, never double-promote) and gym-scoped.
- **Apply superpower `test-driven-development`**: failing assertions first — "approve at capacity → waitlisted, no invoice"; "approve with a free spot → active + one monthly invoice"; "cancel an active → the lowest-position waitlisted is promoted → active + invoice + notify"; "capacity is never exceeded under concurrent approvals." Then `verification-before-completion`.
- **Lens:** the group-class analog of PT acquisition; reuse D1 `issue_invoice`, F2 notifications, B1's `class_enrollments` roster.

## Strategic context
**Benchmark**: self-service booking + **waitlist that auto-promotes & notifies** = **0/5** (biggest member gap). Proline's **product #3** (recurring-class registration, monthly fee, approval-gated). **V1 must-have.**
- **Do NOT build (defer):** **weekly pass** (V1.1 — design pricing to accept a weekly tier later, but build monthly only); **recurring monthly invoice *generation* + reminders** (that's **D3** — B2 establishes the entity + the *first* invoice only); **per-session drop-in booking** (V2 — no session-instances layer); **online self-payment** (V2 — billing is staff-recorded cash/OMT/Whish via D1).
- **Leapfrog:** Arabic-RTL portal request UI; dual-currency monthly fee; notifications shaped for WhatsApp (G1).

## The model (build exactly — design §4/§5)
- **`classes` +`monthly_fee_usd`/`monthly_fee_lbp`** (nullable; weekly tier later).
- **NEW `class_registrations`** = the billable monthly subscription + status machine + waitlist: `class_id, student_id, status` (`requested`/`active`/`waitlisted`/`cancelled`/`rejected`/`expired`), `waitlist_position`, `monthly_fee_usd`, `discount_pct` **or** `discount_amount_usd`, `start_date`/`end_date`, `invoice_id`, `approved_by`/`approved_at`, `requested_at`. RLS: member sees/creates own (in-gym); staff manage in-gym. One open registration per (class, student).
- **`invoice_type_enum` += `class_registration`.**
- **`class_enrollments` is the attendance roster (B1, unchanged):** an `active` registration **projects** an `is_active` enrollment row; a non-active one has none. **Do not change B1's attendance flow** — it keeps reading `class_enrollments`.
- **Standalone:** registration does **not** require a gym membership (independent product).

## Transactions (design §6) — all notifications via the sanctioned F2 pattern (authed action, recipient `profile_id`, RETURNING-free, guardian fan-out; the FK→profiles fix now lets login-less members persist)
- **T1 Request:** member requests in the portal (new browse+request UI) — or staff registers a walk-in. → `class_registrations` `requested`; eligibility (active class + age/belt) enforced. **`class_requested`** → staff (`createNotificationForRole` owner+receptionist).
- **T2 Approve(+discount)/Reject** (staff): **atomic capacity check** — free spot → `active` + **`issue_invoice(class_registration, monthly_fee − discount, monthly period)`** (reuse D1) + **project `class_enrollments`** + **`class_approved`** → member; full → `waitlisted` + position (**no invoice**) + **`class_waitlisted`**. Reject → `rejected` + reason. Discount bounded (% in [0,100]; amount ≤ fee).
- **T3 Capacity/Waitlist:** active count vs `classes.max_capacity`; waitlist FIFO via `waitlist_position`.
- **T4 Cancel → auto-promote** (member/staff, **free cancel**): → `cancelled`, remove the enrollment, **atomically promote the lowest-position waitlisted** → `active` + invoice + enrollment + **`waitlist_promoted`** → that member; re-compact positions. (Refund of an already-billed month = staff `refund_invoice` from D1, reference-only — not automatic.)
- **T5 Recurring seam:** set the monthly period (`start_date`/`end_date`) + the first invoice only. **D3 will generate subsequent months + reminders** — do not build recurring generation here.
- **T6 Member-visible status:** portal shows the member's registrations + status (active / waitlisted #n / requested) + monthly fee; attendance is B1 (roster already works).

## Edge cases — ACCEPTANCE ITEMS (design §8)
E1 one open registration per (class,student); **E2 capacity race row-locked (never > max_capacity); E3 cancel→promote atomic (no double-promote, positions re-compacted); E4 approve-when-full→waitlist; E5 bill ONLY on active (waitlisted not invoiced)**; E6 discount bounds (floor 0); E8 standalone (no membership needed); E9 eligibility at request + approval; E10 expiry frees the spot→promote; E11 login-less notifications persist; **E12 approve/promote is one transaction (status+enrollment+invoice never diverge).**

## Lock it under the harness (ephemeral gym + TI helpers)
`e2e/class-registration.spec.ts` (run gym, `visibleShell`/`expectNotification` via `/notifications`): request → `class_requested`; approve free → active + **one** monthly invoice + roster + `class_approved`; approve at capacity → waitlisted (no invoice); cancel active → **auto-promote** next → active + invoice + `waitlist_promoted`; member sees status; **capacity never exceeded**. No `MISSING_MESSAGE`.

## Acceptance Criteria
1. Full registration slice **green in E2E CI** (run ID/URL).
2. Capacity is **never exceeded**; waitlist **auto-promotes + notifies**; **billing fires only on the active transition** (one invoice, discounted, via `issue_invoice`).
3. Approve/promote/cancel are **atomic** (status ↔ `class_enrollments` ↔ invoice consistent); B1 attendance still reads the roster and works.
4. Notifications recipient-scoped (member+guardian, login-less persists), staff get `class_requested`; coaches not billing recipients.
5. i18n ar/en/fr (new keys); no `MISSING_MESSAGE`. `tsc`+`build` clean; no RLS/auth weakened.

> **Honesty rule:** verify in CI; if the sandbox can't run the browser, push so `e2e.yml` runs and report the run ID; do not fabricate.

## Hygiene
Scope every `git add` (never `-A`); `node_modules` gitignored; branch `prompt-b2-class-registration` off `main`; **dev on port 3000**; use the TI ephemeral-gym + helpers; **no Claude/Co-Authored-By trailer in commits**; don't weaken RLS.

## REQUIRED — Update the shared progress file
Append to **`audit-cycle-update.md`**, heading `## Cycle 5 / V1 / B2 — Recurring-Class Registration`. Include: per-transaction PASS/FAIL (T1–T6) with file:line, the capacity/waitlist atomicity proof (E2/E3/E5), the migration names (class pricing + `class_registrations` + invoice type), notification recipients, CI run ID/URL, an explicit **"Class registration + waitlist behavior-green: PASS/FAIL"** line, and a DRAG READ (did reusing issue_invoice/PT-pattern/B1-roster make this clean?).

## Scope discipline & hand-back
Recurring-class registration + capacity/waitlist + the first invoice only. No weekly pass, no recurring *generation* (D3), no per-session/online-pay, no B1 attendance changes. Stop after updating `audit-cycle-update.md`; report PASS/FAIL + drag read. Next the auditor designs **B3 — family/household** (parent managing multiple children's registrations/attendance/billing/belts).

---

### Copy-paste pointer for the coder
```text
You are the coding agent for the PRO LINE Gym Platform.
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-b2-class-registration off main (git checkout main && git pull && git checkout -b prompt-b2-class-registration).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-B2-class-registration.md
  docs/audit/cycle-5/journey-class-registration.md   (authoritative design)

Build RECURRING-CLASS REGISTRATION (Proline product #3): member registers for a recurring class for a
MONTHLY fee via a request→approve→bill workflow (NOT auto), with capacity + waitlist auto-promotion.
The group-class analog of PT acquisition — REUSE D1 issue_invoice, F2 createNotification, B1's
class_enrollments roster.
Model: classes +monthly_fee_usd/lbp; NEW class_registrations (class,student,status[requested/active/
waitlisted/cancelled/rejected/expired],waitlist_position,monthly_fee,discount_pct OR discount_amount_usd,
start/end,invoice_id,approved_by/at) with RLS (member own in-gym, staff manage in-gym); invoice_type_enum
+= class_registration; class_enrollments stays the attendance roster (an ACTIVE registration projects an
is_active enrollment — do NOT change B1 attendance). Standalone (no gym membership required).
Transactions: T1 request (portal browse+request OR staff) → requested + class_requested→staff; T2 approve
(+discount %/fixed, bounded) ATOMIC capacity check → free: active + issue_invoice(class_registration,
fee−discount, monthly) + project enrollment + class_approved→member; full: waitlisted+position (NO
invoice) + class_waitlisted; reject→rejected+reason; T4 cancel (free) → cancelled + remove enrollment +
ATOMICALLY promote lowest-position waitlisted → active+invoice+enrollment+waitlist_promoted; T5 set the
monthly period + FIRST invoice only (recurring generation is D3 — don't build it); T6 portal shows
registration status. BILL ONLY ON ACTIVE transition (waitlisted not invoiced).
EDGE CASES = ACCEPTANCE: E2 capacity race row-locked (never > max_capacity); E3 cancel→promote atomic (no
double-promote, positions re-compacted); E5 bill only on active; E1 one open reg per (class,student);
E12 approve/promote one transaction (status↔enrollment↔invoice consistent). Notifications: sanctioned F2
pattern, RETURNING-free, member+guardian (login-less now persists via the FK fix), staff get
class_requested, coaches excluded. i18n ar/en/fr; no MISSING_MESSAGE.
Add e2e/class-registration.spec.ts in the ephemeral run gym with TI helpers: request→class_requested;
approve-free→active+one monthly invoice+roster+class_approved; approve-at-capacity→waitlisted(no invoice);
cancel-active→auto-promote→active+invoice+waitlist_promoted; capacity never exceeded; no MISSING_MESSAGE.
Verify in the E2E CI run, not tsc; if the sandbox can't run the browser, push so e2e.yml runs and report
the run ID; do NOT fabricate. Scope every git add (never -A); node_modules gitignored; dev on port 3000;
no Claude/Co-Authored-By trailer; don't weaken RLS.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / B2 — Recurring-Class Registration" with a
per-transaction PASS/FAIL table (file:line), the capacity/waitlist atomicity proof (E2/E3/E5), migrations,
notification recipients, CI run ID/URL, an explicit "Class registration + waitlist behavior-green:
PASS/FAIL" line, and a DRAG READ. Then STOP and tell me B2 is ready for review.
```
