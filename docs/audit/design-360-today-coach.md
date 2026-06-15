# Design: Gym 360 Pro — Today horizons (FD-2) + Coach 360 (TEAM-1)

> **Auditor design, 2026-06-15.** Operator named the platform **Gym 360 Pro** (vendor/product brand; tenant-agnostic → white-label-ready; Proline's instance still shows Proline's gym brand on member-facing surfaces). Three demo-practice findings dispositioned with locked forks. Sequenced after AX-2 (landing polish, in flight).

## Locked forks (operator, 2026-06-15)
1. **Today/Week/Month** → distinct purpose-built card SETS per horizon (operational → tactical → strategic), not a relabeled wider-window.
2. **Coach 360** → full coach hub mirroring Member-360; the Day Diary becomes the floor lens that links into it.
3. **Permissions** → owner + head_coach + **reception** all manage coach scheduling/availability/assignments; **deactivate** stays owner/head_coach only (the one guardrail).

## FD-2 — Today 360 (Today / This Week / This Month)
Current state: `today/page.tsx` already widens the date window via `horizonEnd` for expiring/money/win-back, BUT card labels are hardcoded "today" and the dominant cards (Now/Next class, PT) are today-only regardless → Week/Month look like Today. Fix = **horizon switches the card set + framing + labels**:

- **Today — "run the shift" (operational):** Now/Next class + one-tap attendance · today's PT sessions · due/overdue + cash collected today · expiring today · new leads/trials today · camp today · inbox count. (Mostly built; correct the labels.)
- **This Week — "plan & chase" (tactical):** week schedule with **fill %** per class (underfilled = promote) · **renewals due this week** (members + class regs) + projected revenue · **trials this week** (who/when/coach + follow-up owner) · **PT packages running low / expiring this week** → refill targets · **coach load this week** (sessions per coach — balance) · new leads + weekly conversion · collected-vs-projected.
- **This Month — "grow & diagnose" (strategic):** **revenue MTD by product vs last month** · **new members vs churn** + win-back recovered (net movement) · **lead→member conversion rate** · **outstanding/aging** · **active-member trend** · **renewals due rest-of-month** (forward revenue) · **avg class utilization** · **PT sold + camp signups**.

All read-time off existing data (FIN-1/ML-1/D1/GRW-1 already expose it); reuse the `ActionCard` framework; collapse-when-zero; labels reflect the period. **+ PWA footer fix** (see below) since it's a dashboard-shell issue.

## TEAM-1 — Coach 360 + Day Diary reframe
Two complementary surfaces, minimal overlap (mirror of the Member-360 win):
- **Day Diary (cross-coach floor lens):** each coach's column for the chosen day shows classes **and booked PT** (fix the missing PT — surface PT-2 `pt_sessions`; empty-state + "book" when none) + **open availability gaps** (unbooked bookable slots = PT upsell signal). Answers "who's on the floor, who's free." Links each coach → their Coach 360.
- **Coach 360 (single-coach file, from Team + diary):** profile (photo/specialties/bio/contact/active) · schedule (classes + PT, day/week) · **availability management** (staff edit `coach_availability` windows — PT-2) · roster (class members + PT clients) · load/utilization (sessions this week/month) · quick actions (assign to class, book PT for a client, edit availability, **deactivate [owner/head_coach only]**).

Overlap control: PT assignment + availability editing consolidate here (and remain reachable from Member-360 where member-centric). Permissions: view+manage for owner/head_coach/reception; deactivate gated to owner/head_coach.

## PWA footer overlap (bundle into FD-2)
`NativeTabBar` is `fixed bottom-0` (mobile) with safe-area padding, but the dashboard content area lacks matching bottom padding → last rows hide under the bar (seen on Inbox/Today). Fix: add `pb-[calc(4rem+env(safe-area-inset-bottom))]`-class bottom padding to the mobile content/scroll container in `DashboardLayoutClient` (md:hidden scope), clearing the tab bar on every dashboard page. Related: [[native-shell-rail-overlap]] (sibling: that was the md side-rail; this is the bottom bar).

## Sequencing
AX-2 (landing, in flight) → **FD-2** (Today 360 + PWA fix) → **TEAM-1** (Coach 360 + diary). Both recomposition + read-time; zero or minimal schema (TEAM-1 may need none — coach_availability exists from PT-2). Then any final demo polish → the platform is demo-complete.
