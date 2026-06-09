# Test-Infra Hardening — Ephemeral Per-Run Gym + Suite Durability

> **Created:** 2026-06-09 · **Auditor:** Project Auditor (read-only — design, not code)
> **Status:** DESIGN — awaiting sign-off before the prompt.
> **Why:** the strangler is validated (4 slices; service/data layer compounding), but the drag has **migrated to e2e-suite durability against the accumulating shared cloud DB** — C1 took **7 CI runs to converge** purely on cross-slice flakiness ([[strangle-validated-leaf-rot]]). This slice removes that tax before it exceeds per-slice build cost. **Decisions:** ephemeral per-run gym (cleanest isolation) + broad-but-bounded scope.
> **Not a user journey** — it's infra; no benchmark gap, but it de-risks D1 and every Phase-2+ slice.

---

## 1. Problem (verified)

- Harness is **serial** (`workers:1`, `fullyParallel:false`); `auth.setup.ts` only **logs in** — there is **no data reset/seed step**. Every CI run runs against the **accumulating** cloud DB seeded once by migrations (000017…).
- Symptoms (all from real CI churn): the 24-R **belt ladder exhausts** (one-way promotion, sparse `belt_hierarchies`); `attendance_absent` rows hit the `/notifications` **50-row cap**; new producers bury older notifications past the **bell's latest-N**; the `(dashboard)` **double-shell `:visible` tax** recurs every slice; one slice's correct behavior invalidates another slice's assertions (cross-spec coupling on shared rows).
- **Constraint:** `e2e.yml` has only `NEXT_PUBLIC_SUPABASE_URL` + `ANON_KEY` (acts as the anon/app user). Admin DB ops go through `verify-foundation.yml` via **`SUPABASE_ACCESS_TOKEN`** (Management API) — an **existing** GH secret. The 4 demo `auth.users` are fixed, each 1:1 with a profile bound to one gym (`proline-gym`).

---

## 2. Architecture — ephemeral per-run gym

**Each CI run gets its own fully-seeded gym, provisioned before Playwright and torn down after.** The shared `proline-gym` becomes the **manual/demo** gym only; e2e never touches it again.

```
e2e.yml run:
  1. PROVISION  (Management API / SUPABASE_ACCESS_TOKEN, admin SQL)
       slug = e2e-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}
       seed_e2e_gym(slug): gym + 4 run-scoped users + full canonical baseline
       → emit users+password+slug to $GITHUB_ENV
  2. BUILD + RUN  (anon app, as the run-scoped users)
       auth.setup.ts logs in with the run-scoped creds (from env)
       all specs operate inside the run gym (gym-scoped via the user's profile)
  3. TEARDOWN  (always(), Management API)
       drop the gym (CASCADE) + delete the 4 run-scoped auth.users
       + sweep stale e2e-* gyms older than N hours (failed-teardown safety net)
```

**Provisioning = a parameterized seed** (generalize `000017`) callable with a slug: creates the gym; **4 run-scoped `auth.users`** (`owner+<slug>@e2e.local` … with a known test password) → the `handle_new_user` trigger + the seed fill profiles/roles; disciplines; classes **with `class_schedules` on every weekday** (kills the day-scoped trap); membership plans; PT packages; **a fuller `belt_hierarchies` ladder**; the demo student (enrolled, **white belt, clean history**); the demo coach (roster). Idempotent per slug.

**Access:** reuse **`SUPABASE_ACCESS_TOKEN`** (already a secret) — add it to `e2e.yml`'s env and run provision/teardown as SQL via the Management API (the `verify-foundation.yml` pattern). **No new service-role secret needed; no public provisioning RPC** (minting gyms/users stays in admin/CI context, never a callable prod function).

**Concurrency:** a GH `concurrency` group serializes runs on the shared cloud DB; the slug is unique per run/attempt regardless, so even overlapping runs don't collide.

---

## 3. Sharp edges this MUST handle

| # | Edge | Designed handling |
|---|---|---|
| X1 | **`submit_public_lead` picks "first active gym"** (`ORDER BY created_at ASC LIMIT 1`) → with >1 gym it targets the **oldest** (`proline-gym`), not the run gym → the leads web-submit spec asserts against the wrong gym. | Give the public-lead path an explicit **gym selector** (slug param / `?gym=` on the landing route) so CI targets the run gym; default stays the demo gym for prod. (Small app change — the only production-code touch.) |
| X2 | **Failed teardown leaves orphan gyms** | teardown is `always()`; plus a **sweep** of `e2e-*` gyms older than N hours at provision time. |
| X3 | **Run-scoped auth.users cleanup** | teardown deletes them by the slug-derived email pattern (CASCADE handles profiles/children). |
| X4 | **Login-less notification FK** ([[notifications-fk-blocks-loginless]]) | unchanged here, but the run gym's demo member HAS a login, so producers are testable; the FK fix stays a separate scheduled item. |
| X5 | **Belt-ladder exhaustion** | the run gym seeds a **richer ladder** + the student starts at white with clean history every run → promotion always has headroom; delete the 000028 one-shot band-aid. |

---

## 4. Broad-scope durability (the helpers + refactors)

- **`e2e/helpers.ts`:** `visibleShell(page)` (scopes to the visible `(dashboard)` shell — retires the per-slice `:visible/.first()` tax); `expectNotification(page, type, {forUser})` reading the **`/notifications` page** (RLS-scoped full list) — **not** the bell's latest-N; `runId()` / unique-naming util.
- **Refactor all specs** to: operate in the run gym, use `visibleShell`, prove notifications via `/notifications` (drop bell-latest-N assertions), and stop depending on cross-spec accumulated rows.
- **Keep `workers:1`** (serial) — parallelization is a future step once isolation is proven.

---

## 5. Acceptance

1. The **full suite is green across ≥2 consecutive CI runs starting from an arbitrary (dirty) DB state** — determinism is the proof.
2. **Teardown leaves no residue** (no `e2e-*` gym or run-scoped users after a run); the demo `proline-gym` is untouched.
3. No spec depends on shared/accumulated data; notification proofs use `/notifications`; the `(dashboard)` tax is gone (shared helper).
4. `reset`/provision is idempotent; the slug is unique per run; concurrency-safe.
5. The only production-code change is the `submit_public_lead` gym selector (X1); everything else is harness/CI/seed tooling.

---

## 6. Risks & operator dependency

- **Biggest infra slice so far** — touches `e2e.yml` (provision/teardown steps + `SUPABASE_ACCESS_TOKEN` in env), a parameterized seed script, `auth.setup.ts`, `e2e/helpers.ts`, and every spec. Likely to iterate; that's acceptable — it's the investment that stops the 7-run-convergence tax.
- **Operator dependency — RESOLVED (2026-06-10):** **add the existing `SUPABASE_ACCESS_TOKEN` repo secret to the `e2e.yml` job `env`** for provision/teardown (it's a Supabase Management API token; account-wide admin while active; **revoke in the Supabase dashboard once the demo is done** — fully reversible). No new secret.
- **X1 — RESOLVED:** add the **public-lead gym selector** (small prod change; prod defaults to the demo gym, CI targets the run gym).

---

## 7. Prompt scope (seeds the coder prompt)

Parameterized `seed_e2e_gym(slug)` + teardown SQL (admin/Management-API); `e2e.yml` provision/teardown steps + `SUPABASE_ACCESS_TOKEN` env + concurrency group; `submit_public_lead` gym selector (X1); `auth.setup.ts` run-scoped login; `e2e/helpers.ts` (visibleShell + `/notifications` proof + runId); refactor all specs; richer belt ladder + remove the 000028 band-aid. Acceptance = §5 (green across consecutive dirty-DB runs, clean teardown). Drag read on whether ephemeral isolation actually killed the flakiness tax.

---

*Awaiting sign-off (esp. the §6 operator dependency + the X1 prod touch). Then I write the prompt; it runs next (before D1), branching off `main`. After it lands, D1 builds on a deterministic suite.*
