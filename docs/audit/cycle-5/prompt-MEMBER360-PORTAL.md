# CODER PROMPT MEMBER360-PORTAL — the member's own premium 360 hub (portal home, drillable)

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-member360-portal` off `main` (≥ `31101c4`). Make the **member portal home a drillable, premium "Member-360" hub** — the member's own world at a glance, every card drilling into what's behind it + reconciling. **Read-time / display only; zero schema; no write paths.** Second of the two Portal-360 builds PORTAL-FND unblocked (Coach-360 was the first — mirror its shape).

## Why (demo-2 feedback + roadmap)
Demo-2: the **member portal felt "themeless / not-drillable"** next to the staff-side 360. PORTAL-FND themed it + made the drill kit available; Coach-360 proved the pattern coach-side. This closes the **Portal Elevation arc** — the member portal from L1 toward the **L3 premium-360 bar** the staff side hit. After this, the demo-2 feedback set is fully addressed.

**Current state (audited):** [`portal/page.tsx`](../../../src/app/[locale]/portal/page.tsx) is **already data-rich** — it fetches membership/plan, belt rank, attendance (count + recent), invoices (total/status), PT balance, next class/session, waivers, camps, and the **B3 guardian kid-switcher** — and already imports `ActionCard`/`DrillDetails`/`PortalCard`. But it renders mostly **flat stat tiles** (classes/membership/belt) that **don't drill or reconcile** the way the staff-360 / Coach-360 cards do. The data is there; the **drillable-360 treatment isn't applied consistently.** Tabs: `classes/schedule/progress/pt/billing/profile`.

## Build — the Member-360 hub (the member's own world, drillable; reuse the data already fetched)
Turn the member home into a **premium, drillable 360**, mirroring Coach-360 + the DRILL-360 "headline · reconciling rows · drill" pattern, using the **already-imported** `ActionCard`/`DrillDetails` + the **data the page already fetches** (don't add new heavy queries — surface what's there):
1. **Membership** — status + plan + renew/expiry → drills to `/portal/billing` (renewal). Keep the existing **lifecycle banner** (frozen/expiring/lapsed).
2. **Billing** — outstanding balance / latest invoices → drill rows reconcile to the balance → `/portal/billing`.
3. **PT** — sessions remaining / total + next session → drills to `/portal/pt`.
4. **Belt progress** — current rank + next → drills to `/portal/progress`.
5. **Classes + attendance** — enrolled classes + recent attendance (the present/absent/late counts already computed) → drills to `/portal/classes` + `/portal/schedule`; show the **next class**.
6. **Preserve** the B3 **guardian kid-switcher** (cards reflect the selected kid), **waivers** (WaiverChip/WaiverSign), and **camps** — don't regress them.

Every card: **headline · drill rows/expand · drill to the tab**; reconcile where there's a number. Premium, scannable, not crowded. i18n ar/en/fr; full RTL; brand theme; mobile **and** desktop.

## Out of scope
Schema; **all write paths** (display only — registration/PT-request/payment writes stay in their tabs); the **coach portal** (Coach-360 shipped); the staff dashboard; **offline/PWA** (don't touch the offline layer); new heavy aggregation (reuse the home's existing reads). Don't break the guardian/kid-switcher, waivers, or camps.

## Verify (e2e, ephemeral TI gym)
1. Log in `student@` → the home renders **drillable 360 cards** for Membership / Billing / PT / Belt / Classes+attendance, with the brand theme + consistent shell, mobile **and** desktop.
2. **Drill:** each card row navigates to its tab (`/portal/billing`, `/portal/pt`, `/portal/progress`, `/portal/classes`, `/portal/schedule`). **Reconciliation:** the billing drill rows sum/relate to the balance headline.
3. **Guardian (B3):** the kid-switcher still switches the 360 to the selected kid; **waivers + camps + the lifecycle banner still render.**
4. `/ar` clean (RTL, no MISSING_MESSAGE); **no regression** to the portal tabs; full suite green. **Anchor the new playwright `testMatch`** (the off3↔f3 substring lesson) and **run the new spec isolated first** (a hung wait kills the serial suite — bound every wait).

## Acceptance
1. The member portal home is a **premium, drillable Member-360 hub** (membership/billing/PT/belt/classes+attendance), every card drills + reconciles; guardian/kid-switcher + waivers + camps preserved; **zero new features/writes/schema**; green in E2E CI (run ID/URL).
2. Read-time/display only; i18n ar/en/fr; RTL; brand design-system; no portal-tab regression.

## Hygiene
Branch `prompt-member360-portal` off `main`; **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; never weaken RLS; **DO NOT merge** — report "MEMBER360-PORTAL ready" + CI run ID; the auditor merges.

## Update the progress file
Append to `docs/audit/audit-cycle-update.md` → `## Cycle 6 / MEMBER360-PORTAL — member's own premium 360 hub`: what the hub surfaces + drills, the reconciliation proof, before/after, the guardian/waivers/camps no-regression, CI run ID/URL, an explicit **"member portal is a drillable premium 360 hub; every card drills; guardian/waivers/camps intact; no regression: PASS/FAIL"** line, and a DRAG READ. **This closes the Portal Elevation arc** — note that.
