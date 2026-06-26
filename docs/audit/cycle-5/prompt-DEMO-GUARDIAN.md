# CODER PROMPT DEMO-GUARDIAN — add a guardian demo login (5th account) + seed it in the live demo

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-demo-guardian` off `main`. **Login page + an additive migration + reseed update.** **Owner-reported:** the demo login page shows only 4 quick-login accounts (owner/coach/reception/student) — add a **guardian** so the kid-switcher + household billing can be demoed. The guardian feature is fully built (`guardians` + `guardian_students`, kid-switcher, household billing, `is_guardian_of`); it just has no demo login.

## Build
1. **Login page 5th account** — [`src/app/[locale]/auth/login/page.tsx`](src/app/[locale]/auth/login/page.tsx) (~:14–39): add a 5th `DEMO_ACCOUNTS` entry `guardian@prolinegym.lb`, labels EN "Guardian — Parent Portal" / AR "ولي الأمر — بوابة الوالدين" / FR, same demo password pattern (`ProlineDemo2024!`).
2. **A NEW additive migration** (do NOT edit the already-applied 000008): create the `guardian@prolinegym.lb` auth user **idempotently** (same bcrypt/identity pattern as the existing 4 demo accounts in 000008), give it `user_roles(role='parent')`, a `profiles` row, a `guardians` row, and a `guardian_students` link to the **hero student (Karim)** so logging in shows the kid-switcher + Karim's dashboard. Forward-only, `IF NOT EXISTS`/guarded.
3. **Reseed parity** — update `reseed_proline_demo()` ([`supabase/migrations/000060_coach_showcase_seed.sql`](supabase/migrations/000060_coach_showcase_seed.sql)) to **re-establish the guardian's `guardians` row + `guardian_students` link to the hero student on every reseed** (it currently deletes guardian_students and never recreates the demo guardian) — so the demo guardian survives a reseed. Resolve the guardian login by email (like the other demo logins).
4. **No RLS change** — the guardian RLS already exists (`is_guardian_of`, `students_guardian`, etc.); just seed the data.

## Out of scope
The invite/phone-username work (separate); changing guardian RLS or the portal; non-demo gyms.

## Verify
1. Login page shows **5** demo accounts incl. Guardian; clicking it signs in as `guardian@prolinegym.lb`.
2. The guardian portal renders the **kid-switcher** (Me + Karim) and Karim's kid-dashboard (registrations/attendance/belt) + household billing — the guardian sees their linked kid. `/ar`+`/en`.
3. From-zero replay clean (the new migration applies in the chain; the db-replay-check guard stays green); reseed re-links the guardian.
4. **TARGETED run** (`-f projects="<login/b3/portal>"`) proving the guardian demo login → kid-switcher.

## Acceptance
1. A guardian demo login exists + is on the login page (5 accounts); guardian portal shows the kid-switcher for the hero student; new migration is additive/idempotent + replay-clean; reseed re-links it; `/ar`+`/en`; green on a targeted run (run ID/URL).

## Hygiene
Branch `prompt-demo-guardian` off `main`; **dev port 3000**; scoped `git add`; **no Claude/Co-Authored-By trailer**; **never weaken RLS**; migration **additive + forward-only**; **DO NOT merge, and DO NOT self-apply to cloud** — report "DEMO-GUARDIAN ready" + the new migration basename + the targeted run ID; **the auditor applies the migration via Verify-Foundation (HTTP 201) + merges** (so the live demo gets the guardian login).

## Update the progress file
Append to `docs/audit/audit-cycle-update.md` → `## Cycle 6 / DEMO-GUARDIAN — guardian demo login`: the login-page entry, the additive migration (auth user + guardians + guardian_students link to Karim), the reseed parity update, the targeted run ID, an explicit **"guardian demo login → kid-switcher for the hero student; additive/replay-clean; reseed re-links; /ar+/en: PASS/FAIL"** line + a note that the auditor must VF-apply the migration to cloud, and a DRAG READ.
