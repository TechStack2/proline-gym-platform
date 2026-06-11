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

## RESUME HERE — current state (updated 2026-06-10)
> **Model:** design-first, **one sequential slice at a time** on `main` (master plan = [`docs/audit/journey-catalog.md`](../journey-catalog.md); V1 scope-lock = [`docs/audit/v1-market-readiness-scope.md`](../v1-market-readiness-scope.md)). Each slice: deep design doc → ONE coder prompt → CI behavior-green → auditor merges to `main` (FF/clean) with a `milestone/<slice>-green` tag. The auditor verifies via CI + reading code, never assumes.

**Phase 1 (Foundation + Connective Tissue) COMPLETE & merged**, then into the **V1 punch-list**:
- ✅ **D1 Billing & Payment** (canonical `issue_invoice`/`record_payment`, atomic reconcile). 
- ✅ **TI ephemeral-gym** test-infra (each CI run provisions/tears down its own gym → deterministic suite).
- ✅ **FK** — `notifications.user_id` FK swapped `auth.users`→`profiles` (000032) so login-less members receive notifications.
- ✅ **AR** — admin-presentation repair (classes list/detail, students search via profiles, /payments history view, i18n) — the DOA cluster fixed.
- ✅ **B2 Recurring-Class Registration** (000033/000034) — request→approve(+discount)→bill→roster + waitlist auto-promote; `class_registrations` + `classes.monthly_fee`; `_system_issue_invoice` (REVOKE FROM PUBLIC).
- ✅ **LP Landing (public brand + live schedule/offerings)** — MERGED (`milestone/LP-green`, CI 27304264500, 33/0). Anon catalog read 000035 (no PII, SECURITY DEFINER gates, `get_public_gym`); logged-out landing renders live schedule+pricing+brand. `prompt-landing-boost` + `prompt-lp-landing` branches deleted.
- ✅ **IA-1 nav+Inbox+Today+bell** — MERGED (`milestone/IA1-green`, CI 27344583448, 35/0). Nav 17→7 single-config (`nav-config.ts`), /today front-desk, /inbox (B2+22R inline approve), bell on 3 shells; rider: admin /attendance repaired (real columns + PGRST200 roster embed). IA context: operator approved the 7-workspace journey-centric IA + tenant-clean rule (white-label direction): [`cohesion-audit-admin-ia.md`](./cohesion-audit-admin-ia.md).
- ✅ **IA-2 Member-360 + Money** — MERGED (`milestone/IA2-green`, CI 27347110847, 36/0). Member file live (6 panels; killed hardcoded `[]` props), /money ledger (Overview tally/Invoices/Payments + member deep-links), Active|Prospects tabs (/leads redirects), portal self-view card. Zero schema.
- ✅ **IA-3 Schedule unification** — MERGED (`milestone/IA3-green`, CI 27350686981, 37/0). Week Timetable + Day Coach-diary (both calendar species per coach; THE gym-wide + per-coach PT schedule view) + non-blocking PT conflict warning. Zero schema/write-path. Coder-flagged: class-vs-PT overlap compares server-clock HH:MM; `gyms.timezone` exists unused → fold into D3/G1.
- ✅ **UX-1 bell fix + Add-Class wizard** — MERGED (`milestone/UX1-green`, CI 27360085535, 38/0). Bell: unique per-mount channel topic + race-safe cleanup (double-shell reuse crash). Add-Class: touch-first wizard (chips/pills/presets, no dropdowns), status aligned to the REAL enum (old options all failed inserts!), dead room field gone; pageerror sweep is now a permanent regression guard. Backlog from drag read: app-wide `<Toaster>` missing (toasts no-op) → B3 rider; **PT booking at a future date/time doesn't exist** (one-tap books "now") → queued slice after B3/D2.
- 🔵 **B3 family/household (ACTIVE):** prompt ISSUED — [`prompt-B3-family-household.md`](./prompt-B3-family-household.md) (design + locked forks inside). Migration ~000036: invoices.payer_profile_id + additive guardian-read RLS via is_guardian_of() + seed guardian; Member-360 guardian panel + convert step; guardian portal (kid-switcher, request-for-kid via B2, household aggregate billing, pay-at-desk). Riders: <Toaster> mount, map query refinement if pin off. Then **D2 freeze/upgrade**.
- 📋 **Demo content (operator, via the new wizard on :3000):** create 4 Muay Thai classes M/W/F — Kids 17:00–18:00 · Juniors 18:00–19:00 · Ladies 19:00–20:30 · Adults 20:30–21:30, **$60/month each** (flyer 2026-06-11). Affiliation logos found (LMF, IFMA, Lebanese MT Fed, LMMAF, MMA Lebanon) — operator to save files into `public/landing/affiliations/` (lmf.png, ifma.png; arab-muaythai.png missing → fallback covers). Map: keyless embed already live (no API key needed) — operator verifies pin.
- 🔜 **B3 family/household — forks LOCKED with operator (2026-06-11), design doc next:** (1) **Payer:** invoice names student (recipient) AND guardian (payer) — guardian sees aggregate household billing across kids and pays AT THE DESK (no online payments; staff record via D1) → one additive payer reference on invoices = B3's only schema touch. (2) **Guardian portal:** view + request (B2 flow for kids) + pay-view; kid-switcher; NO self-cancel. (3) **Discounts:** manual per-registration via B2 (no sibling engine, V2). (4) **Data model:** existing `guardians`/`guardian_students` only — a guardian with 2+ kids IS the household; no households table.
- ⏭ then **B3 family/household (lands in Member-360) → D2 freeze/upgrade → D3 renewal/dunning → F3 e-sign → G1 WhatsApp delivery → E1 camps → G2 offline** → V1 readiness review → deploy. Post-V1: **white-label phase** (landing CMS, gym-onboarding wizard, subdomain routing, per-gym WhatsApp, SaaS billing).

**Monetization model (3 products — see memory `proline-monetization-model`):** gym membership (monthly) · recurring-class registration (monthly, discountable — B2) · PT packages (count + validity). D2/D3 span the two monthly products.

**Standing operator prefs:** dev server on **port 3000**; **NO Claude/Co-Authored-By trailer** in commits.
**Pending operator actions:** (1) **revoke `SUPABASE_ACCESS_TOKEN`** in the Supabase dashboard once the demo phase ends (it's wired into `e2e.yml` for ephemeral-gym provisioning); (2) for LP: provide the **real Google Maps embed** (Sky Business Center, Baabda) + **affiliation logos** (LMF/IFMA/Arab-Muaythai → `public/landing/affiliations/`); create the **real classes + M/W/F schedule** in admin so the landing grid is real.

**Recovery tags on `origin`:** `milestone/{23R,24R,C1,FK,AR,B2}-green` + `backup/pre-*-main`. Restore = `git reset --hard milestone/B2-green && git push --force-with-lease`.

### Open findings to schedule (non-blocking)
- **attendance/history + attendance/reports** are DOA on a deeper recurring-schedule model mismatch (`class_schedules.date` doesn't exist — it's `day_of_week`) → a dedicated "attendance reporting" slice (V1.1).
- Coach attendance is day-of-week scoped, no date picker (product gap).

## On resume (after VS Code reset / new session)
1. `git -C /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform status` clean? `git pull` (main should = origin/main).
2. `npm install` if `node_modules` is missing (gitignored).
3. **Read, in order:** this file → [`../v1-market-readiness-scope.md`](../v1-market-readiness-scope.md) → [`../journey-catalog.md`](../journey-catalog.md) → tail of `audit-cycle-update.md`. Memory (auto-loads) carries the rest.
4. **Next action:** hand the **LP activation block** (bottom of [`prompt-LP-landing-public.md`](./prompt-LP-landing-public.md)) to the coder; the auditor verifies + merges on report, then advances to B3.
