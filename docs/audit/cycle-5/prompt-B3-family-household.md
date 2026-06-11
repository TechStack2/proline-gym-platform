# CODER PROMPT B3 — Family/Household: guardian access, kid-switcher, household billing (payer-on-invoice)

> **For:** the MAIN coding agent (single track) · **Issued by:** Project Auditor · **Sequence:** V1 punch-list resumes (after IA-1/2/3 + UX-1, all green). Branch `prompt-b3-family` off current `main`. Design forks LOCKED with the operator 2026-06-11 (see §Design). This is the first slice that lands INSIDE the new IA (Member-360 + Inbox + portal).

## Strategic context
Proline's Kids (5–6pm) and Juniors (6–7pm) classes are core products — the people who *pay and decide* are parents, but the platform models only the child. Today a parent has no login, no view of their kids, no aggregate bill: that whole relationship lives on WhatsApp + paper. Benchmark gap: family/household management is table-stakes in every leading gym platform (Mindbody/Glofox/TeamUp household accounts). Roadmap: B3 → D2 (freeze/upgrade) → D3 (renewal/dunning — dunning targets the PAYER this slice introduces). **Tenant-clean rule active.**

## Design (operator-locked forks)
1. **Payer model:** invoices show BOTH parties — the student stays the service recipient; a guardian becomes the **payer** for minors. A guardian with multiple kids sees the **aggregate** household bill. Payments stay AT THE DESK (cash/OMT/Whish via staff `record_payment` — NO online payment).
2. **Guardian portal scope:** view + request + pay-view. Kid-switcher; per-kid attendance/progress/registrations/billing; can SUBMIT B2 class-registration requests for a kid; sees household invoices/payments. NO self-cancel of active registrations (staff-mediated, per B2).
3. **Discounts:** manual per-registration via existing B2 % / fixed — no sibling engine.
4. **Data model:** existing `guardians` + `guardian_students` only — a guardian with 2+ linked kids IS the household. No households table.

### Origination (channel-complete — how a guardian enters the system)
- **A. Walk-in at the desk (primary):** staff registers a kid → in the same flow, capture/link the guardian (search existing profiles/guardians by phone first — the guardian may already be a member or another kid's guardian; create only if new).
- **B. Existing member becomes a guardian:** staff link from the kid's Member-360 (guardian may also be a training member — same profile, both hats; must not break their own member view).
- **C. Lead conversion of a minor (23R):** the convert flow must allow attaching/creating the guardian at conversion.
- **D. Guardian self-service entry:** NOT in V1 (guardians are provisioned by staff with a phone; they then log in via the existing phone-OTP). Document as V2.

### Edge cases (design for, test the cheap ones)
- Two guardians per kid (divorced/dual): both linked, both see the kid, notification fan-out already handles both (`guardian_students` → F2 pattern) — payer on an invoice is ONE guardian (chosen at issuance, default the primary/first); the other still *sees* it (read via link).
- Guardian who is also a student: portal shows their own member self-view PLUS the kid-switcher.
- Kid turns 18: no automatic flip in V1 — staff unlink when appropriate (note in docs).
- Unlink with outstanding invoices: invoices KEEP their payer (historical fact); future invoices get the new payer/recipient.
- Minor with no linked guardian: allowed (don't block ops) but Member-360 shows a "no guardian linked" hint.

## Build

### 1. Migration (next number, e.g. `000036`) — the slice's ONLY schema touch
- `invoices.payer_profile_id UUID NULL REFERENCES profiles(id)` + index. Semantics: NULL ⇒ payer = the recipient student's own profile (adults; no backfill needed). Extend `issue_invoice` / `_system_issue_invoice` with an optional `p_payer_profile_id` (DEFAULT NULL → resolve: if the student has a guardian link, default to the primary guardian's `profile_id`, else NULL). Keep both functions' existing guards/grants EXACTLY (staff-gated / REVOKEd system delegate).
- **Guardian read RLS (additive policies only — weaken nothing):** guardians may SELECT their linked kids' rows on the portal-relevant tables (`students`, `class_registrations`, `class_enrollments`, `attendance_records`, `invoices` (recipient OR payer), `payments`, `belt_promotions`, plus catalog reads they already have) via `guardian_students → guardians.profile_id = auth.uid()`. Use a `SECURITY DEFINER is_guardian_of(student_id)` helper (REVOKE FROM PUBLIC, GRANT authenticated) to avoid recursive policy joins. `database-reviewer`: confirm a guardian sees ONLY linked kids and no other member's data.
- Extend `seed_e2e_gym` (same migration or companion): one guardian (with auth-capable profile + role) linked to TWO seeded kid students, so e2e is deterministic.

### 2. Staff surfaces (land INSIDE the IA)
- **Member-360 guardian panel:** linked guardians with phone (tap to call) + link/unlink action (search-by-phone first, create-if-new — origination A/B). Kid side shows guardians; a guardian's own member file shows their kids.
- **Lead conversion (23R):** optional "guardian" step for minors (search/create + link) — origination C.
- **Invoice surfaces (Money + Member-360 billing):** show payer when ≠ recipient ("Recipient: Karim · Payer: Rana"); a guardian's Member-360 billing panel aggregates invoices they're payer on (their household).

### 3. Guardian portal (the parent experience)
- Guardian logs in (existing phone OTP — no auth changes). Portal detects guardian links → **kid-switcher** (chips/avatars at top; if also a student, "Me" is the first chip).
- Per kid: registrations (+ NEW request via the existing B2 portal flow, acting for that kid), attendance recent + streak, belt progress, schedule of their registered classes.
- **Household billing view:** all invoices where guardian = payer (or kid = recipient), grouped per kid + an aggregate outstanding total (USD/LBP per D1 display conventions). Payment instructions stay "pay at the desk" — render method info, NOT a pay button.
- Notifications: already fan out to guardians (F2/FK) — the bell (IA-1) now gives them visibility; no producer changes.

### 4. i18n
ar/en/fr for everything; Arabic-RTL; no `MISSING_MESSAGE`; tenant-clean.

## Out of scope (V2/V1.1 — do not build)
Households table; sibling auto-discounts; guardian self-signup; online payment; PT booking for kids by guardians (PT future-date booking is its own queued slice); kid-turns-18 automation.

## Verify (e2e, ephemeral TI gym)
1. **Guardian login + switcher:** seeded guardian logs in → sees both kids in the switcher; kid A's attendance and kid B's state render; cannot see any non-linked student (assert a negative).
2. **Request-for-kid loop:** guardian submits a B2 registration request for kid A → staff Inbox shows it → approve (+discount) → invoice issued with `payer = guardian` → guardian's household billing shows it under kid A with the aggregate outstanding; staff records a cash payment (D1) → guardian's view shows paid; kid A's Member-360 shows the registration + the guardian panel.
3. **Payer display:** the invoice row/receipt shows Recipient kid · Payer guardian (staff side).
4. **RLS negative:** guardian session queries another student's invoice/attendance → denied/empty.
5. Full suite green — no regression (38+ tests).

## Acceptance
1. Guardian round-trip (login → switcher → request → approve → payer invoice → aggregate view → desk payment reflected) green in E2E CI (run ID/URL).
2. `database-reviewer` confirmation: additive policies only; guardian sees only linked kids; no existing policy weakened; both invoice functions keep their guards.
3. Origination A/B/C wired (desk link/create, Member-360 link, convert step).
4. Zero UI dropdowns regressions (wizard conventions), i18n complete, `tsc`+`build` clean.

## Riders (tiny, while you're in there)
- Mount the app-wide `<Toaster>` (your UX-1 finding — toasts currently render nothing).
- Facility map: keep the keyless embed; refine the query to `Sky Business Center, St 4, Baabda, Lebanon` only if the current pin is off (operator will confirm from manual testing).

## Hygiene
Branch `prompt-b3-family` off `main`; **dev port 3000** (kill/restart the running dev server as needed — the operator was testing on it); scope every `git add` + `git show --stat` before push; **no Claude/Co-Authored-By trailer**; TI ephemeral gym; never weaken RLS; stay on your branch.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / B3 — Family/Household`: the migration (payer + guardian RLS + seed), origination points wired, the guardian round-trip CI run ID/URL, an explicit **"Guardian sees only linked kids + payer invoice + aggregate billing: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Next: **D2 freeze/upgrade** (lands on the Member-360 membership card).

---

### Copy-paste activation block for the coder
```text
You are the MAIN coding agent for the PRO LINE Gym Platform (single track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-b3-family off main (git checkout main && git pull && git checkout -b prompt-b3-family).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-B3-family-household.md
(design forks are LOCKED in §Design — do not re-decide them)

Scope: guardians/guardian_students ONLY (no households table); payer-on-invoice; guardian portal
view+request+pay-view; manual discounts (existing B2); payments stay AT THE DESK.
Do: (1) MIGRATION ~000036 (the only schema touch): invoices.payer_profile_id UUID NULL REFERENCES
profiles(id) + index (NULL ⇒ payer=recipient); extend issue_invoice/_system_issue_invoice with optional
p_payer_profile_id (DEFAULT NULL → auto-resolve primary guardian for linked minors) keeping ALL existing
guards/grants; ADDITIVE guardian-read RLS via SECURITY DEFINER is_guardian_of(student_id) (REVOKE PUBLIC,
GRANT authenticated) on students/class_registrations/class_enrollments/attendance_records/invoices
(recipient OR payer)/payments/belt_promotions — database-reviewer must confirm guardians see ONLY linked
kids and nothing else is weakened; extend seed_e2e_gym with 1 guardian (login-capable) linked to 2 kid
students. (2) Staff: Member-360 guardian panel (linked guardians, link/unlink with SEARCH-BY-PHONE-first
create-if-new); lead-conversion optional guardian step for minors; invoice surfaces show Recipient ·
Payer when they differ; a guardian's own file aggregates household invoices. (3) Guardian portal: phone-
OTP login (no auth changes) → kid-switcher chips ("Me" first if also a member) → per-kid registrations
(+ NEW B2 request acting for that kid), attendance + streak, belt progress, class schedule → household
billing view grouped per kid + aggregate outstanding (USD/LBP per D1 conventions; "pay at the desk" info,
NO pay button). Notifications already fan out to guardians — no producer changes. (4) i18n ar/en/fr,
RTL, tenant-clean. RIDERS: mount the app-wide <Toaster> (your UX-1 finding); refine the keyless map query
only if the operator reports the pin is off.
Out of scope: households table, sibling auto-discounts, guardian self-signup, online payment, PT booking
for kids, age-18 automation.
Verify in the E2E CI run, not tsc: guardian logs in → switcher shows both seeded kids → submits a B2
request for kid A → staff Inbox → approve → invoice payer=guardian → household billing shows aggregate →
staff records cash payment → guardian view shows paid; RLS negative: guardian cannot read a non-linked
student's rows; payer renders on staff invoice surfaces; FULL suite green (38+, no regression). Apply the
migration via the Verify-Foundation workflow before the e2e run. If the sandbox can't run the browser,
push so e2e.yml runs and report the run ID; do NOT fabricate. Dev port 3000; scope every git add + check
git show --stat; no Claude/Co-Authored-By trailer; never weaken RLS; stay on your branch.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / B3 — Family/Household": migration +
RLS + seed, origination points, CI run ID/URL, an explicit "Guardian sees only linked kids + payer
invoice + aggregate billing: PASS/FAIL" line, and a DRAG READ. Then STOP and tell me B3 is ready for
review.
```
