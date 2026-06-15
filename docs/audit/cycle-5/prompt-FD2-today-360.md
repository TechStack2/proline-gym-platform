# CODER PROMPT FD-2 — Today 360 (distinct Week/Month card sets) + PWA footer fix

> **For:** the MAIN coding agent (mainline) · **Issued by:** Project Auditor · **Sequence:** after AX-2 merges (branch `prompt-fd2-today-360` off `main`). Design: [`../design-360-today-coach.md`](../design-360-today-coach.md) (operator-locked). **Zero schema** — all read-time off existing FIN-1/ML-1/D1/GRW-1 data.

## Strategic context
Platform is now **Gym 360 Pro** — the Today/Week/Month switcher is the namesake feature and must deliver three genuinely different lenses, not one wider-window. Today already re-scopes the date range but labels say "today" and the dominant cards (class/PT) are today-only → Week/Month look identical. Make each horizon answer a different question: **Today = run the shift · Week = plan & chase · Month = grow & diagnose.**

## Build

### 0. PWA footer overlap (dashboard-shell fix, all pages)
`NativeTabBar` is `fixed bottom-0` (mobile) but the dashboard content area lacks matching bottom padding → last rows hide under the bar (seen on Inbox/Today). Add bottom padding to the **mobile** content/scroll container in `DashboardLayoutClient` (md:hidden scope) = tab-bar height + safe area, e.g. `pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0`. Verify the last card clears the bar on a phone viewport across pages.

### 1. Horizon-specific card sets (the 360 reframe)
Keep the `ActionCard` framework + the `horizon`/`horizonEnd` plumbing; switch the **card set + labels** by horizon. Every card stays read-time, gym-scoped, collapse-when-zero, drill-into-existing-flow.

- **Today (operational — keep, fix labels to "Today"):** Now/Next class + one-tap attendance · today's PT sessions · due/overdue + cash collected today · memberships expiring today · new leads/trials today · camp today · inbox count.
- **This Week (tactical — NEW cards):**
  - **Week schedule fill** — each class this week with enrolled/capacity %; flag underfilled (promote).
  - **Renewals due this week** (memberships + class registrations, via ML-1 end_date/period) + Σ projected revenue if collected; row → Member-360 / renew.
  - **Trials this week** (date, kid/lead, assigned coach) → drill to the trial/lead.
  - **PT running low/expiring this week** (remaining ≤ threshold OR validity within the week) → re-sell (PT-1 modal).
  - **Coach load this week** — sessions+classes per coach (spot overload/idle) → Coach 360 (TEAM-1, once it lands; until then a plain list).
  - **New leads + weekly conversion** (GRW-1).
- **This Month (strategic — NEW cards):**
  - **Revenue MTD by product** (membership/class/PT/camp) vs last month (FIN-1 owner-dashboard queries).
  - **New members vs churn this month** + win-back recovered (net movement).
  - **Lead→member conversion rate** (month-scoped).
  - **Outstanding / aging** summary.
  - **Active-member trend** (count now vs month start).
  - **Renewals due rest-of-month** (forward revenue).
  - **Class utilization** (avg fill MTD) · **PT sold + camp signups MTD**.

Reuse FIN-1's `lib/finances/owner.ts` + win-back/horizon helpers; add only read queries/aggregations (no new tables). Each card: number/amount headline + drill rows + (where apt) a one-tap action. i18n ar/en/fr with period-correct labels; RTL; design-system; tenant-clean.

## Out of scope
Schema; Coach 360 (TEAM-1 next — here, the coach-load card can be a plain list that TEAM-1 later links); new business logic (read-time aggregation only).

## Verify (e2e, ephemeral TI gym)
1. **Distinct sets:** Today shows the operational cards with "Today" labels; switching to **Week** renders week-specific cards (assert a Week-only card present, e.g. "schedule fill" or "renewals due this week", that is NOT on Today) with period labels; **Month** renders month-specific cards (assert a Month-only card, e.g. "revenue by product" / "new vs churn") absent from Today/Week.
2. **Data correctness:** seed so a renewal-due-this-week and a paid-this-month exist → the Week renewals card and the Month revenue card reflect them; counts differ across horizons (not identical).
3. **PWA footer:** on a mobile viewport, the last card on Today/Inbox is fully visible (not under the tab bar) — assert the content container has the bottom padding / the last row is in viewport.
4. `/ar` clean (no MISSING_MESSAGE); full suite green — no regression (AX-2's count + FD-2 tests).

## Acceptance
1. Three distinct horizon card sets with period-correct labels, green in E2E CI (run ID/URL); the Week/Month-only cards proven present and absent from Today.
2. PWA footer overlap fixed (mobile bottom padding); demo-visible after redeploy.
3. Zero schema/new-business-logic; read-time aggregation only; i18n complete; `tsc`+`build` clean.

## Hygiene
Branch `prompt-fd2-today-360` off `main`; **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; TI ephemeral gym; stay on your branch.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / FD-2 — Today 360 + PWA footer`: the per-horizon card sets, the read queries reused/added, the footer fix, CI run ID/URL, an explicit **"Today/Week/Month show distinct period-appropriate cards + PWA footer clear: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Next: **TEAM-1 (Coach 360 + Day Diary reframe)**.

---

### Copy-paste activation block for the MAINLINE coder (hand off ONLY after the auditor confirms AX-2 is merged)
```text
You are the MAIN coding agent for the PRO LINE Gym Platform / "Gym 360 Pro" (mainline track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-fd2-today-360 off main (git checkout main && git pull && git checkout -b prompt-fd2-today-360
— main must contain AX-2).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-FD2-today-360.md
design: docs/audit/design-360-today-coach.md (operator-locked)

ZERO schema — read-time off existing FIN-1/ML-1/D1/GRW-1 data; reuse the ActionCard framework + horizon
plumbing.
Do: (0) PWA FOOTER FIX: dashboard content hides under the fixed mobile NativeTabBar → add mobile bottom
padding to the content/scroll container in DashboardLayoutClient (md:hidden), pb-[calc(4rem+env(safe-area-
inset-bottom,0px))] md:pb-0; verify the last card clears the bar. (1) HORIZON CARD SETS (switch the card
set + labels by horizon, not a wider window): TODAY (operational, fix labels to "Today") now/next+attendance
· today PT · due/overdue+cash today · expiring today · leads/trials today · camp today · inbox; THIS WEEK
(tactical, NEW cards) week schedule fill% (flag underfilled) · renewals due this week (memberships+class
regs) + projected revenue · trials this week (date/lead/coach) · PT low/expiring this week → re-sell · coach
load this week (sessions per coach; plain list until TEAM-1) · new leads + weekly conversion; THIS MONTH
(strategic, NEW cards) revenue MTD by product vs last month · new members vs churn + win-back recovered ·
lead→member conversion rate · outstanding/aging · active-member trend · renewals due rest-of-month · class
utilization + PT sold + camp signups. Reuse lib/finances/owner.ts + horizon/win-back helpers; add only read
aggregations (NO tables). Each card = headline + drill rows + one-tap action where apt. i18n ar/en/fr with
period-correct labels; RTL; design-system; tenant-clean.
Verify in the E2E CI run, not tsc: Today shows operational cards labeled "Today"; switching to Week renders
a Week-only card (e.g. renewals-due-this-week / schedule-fill) NOT present on Today; Month renders a
Month-only card (e.g. revenue-by-product / new-vs-churn) absent from Today/Week; seed a renewal-due-this-
week + a paid-this-month → Week + Month cards reflect them and counts differ across horizons; on a mobile
viewport the last Today/Inbox card is fully visible (not under the tab bar); /ar clean; FULL suite green
(no regression). If the sandbox can't run the browser, push so e2e.yml runs and report the run ID; do NOT
fabricate. Dev port 3000; scoped git add + git show --stat; no Claude/Co-Authored-By trailer; never weaken
RLS; stay on your branch.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / FD-2 — Today 360 + PWA footer": the
per-horizon card sets, queries reused/added, the footer fix, CI run ID/URL, an explicit "Today/Week/Month
show distinct period-appropriate cards + PWA footer clear: PASS/FAIL" line, and a DRAG READ. Then STOP and
tell me FD-2 is ready for review.
```
