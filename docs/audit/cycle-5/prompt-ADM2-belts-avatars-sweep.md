# CODER PROMPT ADM-2 — Belt-promotion repair + archived/unscoped picker sweep + profile avatars

> **For:** the MAIN coding agent (single track) · **Issued by:** Project Auditor · **Sequence:** demo-critical repair (operator manual-test findings 2026-06-12), runs before PT-1. Branch `prompt-adm2-belts-avatars` off current `main` (has B3).

## Strategic context
Belt progression is a core retention feature of a martial-arts gym and **promotion doesn't save** — plus archived disciplines resurface in its picker, the exact unscoped/stale-catalog bug-class ADM-1 flagged for a systematic sweep (do that sweep NOW, it keeps biting). Coaches have no photos — profiles are bland for a business that sells *people* (the coach IS the product in PT; PT-1/PT-2 will surface coach cards everywhere, so avatars land first). **Tenant-clean rule active.**

## Operator-reported defects
1. Belt promotion: archived/deleted disciplines appear in the promotion picker; **promotion does not save**.
2. Coaches: no way to add a photo; profile page is bland.

## Build

### 1. Belt promotion — repair the full flow
- Diagnose the save failure first and NAME the root cause in your report (suspects, in order: the UI not calling the 24R `promote_student` RPC / phantom columns in a direct insert / enum or arg mismatch — the established bug-class).
- The flow must end on the verified writer: **`promote_student` RPC** (24R) — guards intact.
- Pickers (discipline, belt rank, student) filter **`is_active` AND gym-scoped** everywhere.
- Improve the process (operator ask): promotion initiated from **Member-360 belt panel** (primary) and the belts surface — student pre-selected, discipline chips (active only), target rank from the discipline's `belt_hierarchies` in order (show current → next as the default selection), optional note/date. On success: toast + the belt panel, portal progress, and any belt lists update.
- Member notification on promotion (sanctioned F2 pattern) if not already wired by 24R — verify, don't duplicate.

### 2. Systematic archived/unscoped picker sweep (the ADM-1 flagged debt)
Enumerate EVERY picker/chips/filter/embed that reads catalog or people tables (disciplines, belt_hierarchies, classes, coaches, membership_plans, students in selectors) across dashboard/portal/coach surfaces. Each must filter `is_active` (and `deleted_at IS NULL` where applicable) AND scope to the user's gym. Fix what fails; **produce the sweep table in the audit log** (surface → table → was it leaking archived/cross-gym? → fixed/already-clean). This is the report's centerpiece — name them all.

### 3. Profile avatars (first Storage infrastructure — scope it tightly)
- **Supabase Storage bucket `avatars`** (public **read**; write via Storage RLS only): path `<gym_id>/<profile_id>.<ext>`. Policies: INSERT/UPDATE/DELETE allowed to the profile owner (`auth.uid() = profile_id`) OR staff of that gym (reuse `is_staff()`/`get_user_gym_id()` semantics in the storage policy); public SELECT. Migration for the bucket + policies (next free number). Nothing else in Storage.
- **Upload UI:** image picker (accept image/*, client-side downscale to ≤512px, ~200KB cap after resize, JPEG/PNG/WebP) on: coach add/edit form, Member-360 header (staff sets member photo), own profile page (self). Sets `profiles.avatar_url` to the public URL (+ cache-busting query). Replace = overwrite same path.
- **Render everywhere a person appears:** coach chips (class wizard), diary column headers, coach detail/profile, Member-360 header, kid-switcher chips (B3), portal header. Graceful initials fallback when no avatar (likely already exists — verify).

## Out of scope
PT surfaces (PT-1 next); image cropping UI; gallery/other buckets; any RLS weakening; hard deletes.

## Verify (e2e, ephemeral TI gym)
1. **Belt:** promote the seeded student from Member-360 (discipline chips show ONLY active; archive a discipline first and assert it's absent) → promotion persists (reload) → renders in Member-360 belt panel + portal progress; the explicit save that previously failed now round-trips.
2. **Sweep spot-checks:** archived discipline absent from class-wizard chips + coach specialty + belt picker; second-gym leakage asserted absent where ADM-1 fixed it (regression guard).
3. **Avatar:** upload a fixture image for a coach (Playwright `setInputFiles`) → renders on coach detail + wizard chip + diary header (img loads, no 404); member avatar set from Member-360 renders on the kid-switcher/portal.
4. Full suite green — no regression (43+ tests).

## Acceptance
1. Belt promotion saves via `promote_student`, active-only pickers, persists across reload — green in E2E CI (run ID/URL) + root cause named.
2. Sweep table delivered (every picker enumerated, leaks fixed and named).
3. Avatars: bucket + storage policies reviewed by `database-reviewer` (owner-or-staff write, public read, path-scoped); upload works; renders at all listed surfaces with fallback.
4. Zero weakened policies; i18n ar/en/fr; `tsc`+`build` clean.

## Hygiene
Branch `prompt-adm2-belts-avatars` off `main`; **dev port 3000** (restart for the operator when done); scope every `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; TI ephemeral gym; apply migrations via Verify-Foundation before e2e; stay on your branch.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / ADM-2 — Belts + avatars + sweep`: belt root cause, the FULL sweep table, the storage policy design, CI run ID/URL, an explicit **"Belt promotion saves + archived items absent from all pickers + avatar renders: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Next: **PT-1** (package catalog + desk sale + package-centric presentation + refill/expiry — prompt to be issued from `docs/audit/journey-pt-360.md`).

---

### Copy-paste activation block for the coder
```text
You are the MAIN coding agent for the PRO LINE Gym Platform (single track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-adm2-belts-avatars off main (git checkout main && git pull && git checkout -b prompt-adm2-belts-avatars).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-ADM2-belts-avatars-sweep.md

Demo-critical repair before PT-1. Operator found: belt promotion shows ARCHIVED disciplines and DOESN'T
SAVE; coaches have no photos.
Do: (1) BELT: diagnose + NAME the save-failure root cause (suspects: UI not calling the 24R
promote_student RPC / phantom columns / enum-arg mismatch); flow must end on promote_student (guards
intact); all pickers filter is_active + gym-scoped; promotion initiated from the Member-360 belt panel
(student pre-selected, ACTIVE discipline chips, next-rank default from belt_hierarchies order, optional
note/date); persists + renders in Member-360, portal progress; verify the 24R notification fires (don't
duplicate). (2) SWEEP (the ADM-1 flagged debt): enumerate EVERY picker/chips/filter/embed reading
catalog/people tables across all three shells; each must filter is_active (+deleted_at) AND gym scope;
fix leaks; deliver the full sweep TABLE (surface → table → leak? → fix) in the audit log. (3) AVATARS
(first Storage infra, tightly scoped): migration for bucket `avatars` — public READ, write restricted by
Storage RLS to profile owner OR staff of that gym, path <gym_id>/<profile_id>.<ext>; upload UI (client-
side downscale ≤512px/~200KB) on coach form, Member-360 header, own profile; sets profiles.avatar_url;
render on coach chips, diary headers, coach detail, Member-360 header, kid-switcher, portal header, with
initials fallback. database-reviewer reviews the storage policies. i18n ar/en/fr; tenant-clean.
Out of scope: PT surfaces, cropping UI, other buckets, weakening anything.
Verify in the E2E CI run, not tsc: archive a discipline → absent from belt picker + class-wizard chips +
coach specialty; promote seeded student from Member-360 → persists across reload → shows in portal
progress; avatar fixture upload (setInputFiles) renders on coach detail + wizard chip + diary (no 404);
FULL suite green (43+, no regression). Apply migrations via Verify-Foundation first. If the sandbox
can't run the browser, push so e2e.yml runs and report the run ID; do NOT fabricate. Dev port 3000;
scope every git add + git show --stat; no Claude/Co-Authored-By trailer; stay on your branch.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / ADM-2 — Belts + avatars + sweep": belt
root cause, the FULL sweep table, storage policy design, CI run ID/URL, an explicit "Belt promotion
saves + archived items absent from all pickers + avatar renders: PASS/FAIL" line, and a DRAG READ. Then
STOP and tell me ADM-2 is ready for review.
```
