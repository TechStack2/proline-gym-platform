# CODER PROMPT 23-R — Lead → Active-Member Journey: Clean Rebuild (single sequential slice)

> **For:** Coding agent (ONE agent, sequential — **not** a parallel mission) · **Issued by:** Project Auditor · **Sequence:** Phase 1, after F2 closed the notification producer pattern. This replaces the deferred parallel Prompt 23.
> **Why this shape:** strategic decision — we are **strangling, not rewriting**. The base is sound; the missing ingredient was **journey design**, now written. You rebuild **this one journey** cleanly on the current base, and report an honest **drag read** at the end (clean like 22-R/F2, or a slog fighting legacy cruft?). That data point decides strangle-vs-rewrite — so be candid.
> **The full spec is the journey design doc — read it first and treat it as authoritative:**
> 📎 [`docs/audit/cycle-5/journey-lead-to-active-member.md`](./journey-lead-to-active-member.md)
> Hand verbatim. Self-contained.

---

## Role, Skill, Lens
- **Act as `architect` + `database-reviewer`** (`/Arsenal/ecc/agents/`): model the onboarding transaction as a state machine; `database-reviewer` verifies the convert txn is **atomic, gym-scoped, staff-only**, and that the new `leads` INSERT RLS introduces no cross-gym leak. Pull in `tdd-guide` for the credit/billing/notification side-effects.
- **Apply superpower `test-driven-development`** (`/Arsenal/superpowers/skills/test-driven-development/`): write the failing assertion *first* — "convert ⇒ a `students` row + `student_memberships` + first `invoice` exist, `leads.converted_student_id` is set, and a `lead_converted` notification is produced." Then `verification-before-completion`: **"done" = green in the e2e behavior harness in CI**, observed across portals — NOT `tsc`/`build`.
- **Lens:** [`cross-portal-workflow-map.md`](../cross-portal-workflow-map.md) — this is a **vertical slice**: a lead originates → propagates to admin/coach → converts to a real member that surfaces in admin roster + billing + coach. Maturity target: **L3 Managed** (every step persists, notifies, and surfaces state).

## Strategic context — what this closes, and what it deliberately does NOT (read first)
**Directly responsive to the benchmark** ([`industry-benchmark.md`](../industry-benchmark.md), Portal A — Marketing). It closes three capabilities and the platform's worst cross-portal break:
- *Lead capture* **2/5 "Behind"** → source-tagged capture from **all channels** + instant staff notification → L3.
- *Intro-offer / trial funnel* **1/5 "Behind"** → a **persisted trial** (date/time/coach) with a coach handoff → L3.
- *Online signup & purchase* **0/5 "Behind"** → an **atomic convert → real member + membership + first invoice** → L3.
- The headline gap: today a "converted" lead **becomes nothing** (cosmetic status flip; no student/membership/invoice; `converted_student_id` never set; no propagation).

**Where it sits** ([`platform-elevation-roadmap.md`](../platform-elevation-roadmap.md)): **Phase 1 — Connective Tissue** (TRACK B). Make the funnel **real and L3-Managed** — NOT best-in-class yet.
- **Do NOT build now (later phases; keep the contract extensible so they drop on top without rework):** self-serve trial *booking* from a landing calendar + online self-signup/purchase (**Phase 5**); **e-sign waiver** (Phase 4/5); **real** auth/login activation + WhatsApp/OTP *send* (swap the provisioning adapter later — Phase 5/6); **automated-inbound** origination (WhatsApp/Instagram webhook, member referral — Phase 5/6); family/household linking (**Phase 2**); lead nurture/win-back automation (**Phase 4**).
- **Leapfrog lanes to respect (don't regress):** Arabic-first RTL on every new surface, dual-currency on the invoice, WhatsApp-friendliness (the provisioning seam is exactly where WhatsApp-native plugs in).

## Sanctioned NOTIFICATION pattern (F2 — use everywhere; do not deviate)
Call **`createNotification` / `createNotificationForRole`** ([src/lib/notifications/create.ts](../../src/lib/notifications/create.ts)) **directly from a staff Server Action**, passing the action's **already-authenticated `supabase` client** and the recipient's **`profile_id`** (`profiles.id`). RLS `000015` (`is_staff() AND gym_id = get_user_gym_id() AND recipient_in_gym(user_id, gym_id)`) is the only guardrail — **no `SECURITY DEFINER` bypass**. The helpers are **RETURNING-free by contract**: **NEVER add `.select()`/RETURNING to a producer insert** (that was the F2 `42501` root cause — World C). For the **anon web** origination path only, `lead_new` is emitted **inside `submit_public_lead`** (already SECURITY DEFINER, runs as `postgres`) because there is no authenticated caller — that is the sanctioned exception, not a new pattern.

---

## What you are building — T1…T6 to L3 (see the journey doc §6 for the full anatomy)

Rip out the cosmetic stubs in [`leads-client.tsx`](../../src/app/[locale]/(dashboard)/leads/leads-client.tsx) (the unwired trial date/time inputs at L320-333; the convert that only `.update`s a string) and implement the journey:

### T1 — Origination (ALL channels — both paths in scope)
- **T1a Self-serve (website):** extend `submit_public_lead` ([000009](../../supabase/migrations/000009_public_lead_submissions.sql)) to map the program select → a real `interested_discipline_id`, capture `last_name`/`email` if provided, and **emit `lead_new`** inside the RPC.
- **T1b Staff-manual (NEW surface — the key origination build):** add an **"Add Lead"** form to the admin board for the offline/messaging channels (`walk_in · phone · instagram · facebook · whatsapp · referral · other`): fields name/phone + **source** (+ `source_detail`, interested discipline, notes). Authed **staff INSERT** into `leads` (gym-scoped from the caller's `gym_id`, `status='new'`). Add/confirm the **staff INSERT RLS** on `leads` (today the board only reads/updates — `database-reviewer` verifies no cross-gym write). Emit **`lead_new`** via `createNotificationForRole(owner + receptionist)` so the whole front desk sees it.

### T2 — Triage / Contact
- Keep the existing optimistic status path; **persist `assigned_to`** when staff assigns. No notification required.

### T3 — Schedule Trial (free-form date/time + coach)
- **Migration:** `trial_classes` cannot model this today (no time, no coach, `class_id NOT NULL` — [000003:410-420](../../supabase/migrations/000003_create_operational_tables.sql#L410-L420)). Add `scheduled_time TIME` + `assigned_coach_id UUID REFERENCES coaches(id)`, and make **`class_id` nullable**.
- **Wire the trial form** (real inputs/state — currently dead). Server action INSERTs `trial_classes` (lead_id, scheduled_date, scheduled_time, assigned_coach_id, status `scheduled`) and sets `leads.status='trial_scheduled'`, atomic. Emit **`trial_scheduled`** → the assigned **coach** (`createNotification`, recipient = coach `profile_id`).
- **NEW coach "Trials" surface** (minimal list tab in the coach portal alongside attendance/PT) showing that coach's upcoming trials.

### T4 — Trial Outcome
- Coach or reception records result → `trial_classes.status` ∈ `completed|no_show|cancelled`, `show_up`, `feedback`; reflect to `leads.status` (`trial_completed` on show). Outcome feeds T5.

### T5 — Convert → Onboard (the critical atomic transaction)
- **New RPC `convert_lead_to_member(p_lead_id, p_plan_id, …)`** — atomic, **staff-only**, **gym-scoped**, extending the proven `create_student` pattern ([000018:30-89](../../supabase/migrations/000018_student_identity_write_path.sql#L30-L89)). In ONE transaction: create `profiles` (login-less, `gen_random_uuid()` — the FK to auth.users was dropped in 000018) → `students` → `student_memberships` (plan_id, start=today, end=today+`plan.duration_days`, status `active`) → `invoices` (`invoice_type='membership'`, `amount_usd=plan.price_usd`, set `exchange_rate`/`rate_date`; **let the triggers compute `total_usd`/`tax_amount_usd`/`invoice_number`** — [000005:173-217](../../supabase/migrations/000005_create_triggers.sql#L173-L217)) → set `leads.converted_student_id`, `status='converted'`, `converted_at`. **All-or-nothing.**
- **Convert modal** with a **membership-plan picker** (the gym's active `membership_plans`) — the chosen plan drives the invoice. **Allow walk-in convert** (do NOT gate on a trial row). **Soft duplicate-phone warning** (no hard block).
- Server action calls the RPC, then emits **`lead_converted`** → the new member's `profile_id`, and invokes the provisioning seam.

### Provisioning seam — "contained simulation" (build the seam, simulate the send)
- Define an **`AccountProvisioning`** interface + a **`SimulatedProvisioning`** implementation: generate an invite token, record a visible **"login invite pending/sent (simulated)"** state, emit nothing external, create **no `auth.users` row**. Surface the "invite pending" state in admin. This is deterministic → behavior-testable. **Real** Supabase-Auth/WhatsApp-OTP send + login activation is a later one-file adapter swap — do not build it.

### T6 — First Active State (propagation proof, not a write)
- The new member must surface on the **admin students roster**, in **admin billing** (the dual-currency membership invoice), and be coach-enrollable. Asserted by the e2e spec.

### i18n
- Add `notifications.lead_new / trial_scheduled / lead_converted` (`.title`/`.body`) keys + all new UI strings to **ar/en/fr** ([src/i18n/messages/](../../src/i18n/messages/)); Arabic-RTL on every new surface. No `MISSING_MESSAGE`.

## Lock it under the harness (the durable deliverable)
Add a **Lead-journey cross-portal spec** to `e2e/` (own file, e.g. `e2e/leads.spec.ts`) per [`e2e/README.md`](../../e2e/README.md), with resilient selectors (surgical `data-testid`s if needed). It must, on the **cloud DB the harness uses**, drive real logins and assert real state:
1. **Origination both ways:** a public web submit **and** a staff "Add Lead" each create a gym-scoped `leads` row with the correct `source` **and** a `lead_new` notification readable by staff only.
2. **Trial:** scheduling persists a `trial_classes` row (date/time/coach) + notifies the coach + the coach sees it on the Trials surface.
3. **Convert:** produces — atomically — `profiles`+`students`+`student_memberships`+`invoices` (TVA-correct total via trigger) + `leads.converted_student_id` set + a `lead_converted` notification + a simulated-invite state; the member then appears on the admin roster + billing.
- Idempotent / re-runnable (uniquely-named lead per run so state doesn't accumulate). **Fail loudly** (not skip) if any portal doesn't reflect a step.

## Acceptance Criteria — the harness is the judge
1. The full Lead→Member slice is **green in the E2E CI run** against the cloud DB (report the run ID + URL); screenshots uploaded.
2. Both origination paths work; `lead_new`/`trial_scheduled`/`lead_converted` are produced and readable by the right recipients only (no cross-gym leak).
3. Convert is atomic (partial failure rolls back the whole set) and creates a correct dual-currency `membership` invoice from the chosen plan.
4. The provisioning seam exists with a `SimulatedProvisioning` impl + visible invite state; **no real `auth.users`/external send**.
5. `tsc` + `next build` clean. **No RLS/auth weakened to pass**; any data fix is gym-scoped; the new `leads` INSERT policy is staff-only + same-gym.

> **Honesty rule (from F1/F1.1/22-R):** if your sandbox can't run Playwright/cloud, say so and **push so `e2e.yml` CI runs it** — then report the actual CI run ID + result. Do **not** fabricate a "what rendered" table; CI is the source of truth.

## Hygiene (F2 lessons — non-negotiable)
- **Scope every `git add` to the files you changed — never `git add -A`** (a worktree symlink got committed last time).
- `node_modules` stays **gitignored** (it now is; don't re-add it).
- If you parallelize anything locally, use a **manual git worktree** — the Agent-tool `isolation:"worktree"` **fails in this harness** (CWD isn't the repo). This slice is sequential, so you likely don't need one.
- Local dev on a **non-3000 port** (`npm run dev -- -p 3100`); the `(dashboard)` layout renders twice (responsive) → scope Playwright with `:visible`/`.first()`; login button is `button[type="submit"]`.

## REQUIRED — Update the shared progress file
Append to **`audit-cycle-update.md`**, heading `## Cycle 5 / Phase 1 / Prompt 23-R — Lead → Active-Member Journey Rebuild`. Include:
- A **per-transaction PASS/FAIL table** (T1a, T1b, T2, T3, T4, T5, T6) with **file:line** proof for each.
- The **E2E CI run ID + URL** and the result.
- Migrations added (names) + confirmation they applied to the cloud ledger.
- Confirmation of notification recipients (which role/profile got each of `lead_new`/`trial_scheduled`/`lead_converted`) and the convert invoice row (plan price → TVA total).
- An explicit **"Lead→Member slice behavior-green: PASS/FAIL"** line.
- **DRAG READ (required, candid):** did building this on the current base feel **CLEAN** (like 22-R/F2) or a **SLOG** fighting legacy DeepSeek cruft? Cite specifics — what fought you (dead stubs, schema gaps, RLS friction, type drift) vs what the sound base gave you for free. This is the measurement that decides strangle-vs-rewrite; do not soften it.

## Scope discipline & hand-back
Build the **Lead→Member journey only** (T1–T6) + its harness spec + the provisioning seam. No adjacent refactors, no Phase-2+ features, no real auth/WhatsApp send. Stop after updating `audit-cycle-update.md`; tell the auditor whether the slice is behavior-green **and give the drag read**. The auditor reviews the evidence + the drag read before deciding the next move (continue strangling slice-by-slice, or revisit rewrite).

---

### Copy-paste pointer for the coder
```text
You are the coding agent for the PRO LINE Gym Platform.
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Your next task is fully specified here — read it in full, then read the journey design doc it points to, and execute exactly:
  docs/audit/cycle-5/prompt-23-R-lead-journey-rebuild.md
  docs/audit/cycle-5/journey-lead-to-active-member.md   (the authoritative spec/anatomy)

Strategic context: we are STRANGLING, not rewriting. Rebuild ONE journey cleanly on the current
base and report an honest drag read at the end. Rip out the cosmetic Lead stubs and implement the
full Lead -> Active-Member vertical slice to L3 Managed:
  T1 Origination BOTH ways — extend submit_public_lead (web: map discipline, emit lead_new in the
     anon RPC) AND a NEW staff "Add Lead" surface for walk_in/phone/instagram/facebook/whatsapp/
     referral/other (authed staff INSERT, gym-scoped, staff-only INSERT RLS, lead_new fan-out to
     owner+receptionist);
  T2 persist assignment;
  T3 migrate trial_classes (add scheduled_time + assigned_coach_id, relax class_id NOT NULL), wire
     the dead trial form, write the row, notify the assigned coach, add a minimal coach "Trials" tab;
  T4 record trial outcome (show/no_show/feedback) -> reflect lead status;
  T5 CONVERT — new atomic staff-only gym-scoped RPC convert_lead_to_member(p_lead_id, p_plan_id)
     extending create_student: profiles(login-less)+students+student_memberships+membership invoice
     (let triggers compute total/number) + set leads.converted_student_id/converted/converted_at;
     convert modal with a plan picker; allow walk-in convert; soft duplicate-phone warning; emit
     lead_converted to the new member; invoke a provisioning seam;
  Provisioning seam = AccountProvisioning interface + SimulatedProvisioning (records an "invite
     pending/sent (simulated)" state, NO real auth.users, NO external send) — real WhatsApp/OTP is a
     later adapter swap;
  T6 prove the member surfaces on admin roster + billing + coach-enrollable.
Use the SANCTIONED notification pattern: createNotification/createNotificationForRole directly from
the staff Server Action with the action's authed client + recipient profile_id; helpers are
RETURNING-free — NEVER add .select() to a producer insert (that was the F2 42501). lead_new on the
web path is emitted inside submit_public_lead (anon RPC) as the sanctioned exception.
Add i18n (ar/en/fr) for the 3 notification types + new UI strings, Arabic-RTL, no MISSING_MESSAGE.
Add e2e/leads.spec.ts asserting BOTH origination paths + trial + atomic convert on the cloud DB;
verify in the E2E CI run, not tsc — if your sandbox can't run the browser, push so e2e.yml runs and
report the actual run ID + result; do NOT fabricate results.
Hygiene: scope every git add (never git add -A); keep node_modules gitignored; non-3000 dev port;
(dashboard) renders twice -> use :visible/.first(); login is button[type="submit"]. Do NOT weaken
any RLS/auth to pass. Do NOT build real auth/WhatsApp send, online self-signup, e-sign, family, or
automated inbound — those are later phases.
When done, append to audit-cycle-update.md under "Cycle 5 / Phase 1 / Prompt 23-R — Lead ->
Active-Member Journey Rebuild" with a per-transaction PASS/FAIL table (file:line), the CI run ID/URL,
migrations applied, notification recipients, the convert invoice row, an explicit "Lead->Member slice
behavior-green: PASS/FAIL" line, AND a candid DRAG READ (clean like 22-R/F2 vs slog fighting legacy
cruft, with specifics). Then STOP and tell me 23-R is ready for review.
```
