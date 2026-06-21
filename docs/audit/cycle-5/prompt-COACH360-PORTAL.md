# CODER PROMPT COACH360-PORTAL — the coach's own premium 360 hub (portal-side)

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-coach360-portal` off `main`. Build the **coach self-service portal home into a drillable, premium "Coach-360" hub** — the coach's own world at a glance, every card drilling into what's behind it. **Read-time / display only; zero schema; no write paths.** This is the first of the two Portal-360 feature builds that PORTAL-FND unblocked.

## Why (demo-2 feedback + roadmap)
Demo-2: the owner found the **coach portal "thin / unorganized / not-premium"** next to the staff-side 360. PORTAL-FND gave the portals the brand theme + a consistent shell + made the drill kit available, but **no portal page is a drillable 360 yet** (0 portal files use `ActionCard`/`DrillDetails`). Roadmap: this advances the **Portal Elevation arc** — moving the coach portal from **L1 (themed shell)** toward the **L3 "Managed" premium-360 bar the staff side already hit**. Benchmark gap: a staff-side **Coach-360** exists (TEAM-1); the coach's **OWN** 360 does not.

**Current state (audited):** [`coach/page.tsx`](../../../src/app/[locale]/coach/page.tsx) is a **TODAY-only** view (today's classes + a 4-stat bar + today's trials, via the `@/components/portal/portal-kit`). The coach's other areas (full roster, students' belts, PT, trials pipeline, landing/profile status) are scattered across tabs (`schedule/attendance/students/trials/pt/profile`) with **no unifying premium overview, and nothing drills/reconciles**.

## Build — the Coach-360 hub (the coach's own world, drillable)
Rebuild `coach/page.tsx` (+ supporting components) into a **premium, drillable 360 hub** for the logged-in coach, using the portal kit + brand theme PORTAL-FND established, mirroring the staff-side Coach-360 (TEAM-1) + the DRILL-360 "card → reconciling rows → drill" pattern, **adapted to the coach's self-view**:

1. **Today** (keep what works) — today's classes with attendance progress + one-tap "Start Attendance"; today's trials. Make each a drillable card (→ the class roster / the trial).
2. **This Week** — the coach's weekly **teaching load** (classes / hours across the week) → drills to the schedule; **roster size** across their classes.
3. **My Students** — active students across the coach's classes, **by discipline + belt**; surface **belt progress** (who's approaching / overdue for a test) → drills to the student. (From the coach's classes' enrollments + belt data.)
4. **PT** — the coach's **active PT assignments** (sessions remaining / expiring) + availability status → drills to `/coach/pt`.
5. **Trials pipeline** — upcoming assigned trials (not just today's) → drills to `/coach/trials`.
6. **My Profile / Landing** — the coach's **landing publish status** (live / pending-approval, from COACH-LP/PHOTO-GATE) → drills to `/coach/profile`. **Display only** — the publish gate stays exactly as-is.

Every card: **a number · drill rows/expand · (where relevant) a one-tap action** — premium, scannable, not crowded. **Reconcile** where there's a headline number (the rows sum/count to it). i18n ar/en/fr; full RTL; brand theme; mobile **and** desktop.

## Out of scope
Schema; **all write paths** (display only — attendance/PT/trial writes stay in their existing tabs); the **Member-360-portal** (separate slice, next); the staff dashboard; **offline/PWA** (OFF-3 owns that — do not touch the offline layer); changing the publish gate or any RLS.

## Verify (e2e, ephemeral TI gym)
1. Seed a coach with classes (today + this week), enrolled students of known disciplines/belts, a PT assignment, an upcoming (non-today) trial, and a landing profile → the hub renders **drillable cards** for Today / This Week / My Students / PT / Trials / Profile-status, with the brand theme + consistent shell, on mobile **and** desktop.
2. **Drill:** a card row navigates to its target (class roster / student / `/coach/pt` / `/coach/trials` / `/coach/profile`). **Reconciliation:** the "students by discipline/belt" rows count to the headline.
3. `/ar` clean (RTL, no MISSING_MESSAGE); **no regression** to the existing coach tabs (attendance/students/trials/pt/profile still work); full suite green.

## Acceptance
1. The coach portal home is a **premium, drillable Coach-360 hub** of the coach's own world (today + week + students/belts + PT + trials + profile-status); **every card drills**; zero new features/writes; green in E2E CI (run ID/URL).
2. Zero schema; read-time/display only; i18n ar/en/fr; RTL; brand design-system; no coach-tab regression.

## Hygiene
Branch `prompt-coach360-portal` off `main`; **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; never weaken RLS; **DO NOT merge** — report "COACH360-PORTAL ready" + CI run ID; the auditor merges.

## Update the progress file
Append to `docs/audit/audit-cycle-update.md` → `## Cycle 6 / COACH360-PORTAL — coach's own premium 360 hub`: what the hub surfaces + drills, the reconciliation proof, before/after of the coach home, CI run ID/URL, an explicit **"coach portal is a drillable premium 360 hub; every card drills; no regression: PASS/FAIL"** line, and a DRAG READ (incl. where the Member-360-portal attaches next).
