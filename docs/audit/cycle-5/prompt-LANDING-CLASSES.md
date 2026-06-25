# CODER PROMPT LANDING-CLASSES — the public landing must show the class schedule (diagnose-first; it's wired but not rendering)

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-landing-classes` off `main`. **User-reported bug (customer-facing):** "this [classes] list is not showing on the landing page." **Benchmark gap (V1 acquisition):** the public landing is the top-of-funnel; a gym with no visible schedule reads as dead. Roadmap: leaf-surface fix on the marketing path ([[strangle-validated-leaf-rot]]).

## Why — recon says the code is wired; the bug is runtime
The classes section **exists and is already on the page**, and its query is anon-legal — so this is **not** a missing feature; something stops it rendering with data on the live site:
- Landing renders `ScheduleSection` — [`src/app/[locale]/(marketing)/page.tsx`](src/app/[locale]/(marketing)/page.tsx) (~:59).
- `ScheduleSection` fetches classes anon-side — [`src/components/marketing/ScheduleSection.tsx`](src/components/marketing/ScheduleSection.tsx) (~:42–49: `classes.select('… schedules:class_schedules(…)').eq('gym_id', gym.id).eq('is_active', true)`) and renders a day/time grid (~:85–139).
- Anon read is permitted — `classes_public_read` + class_schedules grant (000035:70–76); gym resolved via `get_public_gym(slug)` / `getLandingGym` ([`src/lib/marketing/gym.ts`](src/lib/marketing/gym.ts)).

## Step 1 — DIAGNOSE (report the actual cause before fixing)
Determine **why it's empty/hidden on the live site** (`proline-gym-production` — the live host, [[railway-prod-url]]). Check the strong candidates, in order:
1. **Prod CSP / render mode** ([[prod-csp-strict-dynamic-needs-dynamic-render]]): if `ScheduleSection`'s fetch runs **client-side** and the marketing page is **statically rendered**, the per-request CSP nonce is missing → scripts blocked → the fetch never runs in prod (but works in dev). Confirm whether the section is a server fetch (async server component) or a client `useEffect` fetch, and whether the route is static vs dynamic.
2. **Empty query on the live gym**: does the anon query actually return rows for the live gym? Check the live `proline-gym`'s `classes` are `is_active = true`, have linked `class_schedules`, and that `getLandingGym(slug)` resolves the **right** `gym_id` (slug match). (The demo reseed seeds 6 classes incl. one today — [[demo-reseed-function]], mig 000060 — so data should exist; confirm `is_active`.)
3. **Conditional/empty-state**: does `ScheduleSection` render nothing (or collapse) when the query returns 0 rows, hiding any error?

Write the diagnosis in the report (which candidate it was + the evidence).

## Step 2 — FIX (minimal, matched to the diagnosis)
Apply the smallest fix for the actual cause — e.g.:
- if CSP/static: make the section a **server-side fetch** and/or the route **dynamic render** so the classes are fetched server-side (per [[prod-csp-strict-dynamic-needs-dynamic-render]] — don't render html/body in a nested layout);
- if data: surface the real reason (don't silently render empty) — but **do not** change RLS (anon read is already correct) or flip live data blindly;
- if conditional: render the schedule when rows exist + a sensible empty-state otherwise.
Keep it **frontend / render-path** — **no RLS change** (000035 already allows anon read), no new migration unless the diagnosis proves a data-model gap (then additive + via VF, flagged).

## Out of scope
INV-LABEL / CYCLE-VIZ; redesigning the landing; changing what other marketing sections do; touching auth/RLS.

## Verify
1. The **live-style** landing (anon, no session) renders the **class schedule with real class names + times** for the active gym, in `/ar` (RTL) + `/en` (+ `/fr` if present).
2. The diagnosis is proven (the fix addresses the named root cause, not a guess).
3. **Validate with a TARGETED e2e run** (E2E-TIERED): `gh workflow run e2e.yml --ref prompt-landing-classes -f projects="<the landing/marketing project>"` — assert (not snapshot) the schedule section renders ≥1 class name anon. No full-suite slot.

## Acceptance
1. Public landing shows the class schedule with data for the active gym, anon, `/ar` + `/en`; root cause diagnosed + minimally fixed (render-path/frontend; no RLS change); green on a **targeted** run (run ID/URL).

## Hygiene
Branch `prompt-landing-classes` off `main`; **dev port 3000**; scoped `git add`; **no Claude/Co-Authored-By trailer**; **never weaken RLS**; **diagnose before fixing**; **validate TARGETED, not full** (cost); **DO NOT merge** — report **"LANDING-CLASSES ready"** + the diagnosis + the targeted run ID; the auditor merges (after ISO-DB).

## Update the progress file
Append to `docs/audit/audit-cycle-update.md` → `## Cycle 6 / LANDING-CLASSES — public landing shows the class schedule`: the **diagnosis** (root cause + evidence), the minimal fix, the surfaces touched, the targeted run ID, an explicit **"public landing renders classes anon, /ar + /en, root-caused not guessed, no RLS change: PASS/FAIL"** line, and a DRAG READ (the landing is top-of-funnel; an empty schedule reads as a dead gym).
