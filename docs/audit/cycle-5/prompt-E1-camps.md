# CODER PROMPT E1 — Summer camps: create → publish → register → pay → run

> **For:** the MAIN coding agent (mainline) · **Issued by:** Project Auditor · **Sequence:** after PT-1 (`milestone/PT1-green`). Branch `prompt-e1-camps` off current `main`. Design (operator-confirmed: Proline IS selling summer camps NOW — this is the seasonal slice): [`../journey-camps.md`](../journey-camps.md).

## Strategic context
Camps are a date-bounded product sold mostly to GUARDIANS (B3 payer), with deposits (D1 partial payments — nothing new needed), capacity caps, and per-day attendance. The tables (`camps`, `camp_registrations`, `camp_attendance`) exist since 000003 but the surfaces were never built/validated. **The phantom-schema bug-class has now bitten four times — your FIRST task is reading the real columns of all three tables and building only against them.** Reuse rate is ~90% house patterns (UX-1 wizard, ADM-1 publish switch, PT-1 sale RPC shape, B2 request→approve, FD-1 docking). **Tenant-clean active.**

## Build

### 1. Migration (next free number)
- Verify the three camp tables' REAL columns; add ONLY what the design needs and is missing — expected: `camps.show_on_landing BOOLEAN NOT NULL DEFAULT false`, a **price snapshot** on `camp_registrations` (price_usd/lbp at registration time — the PT-1 snapshot rule) if absent, status/audit columns if absent. Name every addition in the report.
- **Anon landing read** (the 000035/36/41 pattern): active + published camps of active gyms — catalog fields only.
- **`register_camp` RPC** (house idiom: SECURITY DEFINER, REVOKE FROM PUBLIC, guards inside, one transaction): active camp of caller's gym → **capacity check under `FOR UPDATE`** (count confirmed registrations vs capacity — race-safe; the N+1th gets a clear "camp full") → not already registered → snapshot price → registration row (confirmed) → `issue_invoice` (payer auto-resolves per B3) → best-effort notifications. Age range is a CLIENT-SIDE warning (staff can override at the desk — never block in the RPC). Support the PT-1 `p_request_id` shape so a portal/guardian REQUEST (pending row, no invoice) gets approved through the same writer.
- Extend `seed_e2e_gym`: one camp spanning today (capacity 3, published) for deterministic e2e.

### 2. Staff surfaces
- **Camp wizard** (UX-1 conventions — steps/chips/pills, no dropdowns): basics (names ar/en/fr, start/end dates, age range) → capacity + price USD/LBP → review; `show_on_landing` toggle; edit + archive (never delete) with confirmed-registrations warning.
- **Camp list + detail/roster:** registrations with **payment-state badges** (pending/partial/paid from the linked invoice — the deposit story), kid + guardian (tap-to-call), per-day **attendance tab** for the camp's date range (reuse the marking pattern against `camp_attendance` — verify ITS real columns too).
- **Member-360:** "Register to camp" contextual modal (FD-1 rule — member-prefilled, active published+unpublished camps for staff, capacity shown) → `register_camp`.
- **Today docking card** (FD-1 contract): during any active camp's date range — "Camp today: N expected · M unpaid balances" → drill to roster.
- **Inbox:** pending camp requests section (approve → RPC / decline) — the B2/PT-1 pattern.

### 3. Portal / guardian
Published camps as cards (dates, age range, price, **spots left**, "Full" badge when at capacity) on the portal; guardian can REQUEST for a kid (the B3 "Acting for" pattern) → staff Inbox → approve → invoice to guardian; the household billing view picks the invoice up automatically (B3 — verify, don't rebuild). NO self-cancel (staff-mediated).

### 4. Landing
Camps section: published camp cards + CTA → trial/contact (23R entry). Anon-proof. **Collision fence: the parallel LPX-1 slice owns `(marketing)/layout.tsx`, SEO files, and non-PT section components — you may touch `(marketing)/page.tsx` (adding your section) and your NEW camps section component only.** Expect an additive i18n merge.

### 5. Scope guards
NO waitlist (operator-flagged scope call; capacity full = closed). NO refunds machinery (cancel = archive + note; money stays human). NO camp-vs-class conflict guard. i18n ar/en/fr, RTL, no `MISSING_MESSAGE`.

## Verify (e2e, ephemeral TI gym)
1. **Publish gate:** wizard-create a camp (staged) → absent from anon landing → toggle → present with price/dates/spots.
2. **Desk registration:** register the seeded KID from Member-360 → invoice payer = guardian (B3 asserted), price snapshotted; record a PARTIAL payment → roster badge "partial"; guardian portal household view shows the camp invoice.
3. **Capacity race-safety:** fill the seeded camp (capacity 3) → the 4th registration fails with the clear message; landing/portal show "Full".
4. **Run the camp:** mark day-attendance for today on the seeded camp → persists; Today card shows "Camp today" with expected count + unpaid balances and drills to the roster.
5. **Request loop:** guardian requests for kid → Inbox row → approve → confirmed + invoice (same RPC).
6. Full suite green — no regression (52+ tests).

## Acceptance
1. The five proofs green in E2E CI (run ID/URL) + the real-columns audit of all three camp tables reported (what existed, what 0000XX added).
2. `database-reviewer`: anon policy catalog-only; RPC guards/REVOKE; capacity lock correct; B3 payer + D1 partials reused not rebuilt.
3. LPX-1 collision fence respected (no layout/SEO/non-PT-section diffs).
4. i18n complete; `tsc`+`build` clean.

## Hygiene
Branch `prompt-e1-camps` off `main`; **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; TI ephemeral gym; migrations via Verify-Foundation (with `-f apply=true -f migrations=…` — your own FD-1 lesson) before e2e; stay on your branch.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / E1 — Summer camps`: the real-columns audit, migration additions, RPC design, CI run ID/URL, an explicit **"Create→publish→register(guardian payer)→deposit→run + capacity race-safe: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Next: **PT-2 (signature availability booking)** — prompt will be pre-staged.

---

### Copy-paste activation block for the MAINLINE coder
```text
You are the MAIN coding agent for the PRO LINE Gym Platform (mainline track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-e1-camps off main (git checkout main && git pull && git checkout -b prompt-e1-camps —
main must contain PT-1; verify sell_pt_package exists before starting).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-E1-camps.md
design: docs/audit/journey-camps.md (operator-confirmed seasonal slice — camps are selling NOW)

FIRST TASK: read the REAL columns of camps / camp_registrations / camp_attendance (000003) — the
phantom-schema bug-class has bitten four times; build only against what exists and report the audit.
COLLISION FENCE: the parallel LPX-1 slice owns (marketing)/layout.tsx + SEO files + non-PT section
components — you may touch (marketing)/page.tsx (add your camps section) and your NEW section component
only.
Do: (1) MIGRATION (next free number): only the missing pieces (expected: camps.show_on_landing default
false; price snapshot on camp_registrations; name every addition); anon landing read for active+
published camps of active gyms (catalog only — the 000035/41 pattern); register_camp atomic SECURITY
DEFINER RPC (REVOKE FROM PUBLIC): active camp of caller's gym → capacity under FOR UPDATE (race-safe
"camp full" for the N+1th) → no duplicate → snapshot price → confirmed registration → issue_invoice
(payer auto = guardian per B3) → best-effort notifications; age range = CLIENT-SIDE warning only (desk
can override); support p_request_id (PT-1 shape) so portal/guardian REQUESTS (pending, no invoice) are
approved through the same writer; seed_e2e_gym gets one published camp spanning today, capacity 3.
(2) STAFF: camp wizard (UX-1 steps/chips, no dropdowns: names/dates/age → capacity+price USD/LBP →
review; publish toggle; edit/archive with confirmed-registrations warning); camp list + detail/roster
(payment badges pending/partial/paid from the invoice, kid+guardian tap-to-call, per-day attendance tab
on camp_attendance — verify ITS columns); Member-360 "Register to camp" contextual modal (FD-1 rule);
Today docking card during camp dates ("Camp today: N expected · M unpaid" → roster); Inbox pending camp
requests (approve/decline — B2/PT-1 pattern). (3) PORTAL/GUARDIAN: published camp cards (dates, ages,
price, spots left, Full badge); guardian requests for a kid ("Acting for"); household billing picks the
invoice up via B3 (verify, don't rebuild); no self-cancel. (4) LANDING camps section (published cards +
CTA). (5) NO waitlist, NO refund machinery, NO conflict guard; i18n ar/en/fr, RTL, tenant-clean.
Verify in the E2E CI run, not tsc: staged camp absent from anon landing → publish → present; desk-
register the seeded kid → guardian-payer invoice + snapshotted price → PARTIAL payment → roster badge
"partial" → guardian household view shows it; fill capacity 3 → 4th blocked with clear message + "Full"
badges; mark camp-day attendance today → persists; Today card shows the camp with counts and drills to
roster; guardian request → Inbox → approve → confirmed+invoice; FULL suite green (52+, no regression).
Apply migrations via Verify-Foundation with -f apply=true -f migrations=… BEFORE e2e. If the sandbox
can't run the browser, push so e2e.yml runs and report the run ID; do NOT fabricate. Dev port 3000;
scoped git add + git show --stat; no Claude/Co-Authored-By trailer; never weaken RLS; stay on your
branch (auditor docs may land on main — don't rebase mid-run; report divergence).
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / E1 — Summer camps": the real-columns
audit, migration additions, RPC design, CI run ID/URL, an explicit "Create→publish→register(guardian
payer)→deposit→run + capacity race-safe: PASS/FAIL" line, and a DRAG READ. Then STOP and tell me E1 is
ready for review.
```
