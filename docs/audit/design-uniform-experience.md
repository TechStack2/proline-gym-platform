# Design: Uniform experience & journey seams — operator's five points (2026-06-12)

> Disposition of the operator's five findings into the existing plan WITHOUT disturbing it: two new bounded slices (UX-2, FRX expanded) + scope notes on already-queued slices. Verdict per point first.

## [1] Staff-created users → loggable accounts (the 360 answer)
**Already designed and queued — this is ON-1**, spiked with live evidence (Option B: pre-create the auth user with the member's EXISTING `profiles.id`; F1 trigger already no-ops; clean rollback). The 360 journey: staff create members/coaches login-less (today's flow, unchanged) → **"Invite to portal/app"** on the person's file → system creates credentials (temp-pass shown once, forced change at first login, onboarding step) → G1 flips the SAME button to WhatsApp-OTP with zero staff-workflow change.
**Scope note added to ON-1:** the mechanism explicitly covers **coaches and staff too**, not just members (same adoption, plus the `user_roles` row — login-less people have none). One invite mechanism for every human in the system.

## [2] Coach trials — non-actionable islands → close the loop
Correct finding: `/coach/trials` is a prototype read-only island. The 360 trial journey it must become: lead → trial scheduled (23R) → **trial appears on the coach's day** (Today/diary, not just a tab) → **coach marks the outcome** (showed + how it went / no-show, one tap + optional note) → outcome **flows back to the pipeline** (prospect stage auto-moves to trial-done, `next_action_date` set, staff notified) → staff follow up → convert (existing RPC). Coach sees value (their trial list does something); staff stop chasing coaches on WhatsApp for "did he show?" → **UX-2 scope.**

## [3] Wizard pattern on ALL entry forms
Ratified as a platform convention: the UX-1 wizard idiom (steps · chips/pills · presets · review · no dropdowns) becomes a **shared `FormWizard` component**, and every remaining prototype-era form converts: add student, add lead/prospect, add coach (re-shell the ADM-2 form), membership-plan create/edit, belt-ladder editor, gym settings sections. Classes/camps/PT-sale already comply → **UX-2 scope** (the component + conversions).

## [4] Portal differentiation (member vs coach vs staff)
Per-shell identity: an accent token + labeled header badge per app (e.g., staff = brand red, coach = black/gold, member portal = a distinct cool accent), applied to the shell chrome (header, active-nav state, PWA theme-color per shell route) — instantly tell-apart without forking the design system. Tenant-clean: accents defined as per-ROLE platform tokens layered over the gym's brand palette → **FRX scope** (it's shell/component-level cosmetics, same layer as the i18n-bypass refactor already queued there).

## [5] Settings gaps
Two distinct defects: (a) **Settings missing from the PWA/mobile nav** — a nav-config bug, fix outright; (b) **static, non-editable settings views** — membership plans and belts are prototype leftovers (read-only). Both complete in **UX-2**: plans CRUD (also operationally needed before ML-1's plan-change/renewals are demo-able with real plans) and a **belt-ladder editor** (the durable fix for ADM-2's "empty ladders" root cause — gyms must be able to define ranks per discipline) — both as wizards per [3], both archive-pattern, both tenant-clean.

## Plan integration (queue after PT-2)
1. **ML-1** (unchanged, next after PT-2 — prompt staged, incl. demo-hygiene rider).
2. **UX-2 — Uniform entry & settings completion:** shared FormWizard + form conversions [3] · trials loop-closure [2] · settings PWA nav fix + plans CRUD + belt-ladder editor [5]. Recomposition + at most additive columns; no new domains.
3. **FRX — shell & locale fidelity:** the i18n-bypass component refactor (I18N-1's finding — French actually renders) + per-shell identity accents [4].
4. **ON-1** (scope note: members + coaches + staff invites) → **G1 → F3-lean → G2-lean → V1 readiness review → deploy** (unchanged).

Net cost: one added slice (UX-2); FRX absorbs [4] at near-zero marginal cost; [1] and half of [5] were already paid for. Every point lands as a journey loop or a platform convention — not a patch.
