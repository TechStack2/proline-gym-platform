# CODER PROMPT F1 — Foundation & Identity Integrity (Phase 0) 🚨 BLOCKING ALL

> **For:** Coding agent · **Issued by:** Project Auditor · **Sequence:** Phase 0 — runs BEFORE re-validating Prompt 22. Nothing else works until this passes.
> Hand verbatim. Self-contained.

---

## Role, Skill, Lens
- **Act as `architect`** (`/Arsenal/ecc/agents/architect.md`) for the identity model, with **`database-reviewer`** (`/Arsenal/ecc/agents/database-reviewer.md`) for the migration/RLS, and **`build-error-resolver`** mindset for the data-flow bugs.
- **Apply superpower `systematic-debugging`** (`/Arsenal/superpowers/skills/systematic-debugging/`): reproduce the empty-portal symptom against the real DB, find the root cause, fix it, prove the fix by observation — NOT by `tsc`.
- **Lens:** the [cross-portal-workflow-map.md](../cross-portal-workflow-map.md) identity model (§3). A coherent demo gym is the bar.

## The problem (confirmed by the auditor — verify it yourself first)
Every authenticated portal renders empty. Root cause is a broken identity chain:
1. The auto-profile trigger is **commented out** — `supabase/migrations/000005_create_triggers.sql` defines `handle_new_user()` but never attaches `on_auth_user_created`. So `auth.users` inserts create **no `profiles` row**.
2. Seed `000006_seed_data.sql` creates profiles/coach records for `owner@`/`coach@` by looking them up in `auth.users` — but those users are created later in `000008_demo_accounts.sql` (**ordering bug** → guarded inserts silently skip).
3. `000008` creates `auth.users` + `user_roles` but **no `profiles`**.

Net: all 4 demo logins have no `profiles` row → `get_user_gym_id()` (reads `profiles.gym_id`) returns NULL → every gym-scoped query returns nothing; "add student" fails. Seeded students exist but no logged-in user has gym context to see them; `student@`/`coach@` aren't linked to any `students`/`coaches` row.

### Reproduce first (against the linked cloud DB or a local `supabase start`)
```sql
-- expect: 4 rows of auth users, but 0 matching profiles
select u.email, p.id as profile_id, p.gym_id
from auth.users u left join profiles p on p.id = u.id
where u.email like '%@prolinegym.lb';
```

## Build Deliverables (new migration `000017_foundation_identity.sql` + fixes)

1. **Auto-profile on signup.** Attach the trigger so every new `auth.users` row gets a `profiles` row (`id = NEW.id`, `gym_id` resolved sensibly — e.g. the single active gym for V1, or from signup metadata). Make `handle_new_user()` robust + idempotent. This must serve real future signups, not just demos.

2. **Backfill + coherent demo gym (idempotent).** For the four demo logins under `proline-gym`:
   - `owner@`, `reception@` (and `head_coach@` if present): create `profiles` with `gym_id = proline-gym`. They must see the full seeded roster.
   - `coach@`: `profiles` + a linked `coaches` row (same gym) → so the Coach portal resolves a real coach with a roster.
   - `student@`: `profiles` + a linked `students` row (same gym) **enrolled in ≥1 class, with a belt rank and ≥1 invoice** → so the Student portal shows schedule + progress + billing.
   - Make every insert idempotent (`WHERE NOT EXISTS` / `ON CONFLICT`) so it's safe to re-run.

3. **Fix ordering.** Ensure identity rows exist before they're referenced — either reorder/repair the seed in the new migration, or move the demo-identity creation into a single migration that runs after `000008`. Do NOT rewrite history that's already applied to the cloud DB; add a forward migration that backfills/repairs.

4. **Verify base CRUD actually works** end-to-end (not just renders): adding a student from `(dashboard)/students/add` must persist and appear in the list; the dashboard stats must reflect real counts (you reported it looks static — confirm whether it queries live data, fix if hardcoded).

## ⚠️ Verification protocol — this is the new definition of "done"
`tsc` + `next build` are necessary but **NOT sufficient**. You MUST run the app against the DB and observe real data. For EACH of the four logins, confirm and record what renders:

| Login | Must see (record actual result) |
|-------|-------|
| `owner@prolinegym.lb` | Populated student list; can ADD a student and see it appear; dashboard shows non-zero live counts; leads page reflects DB |
| `student@prolinegym.lb` | Own schedule (≥1 class), belt/progress, billing (≥1 invoice), PT tab lists packages |
| `coach@prolinegym.lb` | Own class schedule + student roster; (after Prompt 22 re-validate) PT roster + Log session |
| `reception@prolinegym.lb` | Student list + leads + payments populated |

If you cannot run against the cloud DB, run `supabase start` locally, apply ALL migrations (`000001`→`000017`) with `app.demo_password` set, seed, and verify there. Capture the SQL verification query output (profiles now exist for all 4) in your report.

## Constraints
- Forward-only migrations; idempotent; don't break the 000015/000016 work already in the chain.
- Surgical; match style; gym-scope everything; i18n keys only.

## Acceptance Criteria
1. The reproduce query returns a `profiles` row (with gym_id) for all 4 demo logins.
2. All four portals render populated for their demo user (table above) — observed, not assumed.
3. `owner@` can add a student and it appears in the list (write path works).
4. New real signups get a profile automatically (trigger live).
5. `tsc --noEmit` ✅ · `next build` ✅ · migration chain `000001`→`000017` applies in order.

## REQUIRED — Update the shared progress file
Append to **`audit-cycle-update.md`**, heading `## Cycle 5 / Phase 0 / Prompt F1 — Foundation & Identity Integrity`. Include: root-cause confirmation, the migration, the **before/after output of the reproduce query**, and a per-login table of WHAT ACTUALLY RENDERED (the observation, not "should work"). Flag anything still empty.

## Scope discipline & hand-back
Fix only the foundation + identity + base-CRUD-renders. Do NOT add new features. Stop after updating `audit-cycle-update.md`; tell the auditor F1 is ready for review. The auditor will then have you re-validate the Prompt 22 PT slice against the now-coherent gym, before continuing to Prompt 23.

---

### Copy-paste pointer for the coder
```text
You are the coding agent for the PRO LINE Gym Platform.
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Your next task is fully specified here — read it in full and execute it exactly:
  docs/audit/cycle-5/prompt-F1-foundation-identity.md

This is a BLOCKING foundation fix: every portal currently renders empty because demo logins have no profiles row. Root-cause it, fix it, and PROVE it by logging into each portal and observing real data — tsc/next build passing is NOT sufficient this time. Build only the foundation/identity fix (no new features). Run the reproduce SQL before and after. When done, append results to audit-cycle-update.md under "Cycle 5 / Phase 0 / Prompt F1 — Foundation & Identity Integrity" including the per-login table of what ACTUALLY rendered. Then STOP and tell me F1 is ready for review.
```
