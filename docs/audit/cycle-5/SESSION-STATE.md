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

## Cycle-5 / Phase-1 progress (updated 2026-06-09 — strangler model, sequential slices)
> Strategy changed from a parallel dispatch-mission to **design-first, one sequential vertical slice at a time** (see [`docs/audit/journey-catalog.md`](../journey-catalog.md) — the master registry of ~25 journeys + sequencing). Each journey gets a deep design doc, then ONE coder prompt; merge is FF on origin/main with recovery tags.
- **A1 Lead → Active-Member — ✅ MERGED** (prompt 23-R; run 27214829204, 22/0). Migrations 000023/000024. Convert RPC + simulated-invite provisioning seam.
- **B1 Member Activity Loop — ✅ MERGED** (prompt 24-R; run 27219997474, 23/0). Migrations 000025 (atomic `promote_student`) /000026. Eligibility hint (L4), `/portal/progress`, 3 handoffs.
- **C1 PT Session Delivery — 📐 prompt ready, activating** ([prompt-C1-pt-session-delivery.md](./prompt-C1-pt-session-delivery.md)). Runs after 24-R (now merged); branch `prompt-c1-pt-delivery`.
- **D1 Billing & Payment — 📐 designed, under re-review** ([journey-billing-and-payment.md](./journey-billing-and-payment.md)); D1 closes Phase 1.
- **Recovery tags on origin:** `milestone/23R-green`@84a33a6, `milestone/24R-green`@7029083 (+ `backup/pre-2xR-main`). Restore = `git reset --hard milestone/24R-green && git push --force-with-lease`.

### Standing findings to schedule (from 23-R/24-R drag reads)
- ⚠️ **`notifications.user_id` FKs `auth.users`** → login-less gym-managed members can't receive notifications (relax FK→`profiles`, or provision real logins). Affects D1/C1 + 23-R `lead_converted`.
- **Admin presentation layer is uniformly DOA** against the real schema: `/invoices` (name/issue_date/embedded-.or()), students search, classes list+detail+enroll (coaches.first_name / *.status non-existent). Each = its own repair slice; interleave when a journey touches it.
- Coach attendance is **day-of-week scoped, no date picker** (product gap; seed 000026 = test workaround).
- The `(dashboard)` double-shell `:visible` Playwright tax recurs every slice — a shared helper is overdue.

## Next step
Continue the sequential slices: **activate C1** (PT delivery), then **D1** (Billing & Payment) to close Phase 1, then re-score the portals vs [`industry-benchmark.md`](../industry-benchmark.md) and decide Phase-2 entry. No new flow work starts until the auditor hands the next prompt.

## On resume
1. Confirm `git status` clean, `git pull` (main = origin/main).
2. `npm install` if `node_modules` is missing (it's gitignored).
3. Read this file + the tail of `audit-cycle-update.md`, then wait for / open the next `docs/audit/cycle-5/prompt-*.md` the auditor provides.
