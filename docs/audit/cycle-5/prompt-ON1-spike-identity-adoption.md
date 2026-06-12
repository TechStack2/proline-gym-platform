# SPIKE PROMPT ON-1-S — Identity adoption investigation (PARALLEL TRACK, research-only)

> **For:** the PARALLEL coding agent (Opus, worktree) · **Issued by:** Project Auditor · **Sequence:** after REP-1 (verified). Branch `prompt-on1-spike` off current `main`, worktree `../proline-rep1` reused (`git fetch origin && git checkout -b prompt-on1-spike origin/main` inside the worktree).
> **THIS IS A SPIKE: the deliverable is a REPORT, not features.** Allowed outputs: ONE markdown doc + (optionally) throwaway diagnostic SQL run via the Verify-Foundation `run_sql` mechanism on a branch. **Forbidden:** migrations applied to the ledger, production code changes, RLS changes, anything in `src/` (except nothing — don't touch src at all).

## The problem (why ON-1 needs investigation before implementation)
Operator-ratified feature: staff tap **"Invite to portal"** on a member → the member gets login credentials (temp-pass bridge now; phone-OTP at G1). The blocker: gym-managed members are **login-less profiles with random UUIDs** (migration 000018), while the entire RLS model assumes **`profiles.id === auth.users.id`** (F1 identity chain; `auth.uid()` is compared to `profiles.id` everywhere directly or via helpers). Giving an existing profile a login means the auth user's id and the profile's id must end up EQUAL — or every policy breaks for that user.

## Investigate (and answer with evidence, not opinion)
1. **FK dependency map of `profiles.id`:** enumerate EVERY table/column referencing `profiles(id)` (read the migration chain; confirm with a `run_sql` information_schema query). For each: ON UPDATE behavior. This is the blast radius of a re-key.
2. **Option A — re-key the profile:** `UPDATE profiles SET id = <new auth id>` + cascading updates (or explicit child updates in one transaction). Feasible? Write the exact transactional sketch against the real FK map. Locks/risks (notifications, invoices payer, guardian links, audit logs)?
3. **Option B — create the auth user WITH the profile's existing id:** test whether GoTrue admin user-creation accepts a caller-supplied `id` (supabase-js `auth.admin.createUser` and/or the GoTrue REST `POST /admin/users`). **Live test ONLY if the operator provides a service-role key** (see Operator inputs); otherwise document the API-contract evidence (GoTrue source/docs) and mark "needs live confirmation". If B works, adoption is trivial: pre-create with matching id → profile untouched → F1 trigger must NO-OP instead of inserting a duplicate profile (verify the trigger's conflict behavior — read its 000017 definition).
4. **Option C — adoption-at-signup trigger:** F1's on-auth-created trigger adopts a matching login-less profile by phone. Note this still requires A or B under the hood (ids differ) — analyze honestly whether C is just B/A with extra steps.
5. **Option D (expected REJECT, prove it):** a `profiles.auth_user_id` mapping column — enumerate how many policies/helpers assume equality (`grep` the migration chain for `auth.uid()`) to quantify the blast radius, then reject with numbers.
6. **Service-role plumbing:** where the privileged call lives (Next.js server action/route with `SUPABASE_SERVICE_ROLE_KEY` server-env, staff-authz checked against the caller's JWT before any admin call), what the operator must provision (env var in Vercel + `.env.local`), and the temp-pass flow (generate once, show once, force-change flag — how does Supabase model "must change password"? Investigate: no native flag → design the app-side gate, e.g. profile flag + middleware redirect to /onboarding).
7. **Recommendation:** ONE mechanism, with: migration sketch (NOT applied), the invite server-action contract, rollback story, and the G1 switchover note (same button → OTP later).

## Deliverable
`docs/audit/on1-identity-adoption-spike.md` — the FK map (table), each option's verdict with evidence, the recommendation + sketches, operator-input list. Commit it on `prompt-on1-spike` and push. Append a 5-line summary to `audit-cycle-update.md` under `## Cycle 5 / V1 / ON-1-S — Identity adoption spike (parallel)`.

## Operator inputs (request via your report if needed)
A service-role key for the live Option-B test (operator fetches from the Supabase dashboard; NEVER commit it; use it only via local env in the worktree; the operator may rotate it after the spike).

## Hygiene
Worktree only; port 3100 if you run anything; doc-only commits, scoped `git add`; **no Claude/Co-Authored-By trailer**; any throwaway SQL rows cleaned up in the same run.

## Hand-back
Report PASS (spike answered) with the recommendation headline. The AUDITOR turns it into the ON-1 implementation prompt (mainline) later.

---

### Copy-paste activation block for the PARALLEL coder (Opus session)
```text
You are the PARALLEL coding agent for the PRO LINE Gym Platform — RESEARCH SPIKE, not a feature.
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-rep1 (worktree).
Setup: git fetch origin && git checkout -b prompt-on1-spike origin/main

Read in full and execute exactly:
  docs/audit/cycle-5/prompt-ON1-spike-identity-adoption.md

Deliverable = ONE report doc (docs/audit/on1-identity-adoption-spike.md), pushed on your branch. NO
migrations applied, NO src/ changes, NO RLS changes — diagnostic run_sql via a Verify-Foundation branch
dispatch is allowed (read-only information_schema queries; any throwaway rows cleaned in-run).
Answer with evidence: (1) FULL FK dependency map of profiles.id (migration chain + information_schema) w/
ON UPDATE behaviors — the re-key blast radius. (2) Option A re-key transaction sketch against that real
map + risks. (3) Option B: can GoTrue admin user-creation accept a caller-supplied id (auth.admin.
createUser / POST /admin/users)? Live-test ONLY if the operator hands you a service-role key (request it
in your report if you need it; never commit it); else cite API-contract evidence and mark "needs live
confirmation". If B works: verify the F1 trigger (000017) NO-OPs vs duplicate-inserts on existing
profile. (4) Option C adoption-trigger: show honestly whether it reduces to A/B. (5) Option D mapping
column: count auth.uid() equality assumptions in the migration chain (grep) and reject with numbers.
(6) Service-role plumbing design: staff-authz'd Next server action w/ SUPABASE_SERVICE_ROLE_KEY (server
env), temp-pass shown-once flow, forced-change gate design (no native Supabase flag → app-side flag +
middleware redirect). (7) RECOMMEND one mechanism: migration sketch (not applied), invite action
contract, rollback, G1 switchover note. Append a 5-line summary to audit-cycle-update.md under "Cycle 5
/ V1 / ON-1-S — Identity adoption spike (parallel)". Scoped git add; no Claude/Co-Authored-By trailer.
Then STOP and report the recommendation headline to the operator for the auditor's review.
```
