# CODER PROMPT PT-1 — PT catalog, desk sale, package-first presentation, refill & expiry

> **For:** the MAIN coding agent (mainline) · **Issued by:** Project Auditor · **Sequence:** after FD-1 merges (the refill card docks into FD-1's ActionCard framework — branch `prompt-pt1-catalog` off the post-FD-1 `main`). Design (operator-approved, incl. the package-centric amendment): [`../journey-pt-360.md`](../journey-pt-360.md) §2–§3.1, §5–§6. PT-2 (availability booking) is the NEXT slice — do not build availability here.

## Strategic context
PT is the gym's revenue core and the operator's flagged weak spot: today the portal shows a flat wall of loose "single PT sessions" with no package/coach/discipline/billing context. PT-1 closes the **sale → use → refill → expiry** loop on a catalog SSOT: packages become the unit of everything (display, sale, refill), tied to billing. **Tenant-clean rule active** — the catalog is per-gym data.

## Build

### 1. Migration(s), next free numbers
- **`pt_package_types`** (gym-scoped catalog): name_ar/en/fr, `sessions_count`, `price_usd`, `price_lbp`, `validity_days`, optional `discipline_id`, `is_active`, `show_on_landing` (default false), timestamps. RLS: staff write (own gym), authenticated read (own gym), **anon SELECT for active + show_on_landing of active gyms** (the 000035/000036 landing pattern — public catalog only).
- **`sell_pt_package` RPC** (SECURITY DEFINER, staff-gated, atomic — the house idiom): guards (active type of caller's gym, active student, coach active + of gym) → **snapshot** type fields onto a `pt_packages` row (sessions, validity window from sale date) + assignment to the chosen coach → invoice via `issue_invoice` (optional % / fixed discount; payer auto-resolves per B3) → best-effort notification. `REVOKE FROM PUBLIC`, grant authenticated (guards inside).
- **Refill thresholds** as gym policy columns (C1 pattern): `pt_refill_sessions_threshold` (default 2), `pt_refill_days_threshold` (default 7).
- **`extend_pt_package` RPC** (staff-gated): extends validity (days param), writes audit log, un-freezes if expired.
- **Expiry semantics:** a package past validity is **frozen** — scheduling AND completion guards reject it (add the validity guard inside the existing C1 RPCs — they remain the single writers); represent state as a computed/explicit status (verify the existing `pt_packages` status enum and use the idiomatic option).

### 2. Settings — catalog CRUD
"PT Packages" in Settings Configuration (the disciplines pattern): add/edit/archive/restore package types; chips/pills UI; `show_on_landing` toggle per type.

### 3. Sale surfaces
- **Desk sale (primary):** Member-360 PT panel → "Sell package" modal: type chips (active, price + sessions + validity shown) → coach chips (active; filtered by specialty when the type has a discipline) → optional discount (% / fixed) → `sell_pt_package`. Result lands on the file immediately.
- **Portal request (22R upgraded):** member's request flow picks from the catalog (type cards); staff approval routes through the same RPC.

### 4. Package-first presentation (the operator's amendment — §3.1)
EVERY PT surface restructures around the **package card**: type name · coach (avatar) · discipline · **X of Y remaining** · validity countdown · status · **its invoice + payment state (deep-link)**. Sessions render NESTED under their package card (date, outcome, upcoming) — no flat session lists anywhere (portal My PT, Member-360 PT panel, coach roster view). Truly package-less legacy rows: surface once in an admin "unlinked sessions" notice for staff to resolve; archive the loose "Single PT Session" residue in the DEMO gym via a one-off Verify-Foundation `run_sql` (NOT a migration).

### 5. Refill loop (locked forks)
- **Computed at read time** (no cron): a package is "renewal due" when remaining ≤ sessions-threshold OR validity ends within days-threshold.
- **Inbox section** "PT renewals due" (member, type, remaining/expiry) with one-tap **re-sell same type** (opens the §3 modal pre-filled).
- **Today card** docked into FD-1's ActionCard framework (the documented slot): count + rows + re-sell action.
- **Member notification** when `complete_pt_session` crosses the sessions threshold (best-effort, inside/after the existing RPC — single-writer rule intact).

### 6. Landing PT section
Markets active + `show_on_landing` package types (name, sessions, validity, price) + "Private sessions available" CTA → trial/contact (23R entry). Anon-proof per §1 policy.

## Out of scope
Coach availability / slot booking / instant-book (PT-2); weekly passes; online payment; cron infrastructure.

## Verify (e2e, ephemeral TI gym)
1. **Catalog:** Settings-create a "10-pack" type ($300, 10 sessions, 60d) → appears in desk-sale chips; flip `show_on_landing` → renders on the anon landing PT section (and absent before the flip).
2. **Desk sale:** sell to the seeded student (coach + 10% discount) → package card on Member-360 shows 10/10 + validity + its invoice (discounted, payer rules respected); portal My PT shows the same card; **no flat session list anywhere** (assert nesting).
3. **Use → refill:** schedule + complete sessions down to the threshold (existing C1 flow) → card shows 2/10; **Inbox "renewals due" row appears + Today refill card shows the member + member notification fired**; one-tap re-sell → second package + invoice.
4. **Expiry:** a package with past validity (seed or direct set via run_sql in the run gym) blocks scheduling/completion with a clear message; staff **Extend** (+30d) un-freezes; audit row exists.
5. Full suite green — no regression (47+ tests).

## Acceptance
1. Sale→use→refill→expiry loop green in E2E CI (run ID/URL); package-first presentation everywhere (flat lists gone — name the surfaces you restructured).
2. `database-reviewer`: catalog RLS (incl. anon) exposes public catalog only; RPC guards + REVOKEs verified; C1 single-writer rule intact (validity guards added inside the existing writers, no new credit writers).
3. Refill card uses the FD-1 docking contract (~20 lines — state the actual line count).
4. i18n ar/en/fr; RTL; zero `MISSING_MESSAGE`; `tsc`+`build` clean.

## Hygiene
Branch `prompt-pt1-catalog` off post-FD-1 `main`; **dev port 3000**; scope every `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; TI ephemeral gym; apply migrations via Verify-Foundation before e2e; stay on your branch. **A parallel agent works in `../proline-rep1` on attendance/reports/coach-attendance surfaces — do NOT touch those three surfaces in this slice** (collision avoidance; everything else is yours).

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / PT-1 — Catalog, sale, refill, expiry`: migrations + RPC guards, restructured surfaces (named), the refill read-time design, demo-residue cleanup result, CI run ID/URL, an explicit **"Sale→use→refill→expiry loop + package-first presentation: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Next: **PT-2 (signature availability booking)** — prompt will be pre-staged.

---

### Copy-paste activation block for the MAINLINE coder (hand off ONLY after the auditor confirms FD-1 is merged)
```text
You are the MAIN coding agent for the PRO LINE Gym Platform (mainline track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-pt1-catalog off main (git checkout main && git pull && git checkout -b prompt-pt1-catalog
— main must already contain FD-1; verify the ActionCard framework exists before starting).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-PT1-catalog-sale-refill.md
design context: docs/audit/journey-pt-360.md (§2–§3.1, §5–§6 — operator-approved)

PT-2 (availability/booking) is NOT this slice. A PARALLEL agent owns attendance/history, reports, and
coach/attendance right now — do not touch those three surfaces.
Do: (1) MIGRATIONS (next free numbers): pt_package_types gym-scoped catalog (names, sessions_count,
price_usd/lbp, validity_days, optional discipline_id, is_active, show_on_landing) with staff-write/
authenticated-read/anon-read-published RLS (the 000035/36 landing pattern); sell_pt_package atomic
SECURITY DEFINER RPC (guards → SNAPSHOT type onto pt_packages + coach assignment → issue_invoice with
optional %/fixed discount, payer per B3 → best-effort notification; REVOKE FROM PUBLIC); gym policy cols
pt_refill_sessions_threshold (2) + pt_refill_days_threshold (7); extend_pt_package staff RPC (audited,
un-freezes); expiry = frozen past validity — add validity guards INSIDE the existing C1 schedule/complete
RPCs (they stay the only credit writers). (2) Settings "PT Packages" CRUD (disciplines pattern, chips, no
dropdowns). (3) SALE: Member-360 PT panel "Sell package" modal (type chips → coach chips filtered by
specialty → optional discount → RPC); portal 22R request upgraded to catalog cards, approval routes
through the same RPC. (4) PACKAGE-FIRST PRESENTATION everywhere (operator amendment): package card =
type · coach avatar · discipline · X/Y remaining · validity countdown · status · invoice+payment state
deep-link; sessions NEST under their card; kill every flat session list (portal My PT, Member-360 PT
panel, coach roster) and NAME them; demo-gym loose "Single PT Session" residue archived via a one-off
Verify-Foundation run_sql (NOT a migration); package-less rows → one-time admin "unlinked" notice.
(5) REFILL (read-time, no cron): renewal-due = remaining ≤ threshold OR expiry within days-threshold →
Inbox "PT renewals due" section with one-tap re-sell + Today card via FD-1's ActionCard docking contract
(state the line count) + member notification when complete_pt_session crosses the threshold.
(6) LANDING PT section: active+show_on_landing types + "Private sessions available" CTA (anon-proof).
i18n ar/en/fr, RTL, tenant-clean.
Verify in the E2E CI run, not tsc: Settings-create 10-pack → desk-sale chips; show_on_landing flip →
anon landing shows it (absent before); desk sale w/ 10% discount → Member-360 + portal package cards
(10/10, validity, discounted invoice state, payer rules) + NO flat lists; complete sessions to 2/10 →
Inbox renewal-due + Today refill card + member notified → one-tap re-sell issues second package+invoice;
expired package blocks schedule/complete with clear message → staff Extend +30d un-freezes (audit row);
FULL suite green (47+, no regression). Apply migrations via Verify-Foundation first. If the sandbox
can't run the browser, push so e2e.yml runs and report the run ID; do NOT fabricate. Dev port 3000;
scope every git add + git show --stat; no Claude/Co-Authored-By trailer; never weaken RLS; stay on your
branch (auditor docs may land on main — don't rebase mid-run; report divergence).
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / PT-1 — Catalog, sale, refill, expiry":
migrations + guards, restructured surfaces (named), refill design, residue cleanup, CI run ID/URL, an
explicit "Sale→use→refill→expiry loop + package-first presentation: PASS/FAIL" line, and a DRAG READ.
Then STOP and tell me PT-1 is ready for review.
```
