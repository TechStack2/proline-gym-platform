# SESSION STATE — read me first (Cycle 5 handoff)

> Durable handoff note (committed to the repo so it survives a workspace-root / new-session change). Last updated: 2026-06-09. The authoritative, detailed log is **`audit-cycle-update.md`** (repo root). The auditor's prompts are in **`docs/audit/cycle-5/prompt-*.md`**.

## Who/what
- Project: **PRO LINE Gym Platform** — martial-arts gym PWA (Next.js 14, Supabase, TS, Tailwind, Arabic-first RTL, dual-currency, **no payment processing**, i18n keys only).
- You are the **coding agent**. A read-only **Project Auditor** drives the work via sequenced prompts (`docs/audit/cycle-5/prompt-*.md`); you implement and log results to **`audit-cycle-update.md`**.
- Repo: `github.com/TechStack2/proline-gym-platform` (private). Default branch `main`.

## Where we are — Cycle 5, **Phase 0 (foundation) COMPLETE**, all green in CI
- **F1 / F1.1** — identity chain fixed (auto-profile trigger + coherent demo gym; student list/add, schedule, dashboard counts; middleware made Edge-safe so prod `next start` serves).
- **V1** — Playwright **behavior-green harness** is the standing gate (`e2e/`, `.github/workflows/e2e.yml`).
- **22-R** — PT vertical slice re-validated end-to-end (request → approve+invoice → coach roster → log session → state back).
- **F2** — notification producer **root-caused (World C)** and fixed for the general path; see "Sanctioned pattern" below.

## Cloud DB (the only DB — NO local Docker)
- Remote Supabase project ref **`ufpuebfkcpohwubrutff`**. Migration chain applied through **`000022`** (recorded in `supabase_migrations.schema_migrations`).
- `.env.local` (gitignored) has `NEXT_PUBLIC_SUPABASE_URL` + `ANON_KEY`. Demo password is PUBLIC: **`ProlineDemo2024!`**. Demo logins: `owner@` / `coach@` / `reception@` / `student@` `@prolinegym.lb`.

## CI machinery (this is how "done" is proven — NOT tsc/build alone)
- **E2E behavior gate:** `gh workflow run "E2E Verification (behavior-green gate)" --ref <branch>` (auto-runs on push to `main`). Playwright vs the **production build** on the cloud DB. Read server logs in the run: `gh run view <id> --log | grep -i WebServer`. Poll: `until [ "$(gh run view <id> --json status -q .status)" = completed ]; do sleep 12; done` (the harness blocks bare `sleep` > ~30s).
- **Apply migrations / run SQL on cloud** (Supabase Management API, admin context — `auth.uid()` NULL, no `SET ROLE`): `gh workflow run "Verify Foundation (F1)" --ref <branch> -f apply=true -f migrations="0000XX_name"`. To run ad-hoc diagnostic SQL, add a `run_sql` block to `verify-foundation.yml` on your branch and dispatch `--ref <branch>`.
- GH secrets already set: `SUPABASE_ACCESS_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `gh` is authed as `TechStack2`.

## Sanctioned NOTIFICATION pattern (F2 — use this in all flows)
Call **`createNotification` / `createNotificationForRole`** directly from a staff **Server Action**, passing the action's **already-authenticated `supabase` client** and the recipient's **`profile_id`** (`profiles.id === auth.users.id`). RLS policy `000015` (`is_staff() AND gym_id = get_user_gym_id() AND recipient_in_gym(user_id, gym_id)`) is the only guardrail — **no `SECURITY DEFINER` bypass needed**. **Never add `.select()`/RETURNING to a producer insert** — that's what caused the F2 `42501` (RETURNING needs the recipient-only SELECT policy, which a staff row fails). The `000021` definer RPC is superseded (left defined, unused).

## Conventions / gotchas that bite
- **Verification = green in the e2e harness**, observed in a browser — not `tsc`/`next build` alone.
- The `(dashboard)` layout renders content **twice** (responsive shells) → in Playwright use `:visible` scoping / `.first()`.
- Login button text is **"Login"** → select `button[type="submit"]`.
- Local dev: run on a **non-3000 port** (operator runs 2 other localhost projects): `npm run dev -- -p 3100`.
- Parallel sub-agents: the Agent tool's `isolation:"worktree"` FAILS here (harness CWD isn't the repo) → create worktrees manually; and do **not** symlink `node_modules` into a worktree and `git add -A` (it gets committed — `/node_modules` is now in `.gitignore` to prevent recurrence).

## Known non-blocking findings (for later prompts, not bugs to fix now)
- `<NotificationBell>` renders only in the **mobile** dashboard top bar; desktop header bell is a stub; `/portal` and `/coach` have no bell. Full list always reachable via `/notifications`.
- `MISSING_MESSAGE` i18n gaps: `students.cancel/female/gender/male` render as the key (cosmetic).
- Cloud demo gym has **accumulated test data** (e.g. `E2E <timestamp>` students, multiple pending "Single PT Session" requests) — harmless test residue.

## RESUME HERE — current state (updated 2026-06-15)
> **Platform name: "Gym 360 Pro"** (vendor brand; Proline = tenant #1; white-label-ready). Model: design-first, ONE coder prompt per slice → CI behavior-green → **auditor** verifies via `gh run`+diff (never the coder's word) → race-proof worktree merge + `milestone/<slice>-green` + `backup/pre-<slice>-main` tags → watch the post-merge union run. Memory auto-loads the rest. See [[platform-named-gym-360-pro]], [[merge-conflicts-structured-files]], [[auditor-git-hygiene-head-race]].

### ✅ V1 COMPLETE & DEPLOYED (2026-06-15)
32 slices merged green, zero regressions: 23R 24R C1 D1 TI FK AR B2 LP IA1 IA2 IA3 UX1 ADM1 B3 ADM2 REP1 FD1 PT1 E1 PT2 ML1 ON1-spike LPX1 I18N1 FIN1 GRW1 ON1 G1 F3 G2 + **AX-2** (landing polish — trial-form gym-slug fix, clean hero, per-discipline icons, OSM map; `milestone/AX2-green`, merge 6420da6). Readiness review = **GO** ([`v1-readiness-review.md`](./v1-readiness-review.md)): live audit clean (no RLS gaps/drift, ~110 policies/46 tables, chain through 000057 + one-off seeds). **DEPLOYED on Railway** (auto-deploy from `main`; env keys SUPABASE_SERVICE_ROLE_KEY=sb_secret_/WHATSAPP_TOKEN_ENC_KEY/NEXT_PUBLIC_SITE_URL set). Hard-refresh prod to clear the PWA SW after each deploy.

### 🔵 ACTIVE NOW — 360 trilogy, 2-LANE PARALLEL (post-demo-1 feedback; for demo 2)
The "360" trilogy: **Member-360** (built, IA-2) + **Coach-360** (TEAM-1) + **Business-360** (FD-2 Today/Week/Month). Two coders run CONCURRENTLY off `main` (8cbef4a), fenced:
- **Lane A — FD-2 (MAINLINE, main repo, port 3000):** [`prompt-FD2-today-360.md`](./prompt-FD2-today-360.md). Today/Week/Month = DISTINCT card sets (operational→tactical→strategic) + PWA footer fix. Fence: `today/**` + `lib/finances/**` + DashboardLayoutClient + `today.*` i18n. Zero schema.
- **Lane B — TEAM-1 (WORKTREE `../proline-team1`, port 3100, branch `prompt-team1-coach-360`):** [`prompt-TEAM1-coach-360.md`](./prompt-TEAM1-coach-360.md). Coach-360 hub (mirror Member-360) + Day-Diary reframe (class+PT+gaps). Fence: diary/Team/Coach-360 + coach libs + nav-config + `coach360.*`/`team.*` i18n. Aim zero schema (coach_availability/PT-2 exists). Perms: owner+head_coach+reception manage; deactivate owner/head_coach only.
- **Orchestration (CRITICAL):** coders **report "ready", do NOT self-merge.** Auditor merges **FD-2 first**, then rebases+re-verifies TEAM-1 onto it; union-validate between. Conflicts expected only in i18n JSON (namespaced→trivial) + playwright.config (each appends its project; resolve by hand). Design: [`../design-360-today-coach.md`](../design-360-today-coach.md) (forks locked).
- **Disjoint micro-fix queued (not blocking, not in either fence):** landing non-combat discipline icons (Fitness/Zumba/Ladies → default glyph now; add to the DisciplinesSection keyword map, e.g. 🏋️/💃/🤸).

### Recovery
All `milestone/<slice>-green` + `backup/pre-<slice>-main` tags on origin (latest `milestone/AX2-green`). Restore = reset to the tag + `--force-with-lease`.

### Standing operator prefs / pending
Dev port 3000 (parallel lane 3100); NO Claude/Co-Authored-By trailer. Pending operator: revoke `SUPABASE_ACCESS_TOKEN` post-demo phase; enable Supabase **phone provider** when switching member login to OTP (ON-1 used synthetic-email + temp-pass since phone auth is off). Pricing model (held in chat, not repo): setup $400 + tiers $59/$99/$149, founding-partner discount for Proline.

### Post-V1 = Cycle 6 white-label
Landing CMS, gym-onboarding wizard (productize the TI ephemeral-gym seed), **subdomain-per-gym routing** (the gym-slug-from-`?gym=` → from-subdomain; AX-2's trial-form bug was the early tell), per-gym WhatsApp (G1 Cloud-API toggle exists), SaaS billing. Tenant-clean rule kept this cheap.

## On resume (after compaction / VS Code reset / new session)
1. `git -C /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform fetch origin && git log --oneline -1 origin/main`.
2. **Read this RESUME-HERE block + tail of `audit-cycle-update.md`.** Memory auto-loads conventions.
3. **Active work = the 2-lane parallel above.** Check both lanes: `gh run list --branch prompt-fd2-today-360` and `--branch prompt-team1-coach-360`. On a coder's "ready" report → verify (CI+diff) → merge (FD-2 first) → tag → union-validate → relay next. If `../proline-team1` worktree is gone, recreate: `git worktree add ../proline-team1 -b prompt-team1-coach-360 origin/main`.
4. After both merge → final redeploy → demo 2. Then Cycle 6 (white-label) or operator's next direction.
